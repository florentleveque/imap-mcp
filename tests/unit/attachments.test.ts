import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { safeFileName, saveUnique } from '../../src/attachments.js';

describe('safeFileName', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['facture n°1.pdf', 'facture n°1.pdf'],
    ['../../etc/passwd', 'etc_passwd'],
    ['..\\..\\Windows\\win.ini', 'Windows_win.ini'],
    ['/absolute/path.txt', 'absolute_path.txt'],
    ['bad<>:"|?*name.txt', 'bad_______name.txt'],
    ['tab\there\u0000.txt', 'tab_here_.txt'],
    ['.hidden', 'hidden'],
    ['trailing. . ', 'trailing'],
    ['  spaced  ', 'spaced'],
    ['CON', '_CON'],
    ['nul.txt', '_nul.txt'],
    ['com1.log', '_com1.log'],
    ['LPT9', '_LPT9'],
    ['console.txt', 'console.txt'],
    ['falcon.txt', 'falcon.txt'],
    ['del\u007fete.txt', 'del_ete.txt'],
    ['a//b', 'a_b'],
    ['invoice\u202efdp.exe', 'invoice_fdp.exe'],
    ['zero\u200bwidth.txt', 'zero_width.txt'],
    ['next\u0085line.txt', 'next_line.txt'],
    ['line\u2028paragraph\u2029.txt', 'line_paragraph_.txt'],
  ])('turns %j into %j', (name, expected) => {
    expect(safeFileName(name, 'fallback')).toBe(expected);
  });

  it.each([undefined, '', '...', '/', ' . '])('falls back when %j leaves nothing', (name) => {
    expect(safeFileName(name, 'attachment-7-2')).toBe('attachment-7-2');
  });

  it('shortens a long name and keeps its extension', () => {
    const name = safeFileName(`${'a'.repeat(300)}.pdf`, 'fallback');

    expect(name).toBe(`${'a'.repeat(196)}.pdf`);
  });

  it('counts the length in bytes, so accented names fit the file system too', () => {
    expect(safeFileName(`${'é'.repeat(150)}.txt`, 'fallback')).toBe(`${'é'.repeat(98)}.txt`);
  });

  it('shortens a long name without extension', () => {
    expect(safeFileName('b'.repeat(300), 'fallback')).toBe('b'.repeat(200));
  });

  it('keeps an extension of up to 32 bytes', () => {
    const ext = `.${'x'.repeat(31)}`;

    expect(safeFileName(`${'a'.repeat(300)}${ext}`, 'fallback')).toBe(`${'a'.repeat(168)}${ext}`);
  });

  it('cuts a longer extension as part of the name', () => {
    const name = `report.${'y'.repeat(32)}${'z'.repeat(300)}`;

    expect(safeFileName(name, 'fallback')).toBe(name.slice(0, 200));
  });

  it('shortens a name whose extension alone is past the limit', () => {
    expect(safeFileName(`report.${'y'.repeat(250)}`, 'fallback')).toBe(`report.${'y'.repeat(193)}`);
  });

  it('shortens a very long name at once', () => {
    expect(safeFileName(`${'a'.repeat(100_000)}.pdf`, 'fallback')).toBe(`${'a'.repeat(196)}.pdf`);
  });
});

describe('saveUnique', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'imap-mcp-save-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const stream = (text: string) => Readable.from([Buffer.from(text)]);

  it('writes the content and says where, creating the directory', async () => {
    const target = join(dir, 'nested', 'attachments');

    const saved = await saveUnique(target, 'report.pdf', stream('PDF bytes'));

    expect(saved).toStrictEqual({ path: join(target, 'report.pdf'), size: 9 });
    expect(await readFile(saved.path, 'utf8')).toBe('PDF bytes');
  });

  it('never overwrites: a second file gets a numbered name', async () => {
    await writeFile(join(dir, 'report.pdf'), 'first');
    await writeFile(join(dir, 'report (1).pdf'), 'second');

    const saved = await saveUnique(dir, 'report.pdf', stream('third'));

    expect(saved.path).toBe(join(dir, 'report (2).pdf'));
    expect(await readFile(join(dir, 'report.pdf'), 'utf8')).toBe('first');
    expect((await readdir(dir)).sort()).toStrictEqual([
      'report (1).pdf',
      'report (2).pdf',
      'report.pdf',
    ]);
  });

  it('numbers a name without extension', async () => {
    await writeFile(join(dir, 'notes'), 'first');

    expect((await saveUnique(dir, 'notes', stream('x'))).path).toBe(join(dir, 'notes (1)'));
  });

  it('removes a partial file when the download fails', async () => {
    const failing = new Readable({
      read() {
        this.destroy(new Error('connection lost'));
      },
    });

    await expect(saveUnique(dir, 'broken.bin', failing)).rejects.toThrow('connection lost');
    expect(await readdir(dir)).toStrictEqual([]);
  });

  it('passes on an error other than an existing file', async () => {
    const readOnly = join(dir, 'read-only');
    await mkdir(readOnly);
    await chmod(readOnly, 0o500);

    await expect(saveUnique(readOnly, 'x.txt', stream('x'))).rejects.toMatchObject({
      code: 'EACCES',
    });
  });
});
