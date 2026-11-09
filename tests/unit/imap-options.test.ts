import { ImapFlow } from 'imapflow';
import { describe, expect, it } from 'vitest';

import type { Account } from '../../src/config.js';
import { openImapFlow } from '../../src/imap/client.js';
import { imapOptions } from '../../src/imap/options.js';

const account: Account = {
  name: 'perso',
  host: 'imap.example.test',
  port: 993,
  security: 'tls',
  user: 'reader@example.test',
};

describe('imapOptions', () => {
  it('uses implicit TLS, no logger and no auto-IDLE', () => {
    expect(imapOptions(account, 'pw', undefined)).toEqual({
      host: 'imap.example.test',
      port: 993,
      secure: true,
      auth: { user: 'reader@example.test', pass: 'pw' },
      // Explicit, so NODE_TLS_REJECT_UNAUTHORIZED=0 cannot turn verification off.
      tls: { rejectUnauthorized: true },
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: 20_000,
      socketTimeout: 60_000,
    });
  });

  it('makes STARTTLS mandatory instead of opportunistic', () => {
    const options = imapOptions({ ...account, security: 'starttls', port: 143 }, 'pw', undefined);

    expect(options).toMatchObject({ port: 143, secure: false, doSTARTTLS: true });
  });

  it('adds the configured CA and nothing that would weaken verification', () => {
    const options = imapOptions(account, 'pw', 'PEM');

    expect(options.tls).toEqual({ rejectUnauthorized: true, ca: 'PEM' });
  });
});

describe('openImapFlow', () => {
  it('builds an ImapFlow client without connecting it', () => {
    const client = openImapFlow(imapOptions(account, 'pw', undefined));

    expect(client).toBeInstanceOf(ImapFlow);
    expect(client.usable).toBe(false);
  });
});
