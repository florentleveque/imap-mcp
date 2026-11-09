import type { Readable } from 'node:stream';

import type { MailClient } from './client.js';

/**
 * A part as it was sent, base64 or quoted-printable removed, and the charset
 * it declares. decodeText: false, or imapflow would re-encode an inline text
 * part in UTF-8 and unwrap format=flowed.
 */
export async function downloadPart(
  client: MailClient,
  uid: number,
  part: string,
  maxBytes?: number,
): Promise<{ content: Readable; charset?: string }> {
  // imapflow reads an undefined maxBytes as no limit.
  const { content, meta } = await client.download(String(uid), part, {
    uid: true,
    maxBytes,
    decodeText: false,
  });
  if (!content) {
    throw new Error(`The server returned no content for part "${part}" of message ${uid}.`);
  }
  return { content, charset: meta.charset };
}
