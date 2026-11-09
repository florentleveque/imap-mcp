import { readFile } from 'node:fs/promises';

import type { Account } from '../config.js';
import type { PasswordSource } from '../passwords.js';
import type { MailClient, OpenClient } from './client.js';
import { imapOptions } from './options.js';

export interface SessionDeps {
  passwords: PasswordSource;
  openClient: OpenClient;
}

// Node's codes for a certificate chain or name it would not accept.
const CERTIFICATE_CODES = new Set<string | undefined>([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// Node's socket and DNS codes, and imapflow's own timeout and close codes.
const UNREACHABLE_CODES = new Set<string | undefined>([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  'CONNECT_TIMEOUT',
  'GREETING_TIMEOUT',
  'EConnectionClosed',
]);

interface ImapFlowError extends Error {
  code?: string;
  authenticationFailed?: boolean;
  tlsFailed?: boolean;
  mailboxMissing?: boolean;
}

const asImapError = (error: unknown): ImapFlowError | undefined =>
  error instanceof Error ? error : undefined;

/** What the person who configured the account can do about a refused certificate. */
function certificateHint(code: string | undefined, account: Account): string {
  if (code === 'CERT_HAS_EXPIRED')
    return "It has expired: the server's administrator has to renew it.";
  if (code === 'CERT_NOT_YET_VALID')
    return 'It is not valid yet: check the clock of this computer.';
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    return `It names another host: check the host of account "${account.name}".`;
  }
  return `If the server uses a private CA, set caFile for account "${account.name}".`;
}

/** Reword what a failed connect means for the person who configured the account. */
function explainConnectFailure(error: unknown, account: Account): unknown {
  const failure = asImapError(error);
  const where = `${account.host}:${account.port}`;
  if (failure?.authenticationFailed) {
    return new Error(`Authentication failed for account "${account.name}" (user ${account.user}).`);
  }
  // Before tlsFailed: imapflow marks every STARTTLS upgrade error with it,
  // a refused certificate included.
  const code = failure?.code;
  if (CERTIFICATE_CODES.has(code)) {
    return new Error(
      `The TLS certificate of ${account.host} could not be verified (${code}). ${certificateHint(code, account)}`,
    );
  }
  if (failure?.tlsFailed) {
    return new Error(
      `Cannot secure the connection to ${where}: ${failure.message}. imap-mcp never falls back to cleartext.`,
    );
  }
  if (UNREACHABLE_CODES.has(code)) return new Error(`Could not reach ${where} (${code}).`);
  return error;
}

async function readCa(account: Account): Promise<string | undefined> {
  if (account.caFile === undefined) return undefined;
  try {
    return await readFile(account.caFile, 'utf8');
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    throw new Error(
      `Cannot read the CA file ${account.caFile} of account "${account.name}" (${code}).`,
    );
  }
}

/**
 * One authenticated connection for the length of `work`, logged out afterwards
 * whatever happens: tools hold no connection between calls.
 */
export async function withClient<T>(
  account: Account,
  deps: SessionDeps,
  work: (client: MailClient) => Promise<T>,
): Promise<T> {
  const ca = await readCa(account);
  const client = deps.openClient(imapOptions(account, await deps.passwords(account.name), ca));
  // imapflow throws an `error` event nobody listens to: a socket dropping
  // after connect() would crash the server. The failure reaches the caller
  // through the pending command instead.
  client.on('error', () => undefined);
  try {
    await client.connect();
  } catch (error) {
    client.close();
    throw explainConnectFailure(error, account);
  }
  try {
    return await work(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** `withClient`, with `folder` opened read-only (EXAMINE) for the length of `work`. */
export async function withMailbox<T>(
  account: Account,
  folder: string,
  deps: SessionDeps,
  work: (client: MailClient) => Promise<T>,
): Promise<T> {
  return withClient(account, deps, async (client) => {
    let lock: { release(): void };
    try {
      lock = await client.getMailboxLock(folder, { readOnly: true });
    } catch (error) {
      if (asImapError(error)?.mailboxMissing) {
        throw new Error(
          `Folder "${folder}" does not exist in account "${account.name}". list-folders shows the folders.`,
        );
      }
      throw error;
    }
    try {
      return await work(client);
    } finally {
      lock.release();
    }
  });
}
