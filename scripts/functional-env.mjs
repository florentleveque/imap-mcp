// The environment a functional validation runs in: the server built from the
// current commit, and a GreenMail container holding a synthetic mailbox. Never
// a real mailbox. Writes .functional/ (git-ignored), which the `imap-mcp-dev`
// entry of .mcp.json reads, and stays in the foreground until Ctrl+C, when the
// container goes. Protocol: tests/functional/README.md.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ImapFlow } from 'imapflow';

import { startGreenMail, testCaPath } from './greenmail.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = fileURLToPath(new URL('../.functional/', import.meta.url));

// Arrival order, oldest first; the first one is already read.
const MAILBOX = [
  'plain',
  'html-only',
  'alternative',
  'attachment',
  'inline-named',
  'no-disposition',
  'related',
  'forwarded',
  'encoded-names',
  'latin1',
  'named-body',
];

// The build must be the commit recorded in state.json, which the validator
// checks against the PR head: refuse a tree with uncommitted changes.
const changes = execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString();
if (changes !== '') {
  console.error(`Commit or stash these changes first, so the build matches HEAD:\n${changes}`);
  process.exit(1);
}
execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();

console.log('Starting GreenMail...');
const { container, endpoints } = await startGreenMail();

const user = `validator-${randomUUID().slice(0, 8)}@example.test`;
const password = randomUUID();
const created = await fetch(`http://${endpoints.host}:${endpoints.api}/api/user`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: user, login: user, password }),
});
if (!created.ok) throw new Error(`GreenMail refused the user: ${created.status}`);

const client = new ImapFlow({
  host: endpoints.host,
  port: endpoints.imaps,
  secure: true,
  tls: { ca: readFileSync(testCaPath, 'utf8') },
  auth: { user, pass: password },
  logger: false,
});
await client.connect();
// Names imapflow would guess a special use from; GreenMail declares none.
await client.mailboxCreate('Sent');
await client.mailboxCreate('Trash');
for (const [index, name] of MAILBOX.entries()) {
  const raw = readFileSync(
    new URL(`../tests/integration/fixtures/mail/${name}.eml`, import.meta.url),
  );
  await client.append(
    'INBOX',
    raw,
    index === 0 ? ['\\Seen'] : [],
    new Date(Date.UTC(2026, 10, 1 + index, 9)),
  );
}
await client.logout();

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(
  `${out}config.json`,
  `${JSON.stringify(
    {
      accounts: {
        greenmail: {
          host: endpoints.host,
          port: endpoints.imaps,
          security: 'tls',
          user,
          caFile: testCaPath,
        },
      },
      attachments: { directory: `${out}attachments` },
    },
    null,
    2,
  )}\n`,
);
// A throwaway password for a throwaway container, readable by its owner only.
writeFileSync(`${out}password`, password, { mode: 0o600 });
writeFileSync(`${out}state.json`, `${JSON.stringify({ commit, user }, null, 2)}\n`);

console.log(`Ready: server built from ${commit}, mailbox of ${MAILBOX.length} messages.`);
console.log('Start the validator session at the repository root now. Ctrl+C stops GreenMail.');

const stop = async () => {
  await container.stop();
  rmSync(out, { recursive: true, force: true });
  process.exit(0);
};
// SIGHUP: the terminal closed.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
await new Promise(() => {});
