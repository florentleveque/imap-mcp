import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createUser, seed, type TestUser, toolsFor } from './greenmail.js';
import { rawFixture } from './mail-fixtures.js';

let user: TestUser;
let tools: Awaited<ReturnType<typeof toolsFor>>;
let directory: string;
const uid: Record<string, number> = {};

const NAMES = ['attachment', 'inline-named', 'encoded-names', 'inline-text'];

beforeAll(async () => {
  user = await createUser();
  const uids = await seed(
    user,
    NAMES.map((name) => ({ raw: rawFixture(name) })),
  );
  for (const [index, name] of NAMES.entries()) uid[name] = uids[index] as number;
  directory = join(await mkdtemp(join(tmpdir(), 'imap-mcp-it-saved-')), 'saved');
  tools = await toolsFor(user, { directory });
});

afterAll(async () => {
  await tools.cleanup();
  await rm(dirname(directory), { recursive: true, force: true });
});

describe('get-attachment on GreenMail', () => {
  it('returns the original bytes of a document', async () => {
    const result = await tools.call('get-attachment', { uid: uid['attachment'], part: '2' });

    expect(result.content[1]).toMatchObject({
      type: 'resource',
      resource: {
        mimeType: 'application/pdf',
        blob: Buffer.from('%PDF-1.4 synthetic test report').toString('base64'),
      },
    });
  });

  it('returns an inline picture as an image', async () => {
    const result = await tools.call('get-attachment', { uid: uid['inline-named'], part: '2' });

    expect(result.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
  });

  it('returns a text attachment as text', async () => {
    const result = await tools.call('get-attachment', { uid: uid['encoded-names'], part: '2' });

    expect(result.content[1]).toStrictEqual({ type: 'text', text: 'CV text.' });
  });

  it('returns an inline Latin-1 text file as text', async () => {
    const result = await tools.call('get-attachment', { uid: uid['inline-text'], part: '2' });

    expect(result.content[1]).toStrictEqual({ type: 'text', text: 'Café notes.' });
  });

  it('saves an inline text file with the bytes it was sent in', async () => {
    const args = { uid: uid['inline-text'], part: '2', mode: 'file' };

    const saved = (await tools.json('get-attachment', args)) as { savedTo: string };

    expect(await readFile(saved.savedTo)).toStrictEqual(Buffer.from('Café notes.', 'latin1'));
  });

  it('saves twice to two files, under the decoded name, never overwriting', async () => {
    const args = { uid: uid['encoded-names'], part: '3', mode: 'file' };

    const first = (await tools.json('get-attachment', args)) as { savedTo: string };
    const second = (await tools.json('get-attachment', args)) as { savedTo: string };

    expect(first.savedTo).toBe(join(directory, 'facture n°1.pdf'));
    expect(second.savedTo).toBe(join(directory, 'facture n°1 (1).pdf'));
    expect(await readFile(second.savedTo, 'utf8')).toBe('%PDF-1.4 invoice');
    const invoices = (await readdir(directory)).filter((name) => name.startsWith('facture'));
    expect(invoices.sort()).toStrictEqual(['facture n°1 (1).pdf', 'facture n°1.pdf']);
  });
});
