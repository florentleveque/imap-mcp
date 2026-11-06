import type { Readable } from 'node:stream';

import type { MailClient } from './client.js';
import { missingMessage } from './read.js';
import { type AttachmentInfo, messageParts } from './structure.js';

/**
 * The attachment at `part`, as read-message lists it. Any other part (the
 * body, a multipart container) is refused, so this tool only ever hands out
 * what was presented as an attachment.
 */
export async function findAttachment(
  client: MailClient,
  folder: string,
  uid: number,
  part: string,
): Promise<AttachmentInfo> {
  const [message] = await client.fetchAll([uid], { uid: true, bodyStructure: true }, { uid: true });
  if (!message) throw missingMessage(folder, uid);
  const attachment = message.bodyStructure
    ? messageParts(message.bodyStructure).attachments.find((found) => found.part === part)
    : undefined;
  if (!attachment) {
    throw new Error(
      `Message ${uid} has no attachment with part "${part}". read-message lists its attachments.`,
    );
  }
  return attachment;
}

/** The decoded content of a part (base64 or quoted-printable removed). */
export async function downloadPart(
  client: MailClient,
  uid: number,
  part: string,
  maxBytes?: number,
): Promise<{ content: Readable; charset?: string }> {
  // imapflow reads an undefined maxBytes as no limit.
  const { content, meta } = await client.download(String(uid), part, { uid: true, maxBytes });
  if (!content) {
    throw new Error(`The server returned no content for part "${part}" of message ${uid}.`);
  }
  return { content, charset: meta.charset };
}
