/**
 * Test-side access to the GreenMail container started by `global-setup.ts`:
 * fresh users through its REST API, and messages dropped in with IMAP APPEND.
 * Only synthetic data goes in.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { ImapFlow } from 'imapflow';
import { inject } from 'vitest';

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
