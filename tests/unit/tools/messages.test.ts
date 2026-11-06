import { afterEach, describe, expect, it } from 'vitest';

import { UNTRUSTED_NOTICE } from '../../../src/untrusted.js';
import { fixtureMessage } from '../fixtures.js';
import { toolServer } from '../helpers.js';

let server: Awaited<ReturnType<typeof toolServer>> | undefined;
afterEach(() => server?.cleanup());

async function withMailbox() {
  server = await toolServer();
  server.client.messages = [
    fixtureMessage('plain', 3, { flags: ['\\Seen'] }),
    fixtureMessage('attachment', 7, { flags: ['\\Flagged'] }),
    fixtureMessage('alternative', 12),
  ];
  server.client.searchResult = [3, 7, 12];
  return server;
}

describe('list-messages', () => {
  it('summarises the newest messages of INBOX, newest first, as untrusted data', async () => {
    const server = await withMailbox();

    expect(await server.json('list-messages', { account: 'perso' })).toStrictEqual({
      notice: UNTRUSTED_NOTICE,
      account: 'perso',
      folder: 'INBOX',
      total: 3,
      messages: [
        {
          uid: 12,
          date: '2026-11-02T11:00:00.000Z',
          from: 'Bob <bob@example.test>',
          to: ['reader@example.test'],
          subject: 'Alternative',
          seen: false,
          flagged: false,
          size: 442,
          hasAttachments: false,
        },
        {
          uid: 7,
          date: '2026-11-02T12:00:00.000Z',
          from: 'Alice Example <alice@example.test>',
          to: ['reader@example.test'],
          subject: 'Report attached',
          seen: false,
          flagged: true,
          size: 509,
          hasAttachments: true,
        },
        {
          uid: 3,
          date: '2026-11-02T09:00:00.000Z',
          from: 'Alice Example <alice@example.test>',
          to: ['Reader <reader@example.test>'],
          subject: 'Plain text',
          seen: true,
          flagged: false,
          size: 313,
          hasAttachments: false,
        },
      ],
    });
  });

  it('opens the folder read-only, searches, then fetches only the newest UIDs', async () => {
    const server = await withMailbox();
    server.client.searchResult = Array.from({ length: 50 }, (_, index) => index + 1);

    await server.json('list-messages', { account: 'perso', folder: 'Archives', limit: 2 });

    expect(server.client.calls).toStrictEqual([
      'connect (error listener set)',
      'lock Archives {"readOnly":true}',
      'search {"all":true} {"uid":true}',
      'fetch [50,49] uid,envelope,flags,internalDate,size,bodyStructure {"uid":true}',
      'release Archives',
      'logout',
    ]);
  });

  it('reports the total of matching messages beyond the limit', async () => {
    const server = await withMailbox();

    const { total, messages } = (await server.json('list-messages', {
      account: 'perso',
      limit: 1,
    })) as { total: number; messages: { uid: number }[] };

    expect(total).toBe(3);
    expect(messages.map((message) => message.uid)).toStrictEqual([12]);
  });

  it('filters on unread messages and on the received date', async () => {
    const server = await withMailbox();

    await server.json('list-messages', { account: 'perso', unseenOnly: true, since: '2026-11-01' });

    expect(server.client.calls).toContain(
      'search {"since":"2026-11-01","seen":false} {"uid":true}',
    );
  });

  it('skips the fetch when nothing matches', async () => {
    const server = await withMailbox();
    server.client.searchResult = [];

    expect(await server.json('list-messages', { account: 'perso' })).toMatchObject({
      total: 0,
      messages: [],
    });
    expect(server.client.calls.some((call) => call.startsWith('fetch'))).toBe(false);
  });

  it('reports a search the server refused', async () => {
    const server = await withMailbox();
    server.client.searchResult = false;

    expect(await server.error('list-messages', { account: 'perso' })).toBe(
      'The IMAP server refused the search.',
    );
  });

  it.each([
    [{ limit: 0 }],
    [{ limit: 101 }],
    [{ limit: 2.5 }],
    [{ since: '02/11/2026' }],
    [{ folder: '' }],
    [{ from: 'x' }],
  ])('rejects the arguments %j', async (args) => {
    const server = await withMailbox();

    expect(await server.error('list-messages', { account: 'perso', ...args })).toMatch(
      /^Input validation error: /,
    );
  });
});

