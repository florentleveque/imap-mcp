/**
 * Records what imapflow returns for each MIME fixture on GreenMail (envelope,
 * body structure, parts with the transfer encoding removed) into tests/unit/fixtures/messages.json, which
 * the unit fake replays. Run with `-u` to re-record; otherwise a difference
 * fails here, before the unit tests drift from the real client.
 */

import { buffer } from 'node:stream/consumers';

import type { MessageStructureObject } from 'imapflow';
import { describe, expect, it } from 'vitest';

import { adminClient, createUser, seed } from './greenmail.js';
import { FIXTURES, rawFixture } from './mail-fixtures.js';

/** Every part id a download can target: leaves, and embedded messages as a whole. */
function leafParts(node: MessageStructureObject): string[] {
  if (node.childNodes && node.type !== 'message/rfc822') return node.childNodes.flatMap(leafParts);
  return [node.part ?? '1'];
}

describe('the MIME fixtures', () => {
  it('come back from GreenMail as recorded for the unit tests', async () => {
    const user = await createUser();
    const uids = await seed(
      user,
      FIXTURES.map((name) => ({ raw: rawFixture(name) })),
    );

    const client = await adminClient(user);
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const fetched = await client.fetchAll(
        uids,
        { uid: true, envelope: true, bodyStructure: true, size: true },
        { uid: true },
      );
      const record: Record<string, unknown> = {};
      for (const [index, name] of FIXTURES.entries()) {
        const uid = uids[index];
        const message = fetched.find((candidate) => candidate.uid === uid);
        if (!message?.bodyStructure) throw new Error(`no structure for ${name}`);
        const parts: Record<string, unknown> = {};
        for (const part of leafParts(message.bodyStructure)) {
          const { meta, content } = await client.download(String(uid), part, {
            uid: true,
            decodeText: false,
          });
          parts[part] = { meta, content: (await buffer(content)).toString('base64') };
        }
        record[name] = {
          envelope: message.envelope,
          bodyStructure: message.bodyStructure,
          size: message.size,
          parts,
        };
      }

      await expect(`${JSON.stringify(record, null, 2)}\n`).toMatchFileSnapshot(
        '../unit/fixtures/messages.json',
      );
    } finally {
      lock.release();
      await client.logout();
    }
  });
});
