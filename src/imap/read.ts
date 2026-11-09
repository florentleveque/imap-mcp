import { buffer } from 'node:stream/consumers';

import { convert } from 'html-to-text';

import type { MailClient } from './client.js';
import { downloadPart } from './download.js';
import {
  formatAddress,
  type MessageSummary,
  missingMessage,
  partsOf,
  SUMMARY_FIELDS,
  summarize,
} from './messages.js';
import type { AttachmentInfo } from './structure.js';
import { decodeText } from './text.js';

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
const LONE_HIGH_SURROGATE_AT_END = /[\uD800-\uDBFF]$/;

// html-to-text runs table cells together (a layout table is not a data table)
// and uppercases headings, which changes the text ("Straße" to "STRASSE").
const HTML_SELECTORS = [
  { selector: 'img', format: 'skip' },
  { selector: 'td', format: 'block' },
  { selector: 'th', format: 'block' },
  ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((selector) => ({
    selector,
    options: { uppercase: false },
  })),
];

async function downloadText(
  client: MailClient,
  uid: number,
  part: string,
): Promise<{ text: string; cut: boolean }> {
  // One byte more than kept, to know whether the part was longer. The bytes
  // as sent, so the limit counts them: imapflow's format=flowed unwrapping
  // would hide a cut.
  const { content, charset } = await downloadPart(client, uid, part, BODY_BYTES + 1);
  const bytes = await buffer(content);
  return {
    text: decodeText(bytes.subarray(0, BODY_BYTES), charset),
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
      ? convert(downloaded.text, { wordwrap: false, selectors: HTML_SELECTORS })
      : downloaded.text
  ).replace(CRLF, '\n');
  return {
    format: text === undefined ? 'html' : 'text',
    // A cut between the two halves of a surrogate pair leaves half a character.
    text: plain.slice(0, BODY_CHARS).replace(LONE_HIGH_SURROGATE_AT_END, ''),
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
  if (!message) throw missingMessage(folder, uid);
  const parts = partsOf(message);
  const { hasAttachments: _hasAttachments, ...summary } = summarize(message, parts);
  const { envelope = {} } = message;
  return {
    ...summary,
    messageId: envelope.messageId ?? '',
    cc: envelope.cc?.map(formatAddress) ?? [],
    replyTo: envelope.replyTo?.map(formatAddress) ?? [],
    body: await readBody(client, uid, parts),
    attachments: parts.attachments,
  };
}
