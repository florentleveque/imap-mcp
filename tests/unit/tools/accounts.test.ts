import { afterEach, describe, expect, it } from 'vitest';

import { ACCOUNT, toolServer } from '../helpers.js';

let server: Awaited<ReturnType<typeof toolServer>> | undefined;
afterEach(() => server?.cleanup());

describe('list-accounts', () => {
  it('lists every configured account, without any secret', async () => {
    server = await toolServer({
      accounts: {
        perso: ACCOUNT,
        work: {
          host: 'mail.example.test',
          security: 'starttls',
          user: 'me@example.test',
          caFile: '/etc/ca.pem',
        },
      },
    });

    expect(await server.json('list-accounts')).toEqual({
      accounts: [
        {
          name: 'perso',
          host: 'imap.example.test',
          port: 993,
          security: 'tls',
          user: 'reader@example.test',
        },
        {
          name: 'work',
          host: 'mail.example.test',
          port: 143,
          security: 'starttls',
          user: 'me@example.test',
        },
      ],
    });
    expect(server.client.calls).toEqual([]);
  });

  it('explains a missing configuration file', async () => {
    server = await toolServer();
    await server.cleanup();

    expect(await server.error('list-accounts')).toMatch(
      /^No configuration file at .*config\.json\./,
    );
  });
});
