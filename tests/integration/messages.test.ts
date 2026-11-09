import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, seed, type TestUser, toolsFor } from './greenmail.js';
import { rawFixture } from './mail-fixtures.js';

interface Listed {
  total: number;
  messages: { uid: number; subject: string; seen: boolean; hasAttachments: boolean }[];
}

let user: TestUser;
let tools: Awaited<ReturnType<typeof toolsFor>>;
let uids: number[];

// Received one day apart, from 1 to 4 November; the first one already read.
beforeAll(async () => {
  user = await createUser();
  uids = await seed(user, [
    { raw: rawFixture('plain'), date: new Date('2026-11-01T09:00:00Z'), seen: true },
    { raw: rawFixture('attachment'), date: new Date('2026-11-02T09:00:00Z') },
    { raw: rawFixture('alternative'), date: new Date('2026-11-03T09:00:00Z') },
    { raw: rawFixture('encoded-names'), date: new Date('2026-11-04T09:00:00Z') },
  ]);
  tools = await toolsFor(user);
});

afterAll(() => tools.cleanup());

const subjects = (listed: Listed) => listed.messages.map((message) => message.subject);

describe('list-messages on GreenMail', () => {
  it('lists the newest first, up to the limit, with the total', async () => {
    const listed = (await tools.json('list-messages', { limit: 3 })) as Listed;

    expect(listed.total).toBe(4);
    expect(subjects(listed)).toStrictEqual(['Résumé et facture', 'Alternative', 'Report attached']);
    expect(listed.messages.map((message) => message.uid)).toStrictEqual(uids.slice(1).reverse());
    expect(listed.messages.map((message) => message.hasAttachments)).toStrictEqual([
      true,
      false,
      true,
    ]);
  });

  it('dates each message by its arrival, not by its Date header', async () => {
    const listed = (await tools.json('list-messages', {})) as Listed & {
      messages: { date: string }[];
    };

    expect(listed.messages.map((message) => message.date)).toStrictEqual([
      '2026-11-04T09:00:00.000Z',
      '2026-11-03T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
      '2026-11-01T09:00:00.000Z',
    ]);
  });

  it('keeps only the unread messages', async () => {
    const listed = (await tools.json('list-messages', { unseenOnly: true })) as Listed;

    expect(listed.total).toBe(3);
    expect(listed.messages.every((message) => !message.seen)).toBe(true);
  });

  it('keeps the messages received since a day, that day included', async () => {
    const listed = (await tools.json('list-messages', { since: '2026-11-03' })) as Listed;

    expect(subjects(listed)).toStrictEqual(['Résumé et facture', 'Alternative']);
  });

  it('marks nothing as read', async () => {
    await tools.json('list-messages');

    const client = await adminClient(user);
    try {
      const status = await client.status('INBOX', { unseen: true });
      expect(status.unseen).toBe(3);
    } finally {
      await client.logout();
    }
  });
});

describe('search-messages on GreenMail', () => {
  // GreenMail matches FROM and TO against whole addresses, where RFC 3501
  // (and real servers) match substrings: the address criteria here are whole.
  it.each([
    [{ from: 'alice@example.test' }, ['Report attached', 'Plain text']],
    [{ from: 'zelie@example.test' }, ['Résumé et facture']],
    [
      { to: 'reader@example.test' },
      ['Résumé et facture', 'Alternative', 'Report attached', 'Plain text'],
    ],
    [{ subject: 'REPORT' }, ['Report attached']],
    [{ body: 'Plain version' }, ['Alternative']],
    [{ before: '2026-11-02' }, ['Plain text']],
    [{ since: '2026-11-02', before: '2026-11-04' }, ['Alternative', 'Report attached']],
    [{ from: 'alice@example.test', unseenOnly: true }, ['Report attached']],
  ])('matches %j', async (criteria, expected) => {
    const listed = (await tools.json('search-messages', criteria)) as Listed;

    expect(subjects(listed)).toStrictEqual(expected);
  });
});
