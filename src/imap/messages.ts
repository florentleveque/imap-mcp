import type { FetchMessageObject, MessageAddressObject, SearchObject } from 'imapflow';

import type { MailClient } from './client.js';
import { type MessageParts, messageParts } from './structure.js';

export interface MessageFilters {
  unseenOnly?: boolean;
  since?: string;
  before?: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
}

export interface MessageSummary {
  uid: number;
  date: string;
  from: string;
  to: string[];
  subject: string;
  seen: boolean;
  flagged: boolean;
  size?: number;
  hasAttachments: boolean;
}

export const SUMMARY_FIELDS = {
  uid: true,
  envelope: true,
  flags: true,
  internalDate: true,
  size: true,
  bodyStructure: true,
} as const;

export function searchQuery({ unseenOnly, ...criteria }: MessageFilters): SearchObject {
  const query: SearchObject = { ...criteria };
  if (unseenOnly) query.seen = false;
  return Object.keys(query).length === 0 ? { all: true } : query;
}

// A group marker (`Undisclosed recipients:;`) has a name and no address.
export const formatAddress = ({ name, address }: MessageAddressObject): string =>
  name && address ? `${name} <${address}>` : address || name || '';

/**
 * The first readable date: the arrival (INTERNALDATE), which since and before
 * filter on, then the Date header. imapflow leaves an unreadable one as a
 * string; with neither readable, an empty string.
 */
function messageDate(...candidates: (Date | string | undefined)[]): string {
  for (const candidate of candidates) {
    const date = new Date(candidate ?? Number.NaN);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return '';
}

/** Where the body and attachments are; a message the server gave no structure for has none. */
export const partsOf = ({ bodyStructure }: FetchMessageObject): MessageParts =>
  bodyStructure ? messageParts(bodyStructure) : { attachments: [] };

export function summarize(message: FetchMessageObject, parts = partsOf(message)): MessageSummary {
  const { envelope = {}, flags = new Set<string>() } = message;
  return {
    uid: message.uid,
    date: messageDate(message.internalDate, envelope.date),
    from: envelope.from?.map(formatAddress)[0] ?? '',
    to: envelope.to?.map(formatAddress) ?? [],
    subject: envelope.subject ?? '',
    seen: flags.has('\\Seen'),
    flagged: flags.has('\\Flagged'),
    size: message.size,
    hasAttachments: parts.attachments.length > 0,
  };
}

/**
 * The `limit` messages added last (highest UIDs) matching `filters` in the
 * open folder. SEARCH returns UIDs only, so a large folder costs one list of
 * numbers; only the kept UIDs are fetched.
 */
export async function findMessages(
  client: MailClient,
  filters: MessageFilters,
  limit: number,
): Promise<{ total: number; messages: MessageSummary[] }> {
  const uids = await client.search(searchQuery(filters), { uid: true });
  if (!Array.isArray(uids)) throw new Error('The IMAP server refused the search.');
  const newest = uids.toSorted((a, b) => b - a).slice(0, limit);
  if (newest.length === 0) return { total: uids.length, messages: [] };
  const fetched = await client.fetchAll(newest, SUMMARY_FIELDS, { uid: true });
  return {
    total: uids.length,
    messages: fetched.toSorted((a, b) => b.uid - a.uid).map((message) => summarize(message)),
  };
}
