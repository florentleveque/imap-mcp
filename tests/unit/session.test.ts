import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Account } from '../../src/config.js';
import { withClient, withMailbox } from '../../src/imap/session.js';
import { FakeMailClient, opener } from './fakes/mail-client.js';

const PASSWORD = 'sentinel-password-7f3a';

const account: Account = {
  name: 'perso',
  host: 'imap.example.test',
  port: 993,
  security: 'tls',
  user: 'reader@example.test',
};

const passwords = async () => PASSWORD;

function setup(client = new FakeMailClient()) {
  const { opened, openClient } = opener(client);
  return { client, opened, deps: { passwords, openClient } };
}

const errorWith = (props: Record<string, unknown>, message = 'imapflow says no') =>
  Object.assign(new Error(message), props);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'imap-mcp-session-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('withClient', () => {
  it('connects with the account password, runs the work, then logs out', async () => {
    const { client, opened, deps } = setup();

    const result = await withClient(account, deps, async () => {
      client.calls.push('work');
      return 42;
    });

    expect(result).toBe(42);
    expect(opened[0]?.auth).toEqual({ user: 'reader@example.test', pass: PASSWORD });
    expect(client.calls).toEqual(['connect (error listener set)', 'work', 'logout']);
  });

  it('swallows errors emitted after connect, which would otherwise crash the process', async () => {
    const { client, deps } = setup();
    await withClient(account, deps, async () => undefined);

    expect(() => client.listeners.get('error')?.(new Error('socket reset'))).not.toThrow();
  });

  it('logs out even when the work fails', async () => {
    const { client, deps } = setup();

    await expect(
      withClient(account, deps, async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    expect(client.calls.at(-1)).toBe('logout');
  });

  it('closes the socket when the logout fails, and keeps the result', async () => {
    const { client, deps } = setup();
    client.logoutError = new Error('connection gone');

    await expect(withClient(account, deps, async () => 'done')).resolves.toBe('done');
    expect(client.calls.slice(-2)).toEqual(['logout', 'close']);
  });

  it('reads the CA file and trusts it', async () => {
    const caFile = join(dir, 'ca.pem');
    await writeFile(caFile, 'PEM DATA');
    const { opened, deps } = setup();

    await withClient({ ...account, caFile }, deps, async () => undefined);

    expect(opened[0]?.tls?.ca).toContain('PEM DATA');
  });

  it('says which CA file it cannot read', async () => {
    const caFile = join(dir, 'missing.pem');
    const { deps } = setup();

    await expect(withClient({ ...account, caFile }, deps, async () => undefined)).rejects.toThrow(
      `Cannot read the CA file ${caFile} of account "perso" (ENOENT).`,
    );
  });

  describe('when the connection fails', () => {
    const cases: [string, unknown, string][] = [
      [
        'a refused login',
        errorWith({ authenticationFailed: true }),
        'Authentication failed for account "perso" (user reader@example.test).',
      ],
      [
        'a missing STARTTLS',
        errorWith({ tlsFailed: true }, 'Server does not support STARTTLS'),
        'Cannot secure the connection to imap.example.test:993: Server does not support STARTTLS. imap-mcp never falls back to cleartext.',
      ],
      ...[
        'SELF_SIGNED_CERT_IN_CHAIN',
        'DEPTH_ZERO_SELF_SIGNED_CERT',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      ].map((code): [string, unknown, string] => [
        code,
        errorWith({ code }),
        `The TLS certificate of imap.example.test could not be verified (${code}). If the server uses a private CA, set caFile for account "perso".`,
      ]),
      [
        'a certificate refused during STARTTLS, which imapflow also marks tlsFailed',
        errorWith(
          { tlsFailed: true, code: 'SELF_SIGNED_CERT_IN_CHAIN' },
          'self-signed certificate in certificate chain',
        ),
        'The TLS certificate of imap.example.test could not be verified (SELF_SIGNED_CERT_IN_CHAIN). If the server uses a private CA, set caFile for account "perso".',
      ],
      [
        'CERT_HAS_EXPIRED',
        errorWith({ code: 'CERT_HAS_EXPIRED' }),
        "The TLS certificate of imap.example.test could not be verified (CERT_HAS_EXPIRED). It has expired: the server's administrator has to renew it.",
      ],
      [
        'CERT_NOT_YET_VALID',
        errorWith({ code: 'CERT_NOT_YET_VALID' }),
        'The TLS certificate of imap.example.test could not be verified (CERT_NOT_YET_VALID). It is not valid yet: check the clock of this computer.',
      ],
      [
        'ERR_TLS_CERT_ALTNAME_INVALID',
        errorWith({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }),
        'The TLS certificate of imap.example.test could not be verified (ERR_TLS_CERT_ALTNAME_INVALID). It names another host: check the host of account "perso".',
      ],
      ...[
        'ECONNREFUSED',
        'ENOTFOUND',
        'EAI_AGAIN',
        'ETIMEDOUT',
        'ECONNRESET',
        'CONNECT_TIMEOUT',
        'GREETING_TIMEOUT',
        'EConnectionClosed',
      ].map((code): [string, unknown, string] => [
        code,
        errorWith({ code }),
        `Could not reach imap.example.test:993 (${code}).`,
      ]),
    ];

    it.each(cases)('explains %s without the password', async (_label, error, message) => {
      const { client, deps } = setup();
      client.connectError = error;

      const failure = withClient(account, deps, async () => undefined);

      await expect(failure).rejects.toThrow(message);
      await expect(failure).rejects.not.toThrow(PASSWORD);
      expect(client.calls).toEqual(['connect (error listener set)', 'close']);
    });

    it('passes any other error through unchanged', async () => {
      const { client, deps } = setup();
      const error = errorWith({ code: 'SOMETHING_ELSE' });
      client.connectError = error;

      await expect(withClient(account, deps, async () => undefined)).rejects.toBe(error);
    });

    it('passes a non-error value through unchanged', async () => {
      const { client, deps } = setup();
      client.connectError = 'odd';

      await expect(withClient(account, deps, async () => undefined)).rejects.toBe('odd');
    });
  });
});

describe('withMailbox', () => {
  it('opens the folder read-only and releases it after the work', async () => {
    const { client, deps } = setup();

    await withMailbox(account, 'INBOX', deps, async () => {
      client.calls.push('work');
    });

    expect(client.calls).toEqual([
      'connect (error listener set)',
      'lock INBOX {"readOnly":true}',
      'work',
      'release INBOX',
      'logout',
    ]);
  });

  it('releases the folder even when the work fails', async () => {
    const { client, deps } = setup();

    await expect(
      withMailbox(account, 'INBOX', deps, async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    expect(client.calls.slice(-2)).toEqual(['release INBOX', 'logout']);
  });

  it('names a missing folder and points to list-folders', async () => {
    const { client, deps } = setup();
    client.lockError = errorWith({ mailboxMissing: true });

    await expect(withMailbox(account, 'Nope', deps, async () => undefined)).rejects.toThrow(
      'Folder "Nope" does not exist in account "perso". list-folders shows the folders.',
    );
    expect(client.calls.at(-1)).toBe('logout');
  });

  it('passes a non-error lock failure through unchanged', async () => {
    const { client, deps } = setup();
    client.lockError = 'odd';

    await expect(withMailbox(account, 'INBOX', deps, async () => undefined)).rejects.toBe('odd');
  });

  it('passes other lock errors through unchanged', async () => {
    const { client, deps } = setup();
    const error = errorWith({ code: 'LockTimeout' });
    client.lockError = error;

    await expect(withMailbox(account, 'INBOX', deps, async () => undefined)).rejects.toBe(error);
  });
});
