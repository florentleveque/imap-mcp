import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { UNTRUSTED_NOTICE } from '../../../src/untrusted.js';
import { fixtureMessage } from '../fixtures.js';
import { ACCOUNT, type ToolResult, toolServer } from '../helpers.js';

let server: Awaited<ReturnType<typeof toolServer>> | undefined;
afterEach(() => server?.cleanup());

const PDF = '%PDF-1.4 synthetic test report';

async function serving(attachments: Record<string, unknown> = {}) {
  server = await toolServer({ accounts: { perso: ACCOUNT }, attachments });
  server.client.messages = [
    fixtureMessage('attachment', 1),
    fixtureMessage('inline-named', 2),
    fixtureMessage('encoded-names', 3),
    fixtureMessage('forwarded', 4),
    fixtureMessage('inline-text', 10),
  ];
  return server;
}

const metadata = (result: ToolResult) => JSON.parse(result.content[0]?.text ?? '');

describe('get-attachment, in the result', () => {
  it('returns a document as an embedded resource, after its description', async () => {
    const server = await serving();

    const result = await server.call('get-attachment', { account: 'perso', uid: 1, part: '2' });

    expect(result.isError).toBeUndefined();
    expect(metadata(result)).toStrictEqual({
      notice: UNTRUSTED_NOTICE,
      account: 'perso',
      folder: 'INBOX',
      uid: 1,
      part: '2',
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: 183,
      inline: false,
      bytes: PDF.length,
    });
    expect(result.content[1]).toStrictEqual({
      type: 'resource',
      resource: {
        uri: 'imap-mcp://attachment/perso/INBOX/1/2',
        mimeType: 'application/pdf',
        blob: Buffer.from(PDF).toString('base64'),
      },
    });
  });

  it('returns a picture as an image', async () => {
    const server = await serving();

    const result = await server.call('get-attachment', { account: 'perso', uid: 2, part: '2' });

    expect(result.content[1]).toStrictEqual({
      type: 'image',
      mimeType: 'image/png',
      data: fixtureMessage('inline-named', 2).parts['2']?.content.toString('base64'),
    });
  });

  it.each([
    ['image/jpeg', 'image'],
    ['image/gif', 'image'],
    ['image/webp', 'image'],
    ['image/svg+xml', 'resource'],
  ])('returns %s as %s', async (contentType, type) => {
    const server = await serving();
    const message = fixtureMessage('inline-named', 5);
    const picture = message.bodyStructure.childNodes?.[1];
    if (picture) picture.type = contentType;
    server.client.messages.push(message);

    const result = await server.call('get-attachment', { account: 'perso', uid: 5, part: '2' });

    expect(result.content[1]?.type).toBe(type);
  });

  it('looks the attachment up in the structure, then downloads it', async () => {
    const server = await serving();

    await server.call('get-attachment', { account: 'perso', uid: 1, part: '2' });

    expect(server.client.calls.slice(2, 4)).toStrictEqual([
      'fetch [1] uid,bodyStructure {"uid":true}',
      'download 1 2 {"uid":true,"maxBytes":1048577,"decodeText":false}',
    ]);
  });

  it('reads a text file without a declared charset as UTF-8', async () => {
    const server = await serving();
    const message = fixtureMessage('encoded-names', 5);
    message.parts['2'] = { meta: {}, content: Buffer.from('café') };
    server.client.messages.push(message);

    const result = await server.call('get-attachment', { account: 'perso', uid: 5, part: '2' });

    expect(result.content[1]).toStrictEqual({ type: 'text', text: 'café' });
  });

  it('returns a text file as text', async () => {
    const server = await serving();

    const result = await server.call('get-attachment', { account: 'perso', uid: 3, part: '2' });

    expect(metadata(result)).toMatchObject({ filename: 'résumé.txt' });
    expect(result.content[1]).toStrictEqual({ type: 'text', text: 'CV text.' });
  });

  it('decodes a text file in the charset it declares', async () => {
    const server = await serving();
    const message = fixtureMessage('encoded-names', 5);
    message.parts['2'] = {
      meta: { charset: 'iso-8859-1' },
      content: Buffer.from([0x63, 0x61, 0x66, 0xe9]),
    };
    server.client.messages.push(message);

    const result = await server.call('get-attachment', { account: 'perso', uid: 5, part: '2' });

    expect(result.content[1]).toStrictEqual({ type: 'text', text: 'café' });
  });

  it('decodes an inline text file sent in Latin-1', async () => {
    const server = await serving();

    const result = await server.call('get-attachment', { account: 'perso', uid: 10, part: '2' });

    expect(result.content[1]).toStrictEqual({ type: 'text', text: 'Café notes.' });
  });

  it('reads a text file as UTF-8 when its charset is unknown', async () => {
    const server = await serving();
    const message = fixtureMessage('encoded-names', 5);
    message.parts['2'] = { meta: { charset: 'x-unheard-of' }, content: Buffer.from('café') };
    server.client.messages.push(message);

    const result = await server.call('get-attachment', { account: 'perso', uid: 5, part: '2' });

    expect(result.content[1]).toStrictEqual({ type: 'text', text: 'café' });
  });

  it('downloads one byte past the limit, then refuses what is too large', async () => {
    const server = await serving({ maxInlineBytes: 10 });

    expect(await server.error('get-attachment', { account: 'perso', uid: 1, part: '2' })).toBe(
      'The attachment is larger than 10 bytes, the attachments.maxInlineBytes limit. Save it with save-attachment instead; that needs attachments.directory in the configuration file.',
    );
    expect(server.client.calls).toContain(
      'download 1 2 {"uid":true,"maxBytes":11,"decodeText":false}',
    );
  });

  it('accepts an attachment of exactly the limit', async () => {
    const server = await serving({ maxInlineBytes: PDF.length });

    const result = await server.call('get-attachment', { account: 'perso', uid: 1, part: '2' });

    expect(result.isError).toBeUndefined();
  });

  it('does not repeat the directory hint once a directory is set', async () => {
    const server = await serving({ maxInlineBytes: 10, directory: '/srv/attachments' });

    expect(await server.error('get-attachment', { account: 'perso', uid: 1, part: '2' })).toBe(
      'The attachment is larger than 10 bytes, the attachments.maxInlineBytes limit. Save it with save-attachment instead.',
    );
  });
});

