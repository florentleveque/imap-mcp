import { afterEach, describe, expect, it } from 'vitest';

import { UNTRUSTED_NOTICE } from '../../../src/untrusted.js';
import { type FakeMessage, fixtureMessage } from '../fixtures.js';
import { toolServer } from '../helpers.js';

let server: Awaited<ReturnType<typeof toolServer>> | undefined;
afterEach(() => server?.cleanup());

async function serving(...messages: FakeMessage[]) {
  server = await toolServer();
  server.client.messages = messages;
  return server;
}

const read = async (uid: number) =>
  (await server?.json('read-message', { account: 'perso', uid })) as Record<string, unknown>;

describe('read-message', () => {
  it('returns the headers, the text body and the attachments, as untrusted data', async () => {
    await serving(fixtureMessage('attachment', 7, { flags: ['\\Seen'] }));

    expect(await read(7)).toStrictEqual({
      notice: UNTRUSTED_NOTICE,
      account: 'perso',
      folder: 'INBOX',
      uid: 7,
      messageId: '<attachment@example.test>',
      date: '2026-11-02T12:01:00.000Z',
      from: 'Alice Example <alice@example.test>',
      to: ['reader@example.test'],
      cc: [],
      replyTo: ['Alice Example <alice@example.test>'],
      subject: 'Report attached',
      seen: true,
      flagged: false,
      size: 509,
      body: { format: 'text', text: 'See the report.', truncated: false },
      attachments: [
        {
          part: '2',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          size: 183,
          inline: false,
        },
      ],
    });
  });

  it('reads the folder read-only and downloads only the body part', async () => {
    const server = await serving(fixtureMessage('attachment', 7));

    await server.json('read-message', { account: 'perso', folder: 'Archives', uid: 7 });

    expect(server.client.calls).toStrictEqual([
      'connect (error listener set)',
      'lock Archives {"readOnly":true}',
      'fetch [7] uid,envelope,flags,internalDate,size,bodyStructure {"uid":true}',
      'download 7 1 {"uid":true,"maxBytes":2097153,"decodeText":false}',
      'release Archives',
      'logout',
    ]);
  });

  it('turns CRLF line ends into LF and keeps decoded characters', async () => {
    await serving(fixtureMessage('plain', 1));

    expect((await read(1)).body).toStrictEqual({
      format: 'text',
      text: 'Café at nine.\nSecond line.',
      truncated: false,
    });
  });

  it('gives the copies and the reply address', async () => {
    await serving(fixtureMessage('alternative', 2));

    expect(await read(2)).toMatchObject({
      cc: ['Carol <carol@example.test>'],
      replyTo: ['replies@example.test'],
      body: { format: 'text', text: 'Plain version.' },
    });
  });

  it('converts an HTML-only body to text, links kept and images dropped', async () => {
    await serving(fixtureMessage('html-only', 3));

    expect((await read(3)).body).toStrictEqual({
      format: 'html',
      text: 'WEEKLY NEWS\n\nRead the issue [https://example.test/n].',
      truncated: false,
    });
  });

  it('says when a message has no text body at all', async () => {
    const message = fixtureMessage('attachment', 4);
    message.bodyStructure = message.bodyStructure.childNodes?.[1] as never;
    await serving(message);

    expect((await read(4)).body).toStrictEqual({ format: 'none', text: '', truncated: false });
  });

  it('cuts a very long text and says so', async () => {
    const message = fixtureMessage('plain', 5);
    message.parts['1'] = { meta: {}, content: Buffer.from('x'.repeat(150_000)) };
    await serving(message);

    const { body } = (await read(5)) as { body: { text: string; truncated: boolean } };

    expect(body.text).toHaveLength(100_000);
    expect(body.truncated).toBe(true);
  });

  it('keeps a text of exactly the limit whole', async () => {
    const message = fixtureMessage('plain', 5);
    message.parts['1'] = { meta: {}, content: Buffer.from('x'.repeat(100_000)) };
    await serving(message);

    expect((await read(5)).body).toMatchObject({ truncated: false });
  });

  it('says a body was cut when the download stopped at its byte limit', async () => {
    // Markup only: the converted text is short, but the download was cut.
    const message = fixtureMessage('html-only', 6);
    message.parts['1'] = { meta: {}, content: Buffer.from('<b></b>'.repeat(300_000)) };
    await serving(message);

    const { body } = (await read(6)) as {
      body: { format: string; text: string; truncated: boolean };
    };

    expect(body.text.length).toBeLessThan(10);
    expect(body).toMatchObject({ format: 'html', truncated: true });
  });

  it('keeps a body of exactly the byte limit whole', async () => {
    const message = fixtureMessage('html-only', 6);
    message.parts['1'] = { meta: {}, content: Buffer.from(' '.repeat(2 * 1024 * 1024)) };
    await serving(message);

    expect((await read(6)).body).toMatchObject({ format: 'html', truncated: false });
  });

  it('copes with a message without message id, copies or reply address', async () => {
    const message = fixtureMessage('plain', 9);
    message.envelope = { date: message.envelope.date } as never;
    await serving(message);

    expect(await read(9)).toMatchObject({ messageId: '', cc: [], replyTo: [] });
  });

  it('reads a message the server gave no structure for as one without body or attachment', async () => {
    const { bodyStructure: _structure, ...message } = fixtureMessage('attachment', 10);
    await serving(message as never);

    expect(await read(10)).toMatchObject({
      body: { format: 'none', text: '', truncated: false },
      attachments: [],
    });
  });

  it('treats a part the server does not return as empty', async () => {
    const message = fixtureMessage('plain', 8);
    message.parts = {};
    await serving(message);

    expect((await read(8)).body).toStrictEqual({ format: 'text', text: '', truncated: false });
  });

  it('names a UID that is not in the folder', async () => {
    const server = await serving();

    expect(await server.error('read-message', { account: 'perso', uid: 99 })).toBe(
      'No message with UID 99 in folder "INBOX". list-messages and search-messages give the UIDs.',
    );
  });

  it.each([{ uid: 0 }, { uid: 1.5 }, { uid: '7' }, {}])('rejects %j', async (args) => {
    const server = await serving();

    expect(await server.error('read-message', { account: 'perso', ...args })).toMatch(
      /^Input validation error: /,
    );
  });
});
