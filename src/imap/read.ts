import { buffer } from 'node:stream/consumers';

import { convert } from 'html-to-text';

import type { MailClient } from './client.js';
import { formatAddress, type MessageSummary, SUMMARY_FIELDS, summarize } from './messages.js';
import { type AttachmentInfo, messageParts } from './structure.js';

// What one body may cost: the download stops at BODY_BYTES, the text handed
// to the model at BODY_CHARS (about 25,000 tokens).
const BODY_BYTES = 2 * 1024 * 1024;
const BODY_CHARS = 100_000;

export interface MessageBody {
  /** Where the text comes from: the text part, the HTML part converted, or nothing. */
  format: 'text' | 'html' | 'none';
  text: string;
  truncated: boolean;
}

export interface MessageContent extends Omit<MessageSummary, 'hasAttachments'> {
  messageId: string;
  cc: string[];
  replyTo: string[];
  body: MessageBody;
  attachments: AttachmentInfo[];
}

const CRLF = /\r\n/g;

async function downloadText(
  client: MailClient,
  uid: number,
  part: string,
): Promise<{ text: string; cut: boolean }> {
  // One byte more than kept, to know whether the part was longer.
  const { content } = await client.download(String(uid), part, {
    uid: true,
    maxBytes: BODY_BYTES + 1,
  });
  const bytes = content ? await buffer(content) : Buffer.alloc(0);
  return {
    text: bytes.subarray(0, BODY_BYTES).toString('utf8'),
    cut: bytes.length > BODY_BYTES,
  };
}

async function readBody(
  client: MailClient,
  uid: number,
  { text, html }: { text?: string; html?: string },
): Promise<MessageBody> {
  const part = text ?? html;
  if (part === undefined) return { format: 'none', text: '', truncated: false };
  const downloaded = await downloadText(client, uid, part);
  const plain = (
    text === undefined
      ? convert(downloaded.text, {
          wordwrap: false,
          selectors: [{ selector: 'img', format: 'skip' }],
        })
      : downloaded.text
  ).replace(CRLF, '\n');
  return {
    format: text === undefined ? 'html' : 'text',
    text: plain.slice(0, BODY_CHARS),
    truncated: downloaded.cut || plain.length > BODY_CHARS,
  };
}

/** A message of the open folder: headers, body text and attachment list. */
export async function readMessage(
  client: MailClient,
  folder: string,
  uid: number,
): Promise<MessageContent> {
  const [message] = await client.fetchAll([uid], SUMMARY_FIELDS, { uid: true });
  if (!message) {
    throw new Error(
      `No message with UID ${uid} in folder "${folder}". list-messages and search-messages give the UIDs.`,
    );
  }
  const { hasAttachments: _hasAttachments, ...summary } = summarize(message);
  const { envelope = {}, bodyStructure } = message;
  const parts = bodyStructure ? messageParts(bodyStructure) : { attachments: [] };
  return {
    ...summary,
    messageId: envelope.messageId ?? '',
    cc: envelope.cc?.map(formatAddress) ?? [],
    replyTo: envelope.replyTo?.map(formatAddress) ?? [],
    body: await readBody(client, uid, parts),
    attachments: parts.attachments,
  };
}
