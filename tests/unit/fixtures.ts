/**
 * The MIME fixtures as imapflow returned them from GreenMail, recorded by
 * tests/integration/message-fixtures.test.ts. JSON turned the Dates into
 * strings; `fixtureMessage` turns them back.
 */

import { readFileSync } from 'node:fs';

import type { MessageEnvelopeObject, MessageStructureObject } from 'imapflow';

interface RecordedPart {
  meta: Record<string, unknown>;
  content: string;
}

interface Recorded {
  envelope: MessageEnvelopeObject & { date?: string };
  bodyStructure: MessageStructureObject;
  size: number;
  parts: Record<string, RecordedPart>;
}

export const recorded: Record<string, Recorded> = JSON.parse(
  readFileSync(new URL('./fixtures/messages.json', import.meta.url), 'utf8'),
);

export interface FakeMessage {
  uid: number;
  flags: Set<string>;
  internalDate: Date;
  envelope: MessageEnvelopeObject;
  bodyStructure: MessageStructureObject;
  size: number;
  parts: Record<string, { meta: Record<string, unknown>; content: Buffer }>;
}

export function fixtureMessage(
  name: string,
  uid: number,
  { flags = [], internalDate }: { flags?: string[]; internalDate?: Date } = {},
): FakeMessage {
  const message = recorded[name];
  if (!message) throw new Error(`no recorded fixture ${name}`);
  const date = message.envelope.date ? new Date(message.envelope.date) : undefined;
  return {
    uid,
    flags: new Set(flags),
    // Received a minute after it was sent, so a test can tell the two apart.
    internalDate: internalDate ?? new Date((date?.getTime() ?? 0) + 60_000),
    envelope: { ...message.envelope, date } as MessageEnvelopeObject,
    bodyStructure: structuredClone(message.bodyStructure),
    size: message.size,
    parts: Object.fromEntries(
      Object.entries(message.parts).map(([part, { meta, content }]) => [
        part,
        { meta, content: Buffer.from(content, 'base64') },
      ]),
    ),
  };
}
