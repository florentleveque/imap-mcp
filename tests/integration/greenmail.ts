/**
 * Test-side access to the GreenMail container started by `global-setup.ts`:
 * fresh users through its REST API, and messages dropped in with IMAP APPEND.
 * Only synthetic data goes in.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ImapFlow } from 'imapflow';
import { inject } from 'vitest';

import type { Account } from '../../src/config.js';
import { openImapFlow } from '../../src/imap/client.js';
import type { SessionDeps } from '../../src/imap/session.js';
import { LoopbackTransport, openSession } from '../unit/server-harness.js';

export const testCaPath = new URL('fixtures/tls/ca.pem', import.meta.url).pathname;
export const testCa = readFileSync(testCaPath, 'utf8');

export function greenmail() {
  return inject('greenmail');
}

export interface TestUser {
  email: string;
  password: string;
}

/** A user of its own for a test file: an empty mailbox no other test touches. */
export async function createUser(): Promise<TestUser> {
  const { host, api } = greenmail();
  const email = `t-${randomUUID()}@example.test`;
  const password = randomUUID();
  const response = await fetch(`http://${host}:${api}/api/user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, login: email, password }),
  });
  if (!response.ok) throw new Error(`GreenMail refused the user: ${response.status}`);
  return { email, password };
}

/** An IMAPS client trusting the test CA, outside the code under test. */
export async function adminClient(user: TestUser): Promise<ImapFlow> {
  const { host, imaps } = greenmail();
  const client = new ImapFlow({
    host,
    port: imaps,
    secure: true,
    tls: { ca: testCa },
    auth: { user: user.email, pass: user.password },
    logger: false,
  });
  await client.connect();
  return client;
}

export interface Seed {
  raw: string;
  folder?: string;
  seen?: boolean;
  date?: Date;
}

/** APPEND each message, in order; returns the UID each one got. */
export async function seed(user: TestUser, messages: Seed[]): Promise<number[]> {
  const client = await adminClient(user);
  try {
    const uids: number[] = [];
    for (const message of messages) {
      const folder = message.folder ?? 'INBOX';
      if (folder !== 'INBOX') await client.mailboxCreate(folder).catch(() => undefined);
      const result = await client.append(
        folder,
        message.raw,
        message.seen ? ['\\Seen'] : [],
        message.date,
      );
      if (!result || result.uid === undefined) throw new Error('APPEND returned no UID');
      uids.push(result.uid);
    }
    return uids;
  } finally {
    await client.logout();
  }
}

/** An imap-mcp account for `user` on the container's IMAPS port, trusting the test CA. */
export function accountFor(user: TestUser, overrides: Partial<Account> = {}): Account {
  const { host, imaps } = greenmail();
  return {
    name: 'test',
    host,
    port: imaps,
    security: 'tls',
    user: user.email,
    caFile: testCaPath,
    ...overrides,
  };
}

/** Session dependencies that answer with `user`'s password, through the real ImapFlow. */
export function sessionDeps(user: TestUser, password = user.password): SessionDeps {
  return { passwords: async () => password, openClient: openImapFlow };
}

/**
 * An MCP server whose configuration names one account, "test", for `user` on
 * GreenMail: tools run end to end, from `tools/call` to the IMAP server.
 */
export async function toolsFor(user: TestUser, attachments?: Record<string, unknown>) {
  const dir = await mkdtemp(join(tmpdir(), 'imap-mcp-it-'));
  const configPath = join(dir, 'config.json');
  const { name: _name, ...account } = accountFor(user);
  await writeFile(configPath, JSON.stringify({ accounts: { test: account }, attachments }));
  const transport = new LoopbackTransport();
  await openSession(transport, { configPath, session: sessionDeps(user) });

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await transport.request('tools/call', {
      name,
      arguments: { account: 'test', ...args },
    });
    if (response.error) throw new Error(`tools/call failed: ${response.error.message}`);
    return response.result as { content: { type: string; text?: string }[]; isError?: boolean };
  };
  return {
    dir,
    call,
    async json(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
      const result = await call(name, args);
      if (result.isError) throw new Error(`${name} failed: ${result.content[0]?.text}`);
      return JSON.parse(result.content[0]?.text ?? '');
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
