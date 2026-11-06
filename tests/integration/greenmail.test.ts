import { describe, expect, it } from 'vitest';

import { adminClient, createUser, seed } from './greenmail.js';

const RAW = [
  'From: Sender <sender@example.test>',
  'To: Reader <reader@example.test>',
  'Subject: Harness check',
  'Date: Thu, 05 Nov 2026 10:00:00 +0000',
  'Message-ID: <harness@example.test>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello.',
  '',
].join('\r\n');

describe('the GreenMail harness', () => {
  it('serves IMAPS with a certificate the test CA verifies', async () => {
    const user = await createUser();
    const client = await adminClient(user);
    try {
      expect(client.capabilities.has('IMAP4rev1')).toBe(true);
    } finally {
      await client.logout();
    }
  });

  it('keeps each test user in its own mailbox', async () => {
    const first = await createUser();
    const second = await createUser();
    await seed(first, [{ raw: RAW }]);

    const client = await adminClient(second);
    try {
      const status = await client.status('INBOX', { messages: true });
      expect(status.messages).toBe(0);
    } finally {
      await client.logout();
    }
  });
});
