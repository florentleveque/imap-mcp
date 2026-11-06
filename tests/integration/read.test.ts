import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, seed, type TestUser, toolsFor } from './greenmail.js';
import { rawFixture } from './mail-fixtures.js';

let user: TestUser;
let tools: Awaited<ReturnType<typeof toolsFor>>;
const uid: Record<string, number> = {};

const NAMES = ['plain', 'latin1', 'html-only', 'encoded-names', 'forwarded'];

beforeAll(async () => {
  user = await createUser();
  const uids = await seed(
    user,
    NAMES.map((name) => ({ raw: rawFixture(name) })),
  );
  for (const [index, name] of NAMES.entries()) uid[name] = uids[index] as number;
  tools = await toolsFor(user);
});

afterAll(() => tools.cleanup());

const read = (name: string) => tools.json('read-message', { uid: uid[name] });

describe('read-message on GreenMail', () => {
  it('reads a quoted-printable UTF-8 body', async () => {
    expect(await read('plain')).toMatchObject({
      subject: 'Plain text',
      body: { format: 'text', text: 'Café at nine.\nSecond line.', truncated: false },
    });
  });

  it('reads a Latin-1 body and subject as UTF-8', async () => {
    expect(await read('latin1')).toMatchObject({
      subject: 'Déjà vu',
      body: { format: 'text', text: 'Déjà vu, été.' },
    });
  });

  it('converts an HTML-only body', async () => {
    expect(await read('html-only')).toMatchObject({
      body: { format: 'html', text: 'WEEKLY NEWS\n\nRead the issue [https://example.test/n].' },
    });
  });

  it('decodes encoded names in the headers and the attachment list', async () => {
    expect(await read('encoded-names')).toMatchObject({
      from: 'Zélie <zelie@example.test>',
      subject: 'Résumé et facture',
      attachments: [
        { part: '2', filename: 'résumé.txt', contentType: 'text/plain' },
        { part: '3', filename: 'facture n°1.pdf', contentType: 'application/pdf' },
      ],
    });
  });

  it('lists an embedded message as an attachment', async () => {
    expect(await read('forwarded')).toMatchObject({
      body: { text: 'Forwarding this.' },
      attachments: [{ part: '2', contentType: 'message/rfc822' }],
    });
  });

  it('names a UID that is not there', async () => {
    const result = await tools.call('read-message', { uid: 999 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/^No message with UID 999 in folder "INBOX"\./);
  });

  it('leaves every message unread', async () => {
    const client = await adminClient(user);
    try {
      const status = await client.status('INBOX', { unseen: true });
      expect(status.unseen).toBe(NAMES.length);
    } finally {
      await client.logout();
    }
  });
});
