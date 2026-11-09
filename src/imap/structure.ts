import type { MessageStructureObject } from 'imapflow';

export interface AttachmentInfo {
  /** The IMAP part id that get-attachment and save-attachment take. */
  part: string;
  filename?: string;
  contentType: string;
  /** As the server reports it: encoded size, before base64 or quoted-printable decoding. */
  size?: number;
  inline: boolean;
}

export interface MessageParts {
  text?: string;
  html?: string;
  attachments: AttachmentInfo[];
}

const BODY_TYPES = new Set(['text/plain', 'text/html']);

// An embedded message is a leaf: it is offered whole, as an attachment.
const leaves = (node: MessageStructureObject): MessageStructureObject[] =>
  node.childNodes && node.type !== 'message/rfc822' ? node.childNodes.flatMap(leaves) : [node];

// An empty name counts as none: some mailers send name="" on the body.
const filenameOf = (node: MessageStructureObject): string | undefined =>
  node.dispositionParameters?.['filename'] || node.parameters?.['name'] || undefined;

// Senders mark attachments inconsistently: `inline` with a file name, or no
// Content-Disposition at all. Anything that is not an unnamed text or HTML
// body counts.
const isAttachment = (node: MessageStructureObject): boolean =>
  node.disposition === 'attachment' || filenameOf(node) !== undefined || !BODY_TYPES.has(node.type);

/** Where the body text, the HTML body and the attachments of a message are. */
export function messageParts(structure: MessageStructureObject): MessageParts {
  const parts: MessageParts = { attachments: [] };
  for (const node of leaves(structure)) {
    // A single-part message has no part id; its content is part 1.
    const part = node.part ?? '1';
    if (isAttachment(node)) {
      const filename = filenameOf(node);
      parts.attachments.push({
        part,
        ...(filename === undefined ? {} : { filename }),
        contentType: node.type,
        size: node.size,
        inline: node.disposition === 'inline',
      });
    } else if (node.type === 'text/plain') {
      parts.text ??= part;
    } else {
      parts.html ??= part;
    }
  }
  return parts;
}
