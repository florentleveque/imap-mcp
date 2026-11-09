import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, type TestUser, toolsFor } from './greenmail.js';

let user: TestUser;
let tools: Awaited<ReturnType<typeof toolsFor>>;

beforeAll(async () => {
  user = await createUser();
  const client = await adminClient(user);
  try {
    // Names imapflow recognises: it guesses \Sent and \Trash from them, and
    // GreenMail declares no SPECIAL-USE attribute.
    await client.mailboxCreate('Sent');
    await client.mailboxCreate('Trash');
  } finally {
    await client.logout();
  }
  tools = await toolsFor(user);
});

afterAll(() => tools.cleanup());

describe('list-folders on GreenMail', () => {
  it('runs where imapflow does guess special uses from names', async () => {
    const client = await adminClient(user);
    try {
      const sent = (await client.list()).find((entry) => entry.path === 'Sent');
      expect(sent).toMatchObject({ specialUse: '\\Sent', specialUseSource: 'name' });
    } finally {
      await client.logout();
    }
  });

  it('lists the folders, with no special use guessed from a name', async () => {
    const { folders } = (await tools.json('list-folders')) as {
      folders: Record<string, unknown>[];
    };

    expect(folders).toEqual(
      expect.arrayContaining([
        { path: 'INBOX', name: 'INBOX', subscribed: true, selectable: true },
        { path: 'Sent', name: 'Sent', subscribed: expect.any(Boolean), selectable: true },
        { path: 'Trash', name: 'Trash', subscribed: expect.any(Boolean), selectable: true },
      ]),
    );
    expect(folders.filter((folder) => 'specialUse' in folder)).toEqual([]);
  });
});
