import { type AddressInfo, createServer } from 'node:net';

import { beforeAll, describe, expect, it } from 'vitest';

import { withClient, withMailbox } from '../../src/imap/session.js';
import { accountFor, createUser, greenmail, sessionDeps, type TestUser } from './greenmail.js';

let user: TestUser;
beforeAll(async () => {
  user = await createUser();
});

const noop = async () => 'connected';

describe('a session against GreenMail', () => {
  it('connects over TLS when the account trusts the server CA', async () => {
    await expect(withClient(accountFor(user), sessionDeps(user), noop)).resolves.toBe('connected');
  });

  it('refuses a certificate no trusted CA signed: verification cannot be skipped', async () => {
    const account = accountFor(user, { caFile: undefined });

    await expect(withClient(account, sessionDeps(user), noop)).rejects.toThrow(
      /^The TLS certificate of .* could not be verified \(SELF_SIGNED_CERT_IN_CHAIN\)\./,
    );
  });

  it('never falls back to cleartext when STARTTLS is missing', async () => {
    // GreenMail's plain IMAP port does not offer STARTTLS.
    const account = accountFor(user, { security: 'starttls', port: greenmail().imap });

    await expect(withClient(account, sessionDeps(user), noop)).rejects.toThrow(
      /^Cannot secure the connection to .*: Server does not support STARTTLS\. imap-mcp never falls back to cleartext\.$/,
    );
  });

  it('reports a wrong password as an authentication failure, without the password', async () => {
    const wrong = 'wrong-password-sentinel-91c2';
    const failure = withClient(accountFor(user), sessionDeps(user, wrong), noop);

    await expect(failure).rejects.toThrow(
      `Authentication failed for account "test" (user ${user.email}).`,
    );
    await expect(failure).rejects.not.toThrow(wrong);
  });

  it('reports a port nobody listens on as unreachable', async () => {
    // A port just released on the loopback address: refused at once. (Under
    // WSL's mirrored networking, `localhost` drops the SYN instead, which
    // only times out.)
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise((resolve) => server.close(resolve));
    const account = accountFor(user, { host: '127.0.0.1', port });

    await expect(withClient(account, sessionDeps(user), noop)).rejects.toThrow(
      `Could not reach 127.0.0.1:${port} (ECONNREFUSED).`,
    );
  });

  it('names a folder that does not exist', async () => {
    await expect(withMailbox(accountFor(user), 'Nope', sessionDeps(user), noop)).rejects.toThrow(
      'Folder "Nope" does not exist in account "test". list-folders shows the folders.',
    );
  });
});
