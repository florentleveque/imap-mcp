// Starts the built executable the way an MCP client does and checks what the
// client sees: an MCP handshake on stdout, nothing else on stdout, and a clean
// exit once stdin closes (the client ending the session).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

const server = spawn(process.execPath, ['build/index.js'], {
  env: { PATH: process.env['PATH'] },
  stdio: ['pipe', 'pipe', 'inherit'],
});

const failures = [];
const check = (label, ok) => {
  console.error(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
};

const within = (ms, what, promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not happen within ${ms / 1000} s.`)), ms),
    ),
  ]);

let stdout = '';
const firstLine = new Promise((resolve) => {
  server.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('\n')) resolve(stdout.slice(0, stdout.indexOf('\n')));
  });
});
const exited = new Promise((resolve) => server.on('exit', (code) => resolve(code)));

try {
  const send = (message) => server.stdin.write(`${JSON.stringify(message)}\n`);
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'smoke', version: '0.0.0' },
    },
  });
  const init = JSON.parse(await within(10_000, 'The initialize answer', firstLine));
  check(
    'initialize answers with the server name and package version',
    init.id === 1 &&
      init.result?.serverInfo?.name === 'imap-mcp' &&
      init.result?.serverInfo?.version === version,
  );
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  server.stdin.end();
  const code = await within(5_000, 'Exit after stdin closed', exited);
  check('exits with code 0 once stdin closes', code === 0);

  const lines = stdout.split('\n').filter((line) => line.length > 0);
  check(
    'writes nothing but JSON-RPC messages on stdout',
    lines.every((line) => {
      try {
        return JSON.parse(line).jsonrpc === '2.0';
      } catch {
        return false;
      }
    }),
  );
} catch (err) {
  check(String(err instanceof Error ? err.message : err), false);
} finally {
  server.kill();
}

if (failures.length > 0) process.exit(1);