describe('save-attachment', () => {
  it('saves under the attachments directory, with a safe name, and never overwrites', async () => {
    const server = await serving();
    const directory = join(server.dir, 'saved');
    await server.cleanup();
    const configured = await serving({ directory });

    const first = metadata(
      await configured.call('save-attachment', {
        account: 'perso',
        uid: 3,
        part: '3',
      }),
    );
    const second = metadata(
      await configured.call('save-attachment', {
        account: 'perso',
        uid: 3,
        part: '3',
      }),
    );

    expect(first).toMatchObject({
      notice: UNTRUSTED_NOTICE,
      filename: 'facture n°1.pdf',
      savedTo: join(directory, 'facture n°1.pdf'),
      bytes: 16,
    });
    expect(second.savedTo).toBe(join(directory, 'facture n°1 (1).pdf'));
    expect(await readFile(first.savedTo, 'utf8')).toBe('%PDF-1.4 invoice');
    expect((await readdir(directory)).length).toBe(2);
    expect(configured.client.calls).toContain('download 3 3 {"uid":true,"decodeText":false}');
  });

  it('saves an inline text file with the bytes it was sent in', async () => {
    const server = await serving();
    const directory = join(server.dir, 'saved');
    await server.cleanup();
    const configured = await serving({ directory });

    const saved = metadata(
      await configured.call('save-attachment', {
        account: 'perso',
        uid: 10,
        part: '2',
      }),
    );

    expect(await readFile(saved.savedTo, 'latin1')).toBe('Café notes.');
    expect(saved.bytes).toBe(11);
  });

  it('names an attachment that has no name after its message and part', async () => {
    const server = await serving();
    const directory = join(server.dir, 'saved');
    await server.cleanup();
    const configured = await serving({ directory });

    const saved = metadata(
      await configured.call('save-attachment', {
        account: 'perso',
        uid: 4,
        part: '2',
      }),
    );

    expect(saved.savedTo).toBe(join(directory, 'attachment-4-2'));
  });

  it('only saves a part that read-message lists as an attachment', async () => {
    const server = await serving();
    const directory = join(server.dir, 'saved');
    await server.cleanup();
    const configured = await serving({ directory });

    expect(await configured.error('save-attachment', { account: 'perso', uid: 1, part: '1' })).toBe(
      'Message 1 has no attachment with part "1". read-message lists its attachments.',
    );
  });

  it('needs an attachments directory', async () => {
    const server = await serving();

    expect(await server.error('save-attachment', { account: 'perso', uid: 1, part: '2' })).toBe(
      'Saving attachments needs attachments.directory in the configuration file.',
    );
    expect(server.client.calls).toStrictEqual([]);
  });
});

describe('get-attachment, refusals', () => {
  it('only serves a part that read-message lists as an attachment', async () => {
    const server = await serving();

    expect(await server.error('get-attachment', { account: 'perso', uid: 1, part: '1' })).toBe(
      'Message 1 has no attachment with part "1". read-message lists its attachments.',
    );
  });

  it('names a UID that is not in the folder', async () => {
    const server = await serving();

    expect(await server.error('get-attachment', { account: 'perso', uid: 9, part: '2' })).toMatch(
      /^No message with UID 9 in folder "INBOX"\./,
    );
  });

  it('reports an attachment the server does not return', async () => {
    const server = await serving();
    const message = fixtureMessage('attachment', 6);
    message.parts = {};
    server.client.messages.push(message);

    expect(await server.error('get-attachment', { account: 'perso', uid: 6, part: '2' })).toBe(
      'The server returned no content for part "2" of message 6.',
    );
  });

  it('serves nothing from a message without structure', async () => {
    const server = await serving();
    const { bodyStructure: _structure, ...message } = fixtureMessage('attachment', 7);
    server.client.messages.push(message as never);

    expect(await server.error('get-attachment', { account: 'perso', uid: 7, part: '2' })).toBe(
      'Message 7 has no attachment with part "2". read-message lists its attachments.',
    );
  });

  it.each([{ part: 'TEXT' }, { part: '2.' }, { part: '' }, { mode: 'file' }])(
    'rejects %j',
    async (args) => {
      const server = await serving();

      expect(
        await server.error('get-attachment', { account: 'perso', uid: 1, part: '2', ...args }),
      ).toMatch(/^Input validation error: /);
    },
  );
});
