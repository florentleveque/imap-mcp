import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { LoopbackTransport, openSession } from './server-harness.js';

// The tools/list answer is the contract agents depend on (AGENTS.md, "Tool
// schemas: never weakened"). Any change to it must show up as an edit of the
// reference file, reviewed like code.
const baseline = JSON.parse(
  readFileSync(new URL('./fixtures/tools-list.json', import.meta.url), 'utf8'),
);

describe('exposed tool schemas', () => {
  const transport = new LoopbackTransport();

  beforeAll(async () => {
    await openSession(transport);
  });

  it('tools/list matches the reference file', async () => {
    const response = await transport.request('tools/list');

    expect(response.result?.tools).toEqual(baseline);
  });
});
