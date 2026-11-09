import { afterEach, describe, expect, it } from 'vitest';

import { toolServer } from '../helpers.js';

let server: Awaited<ReturnType<typeof toolServer>> | undefined;
afterEach(() => server?.cleanup());

// Shaped like imapflow's list() entries.
const entry = (path: string, extra: Record<string, unknown> = {}) => ({
  path,
  pathAsListed: path,
  name: path.split('/').at(-1),
  delimiter: '/',
  parent: [],
  parentPath: '',
  flags: new Set<string>(),
  listed: true,
  subscribed: true,
  ...extra,
});

describe('list-folders', () => {
  it('lists the folders of the account', async () => {
    server = await toolServer();
    server.client.folders = [
      entry('INBOX', { specialUse: '\\Inbox', specialUseSource: 'name' }),
      entry('Archives/2026', { subscribed: false }),
    ];

    expect(await server.json('list-folders', { account: 'perso' })).toEqual({
      account: 'perso',
      folders: [
        { path: 'INBOX', name: 'INBOX', subscribed: true, selectable: true },
        { path: 'Archives/2026', name: '2026', subscribed: false, selectable: true },
      ],
    });
    expect(server.client.calls).toEqual(['connect (error listener set)', 'list', 'logout']);
  });

  it('keeps a special use only when the server declared it (SPECIAL-USE), never a guess from the name', async () => {
    server = await toolServer();
    server.client.folders = [
      entry('Corbeille', { specialUse: '\\Trash', specialUseSource: 'extension' }),
      entry('Sent', { specialUse: '\\Sent', specialUseSource: 'name' }),
      entry('Junk', { specialUse: '\\Junk', specialUseSource: 'user' }),
    ];

    const { folders } = (await server.json('list-folders', { account: 'perso' })) as {
      folders: Record<string, unknown>[];
    };

    expect(folders.map((folder) => folder.specialUse)).toEqual(['\\Trash', undefined, undefined]);
  });

  it.each(['\\Noselect', '\\NonExistent'])(
    'marks a folder flagged %s as one that cannot be opened',
    async (flag) => {
      server = await toolServer();
      server.client.folders = [entry('Shared', { flags: new Set([flag, '\\HasChildren']) })];

      const { folders } = (await server.json('list-folders', { account: 'perso' })) as {
        folders: Record<string, unknown>[];
      };

      expect(folders[0]?.selectable).toBe(false);
    },
  );

  it('names the configured accounts when the account is unknown', async () => {
    server = await toolServer();

    expect(await server.error('list-folders', { account: 'other' })).toBe(
      'Unknown account "other". Configured accounts: perso.',
    );
    expect(server.client.calls).toEqual([]);
  });

  it('refuses a call without an account', async () => {
    server = await toolServer();

    expect(await server.error('list-folders', {})).toMatch(/^Input validation error: /);
  });
});
