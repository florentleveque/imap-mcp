import type { FetchMessageObject, MessageAddressObject, SearchObject } from 'imapflow';

import type { MailClient } from './client.js';
import { messageParts } from './structure.js';

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

// imapflow leaves an unreadable Date header as a string: use the arrival then.
function messageDate(sent: Date | string | undefined, received: Date | string | undefined): string {
  const date = new Date(sent ?? Number.NaN);
  return Number.isNaN(date.getTime()) ? new Date(received ?? 0).toISOString() : date.toISOString();
}

export function summarize(message: FetchMessageObject): MessageSummary {
  const { envelope = {}, flags = new Set<string>(), bodyStructure } = message;
  return {
    uid: message.uid,
    date: messageDate(envelope.date, message.internalDate),
    from: envelope.from?.map(formatAddress)[0] ?? '',
    to: envelope.to?.map(formatAddress) ?? [],
    subject: envelope.subject ?? '',
    seen: flags.has('\\Seen'),
    flagged: flags.has('\\Flagged'),
    size: message.size,
    hasAttachments: bodyStructure ? messageParts(bodyStructure).attachments.length > 0 : false,
  };
}

/**
 * The newest `limit` messages matching `filters` in the open folder. SEARCH
 * returns UIDs only, so a large folder costs one list of numbers; only the
 * kept UIDs are fetched.
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
    messages: fetched.toSorted((a, b) => b.uid - a.uid).map(summarize),
  };
}
