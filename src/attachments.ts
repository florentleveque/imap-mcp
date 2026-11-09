import { mkdir, open, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Windows device names, reserved whatever the extension and the spaces before it.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)\s*(\..*)?$/i;

// Most file systems cap a name at 255 bytes; keep a margin for " (n)".
const MAX_BYTES = 200;

// Refused in Windows file names.
const FORBIDDEN = new Set('<>:"|?*');
const PATH_SEPARATORS = /[/\\]/;
const DOTS_ONLY = /^\.*$/;
const EDGE_DOTS_AND_SPACES = /^[.\s]+|[.\s]+$/g;

// Control, format and line-separator characters: invisible, and a
// right-to-left override can make a name read with another extension.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

const isUnsafe = (char: string): boolean => INVISIBLE.test(char) || FORBIDDEN.has(char);

// Real extensions are short; a longer one is cut like the rest of the name.
const MAX_EXTENSION_BYTES = 32;

/** The longest start of `text` that fits in `room` bytes, cut between characters. */
function fitBytes(text: string, room: number): string {
  let used = 0;
  let end = 0;
  for (const char of text) {
    used += Buffer.byteLength(char);
    if (used > room) break;
    end += char.length;
  }
  return text.slice(0, end);
}

function shorten(name: string): string {
  const ext = extname(name);
  const kept = Buffer.byteLength(ext) <= MAX_EXTENSION_BYTES ? ext : '';
  const stem = name.slice(0, name.length - kept.length);
  return fitBytes(stem, MAX_BYTES - Buffer.byteLength(kept)) + kept;
}

/**
 * A file name from a sender, made safe to create in the attachments folder on
 * any system: no path, no control or reserved character, no device name, no
 * leading dot. `fallback` names what nothing usable is left of.
 */
export function safeFileName(name: string | undefined, fallback: string): string {
  const cleaned = Array.from(name ?? '', (char) => (isUnsafe(char) ? '_' : char))
    .join('')
    .split(PATH_SEPARATORS)
    .filter((piece) => !DOTS_ONLY.test(piece))
    .join('_');
  // Trimmed after the cut, which can end the name on a dot or a space (Windows
  // strips those), and checked for a device name last, on the final name.
  const safe = shorten(cleaned).replace(EDGE_DOTS_AND_SPACES, '');
  if (safe === '') return fallback;
  return RESERVED.test(safe) ? `_${safe}` : safe;
}

/**
 * Write `content` to `directory/name`, never over an existing file: the name
 * gets " (1)", " (2)"... until one is free. A failed download leaves no file.
 */
export async function saveUnique(
  directory: string,
  name: string,
  content: Readable,
): Promise<{ path: string; size: number }> {
  await mkdir(directory, { recursive: true });
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let copy = 0; ; copy++) {
    const path = join(directory, copy === 0 ? name : `${stem} (${copy})${ext}`);
    let file: Awaited<ReturnType<typeof open>>;
    try {
      // `wx` fails when the file exists, atomically: no check-then-write race.
      file = await open(path, 'wx');
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === 'EEXIST') continue;
      // Node's message quotes the path, and so the sender's file name.
      throw new Error(`Cannot create a file in ${directory} (${code}).`);
    }
    try {
      await pipeline(content, file.createWriteStream());
    } catch (error) {
      await rm(path);
      throw error;
    }
    return { path, size: (await stat(path)).size };
  }
}