describe('search-messages', () => {
  it('passes every criterion to the server search', async () => {
    const server = await withMailbox();

    await server.json('search-messages', {
      account: 'perso',
      from: 'alice',
      to: 'reader',
      subject: 'report',
      body: 'invoice',
      since: '2026-10-01',
      before: '2026-11-03',
      unseenOnly: true,
    });

    expect(server.client.calls).toContain(
      'search {"from":"alice","to":"reader","subject":"report","body":"invoice","since":"2026-10-01","before":"2026-11-03","seen":false} {"uid":true}',
    );
  });

  it('returns the matches like list-messages, newest first', async () => {
    const server = await withMailbox();
    server.client.searchResult = [3, 7];

    const result = (await server.json('search-messages', {
      account: 'perso',
      folder: 'INBOX',
      subject: 'a',
      limit: 5,
    })) as { notice: string; total: number; messages: { uid: number }[] };

    expect(result.notice).toBe(UNTRUSTED_NOTICE);
    expect(result.total).toBe(2);
    expect(result.messages.map((message) => message.uid)).toStrictEqual([7, 3]);
  });

  it('accepts unseenOnly as the only criterion', async () => {
    const server = await withMailbox();

    await server.json('search-messages', { account: 'perso', unseenOnly: true });

    expect(server.client.calls).toContain('search {"seen":false} {"uid":true}');
  });

  it('asks for at least one criterion', async () => {
    const server = await withMailbox();

    expect(await server.error('search-messages', { account: 'perso', unseenOnly: false })).toMatch(
      /Give at least one of from, to, subject, body, since, before or unseenOnly; list-messages lists a folder without criteria\./,
    );
  });
});

describe('message summaries', () => {
  it('falls back to the received date when the Date header cannot be read', async () => {
    server = await toolServer();
    const message = fixtureMessage('plain', 1, { internalDate: new Date('2026-11-05T08:00:00Z') });
    message.envelope.date = 'not a date' as never;
    server.client.messages = [message];
    server.client.searchResult = [1];

    const { messages } = (await server.json('list-messages', { account: 'perso' })) as {
      messages: { date: string }[];
    };

    expect(messages[0]?.date).toBe('2026-11-05T08:00:00.000Z');
  });

  it('copes with a message without sender, recipients or subject', async () => {
    server = await toolServer();
    const message = fixtureMessage('plain', 1);
    message.envelope = { date: message.envelope.date } as never;
    server.client.messages = [message];
    server.client.searchResult = [1];

    const { messages } = (await server.json('list-messages', { account: 'perso' })) as {
      messages: Record<string, unknown>[];
    };

    expect(messages[0]).toMatchObject({ from: '', to: [], subject: '' });
  });

  it('shows an address without a display name, and a group name without an address', async () => {
    server = await toolServer();
    const message = fixtureMessage('plain', 1);
    message.envelope.from = [{ address: 'bare@example.test' }];
    message.envelope.to = [{ name: 'Undisclosed recipients', address: '' }, { address: '' }];
    server.client.messages = [message];
    server.client.searchResult = [1];

    const { messages } = (await server.json('list-messages', { account: 'perso' })) as {
      messages: Record<string, unknown>[];
    };

    expect(messages[0]).toMatchObject({
      from: 'bare@example.test',
      to: ['Undisclosed recipients', ''],
    });
  });

  it('reports no attachment for a message the server gave no structure for', async () => {
    server = await toolServer();
    const { bodyStructure: _structure, ...message } = fixtureMessage('attachment', 1);
    server.client.messages = [message as never];
    server.client.searchResult = [1];

    const { messages } = (await server.json('list-messages', { account: 'perso' })) as {
      messages: Record<string, unknown>[];
    };

    expect(messages[0]?.hasAttachments).toBe(false);
  });
});
