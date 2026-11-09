import type { MailClient } from './client.js';
import { missingMessage, partsOf } from './messages.js';
import type { AttachmentInfo } from './structure.js';

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
  const attachment = partsOf(message).attachments.find((found) => found.part === part);
  if (!attachment) {
    throw new Error(
      `Message ${uid} has no attachment with part "${part}". read-message lists its attachments.`,
    );
  }
  return attachment;
}
