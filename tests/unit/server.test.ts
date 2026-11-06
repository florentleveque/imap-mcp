import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LoopbackTransport, openSession } from './server-harness.js';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

describe('createMcpServer', () => {
  it('introduces itself as imap-mcp, with the package version', async () => {
    const result = await openSession(new LoopbackTransport());

    expect(result?.serverInfo).toEqual({ name: 'imap-mcp', version });
  });
});
