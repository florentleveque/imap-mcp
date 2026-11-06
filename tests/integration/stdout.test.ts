/**
 * stdout is the MCP channel (AGENTS.md "Security invariants"), and imapflow's
 * default logger writes JSON lines to it. This runs imapflow with the options
 * the server builds, in a child process, and checks its stdout stays empty;
 * the control run without `logger: false` shows the check would catch a line.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { imapOptions } from '../../src/imap/options.js';
import { accountFor, createUser, type TestUser, testCa } from './greenmail.js';

const SESSION = `
import { ImapFlow } from 'imapflow';
const client = new ImapFlow(JSON.parse(process.argv[1]));
client.on('error', () => {});
await client.connect();
await client.list();
await client.logout();
`;

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function stdoutOf(options: object): string {
  const run = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', SESSION, JSON.stringify(options)],
    { cwd: repoRoot, encoding: 'utf8', timeout: 20_000 },
  );
  if (run.status !== 0) throw new Error(`the IMAP session failed: ${run.stderr}`);
  return run.stdout;
}

let user: TestUser;
beforeAll(async () => {
  user = await createUser();
});

describe('an IMAP session with the server options', () => {
  it('writes nothing to stdout', () => {
    expect(stdoutOf(imapOptions(accountFor(user), user.password, testCa))).toBe('');
  });

  it('would be caught: imapflow logs to stdout without them', () => {
    const { logger: _logger, ...withDefaultLogger } = imapOptions(
      accountFor(user),
      user.password,
      testCa,
    );

    expect(stdoutOf(withDefaultLogger)).toMatch(/^\{"level":/);
  });
});
