import { createRequire } from 'node:module';

import { McpServer } from '@modelcontextprotocol/server';

// Read at runtime, not hard-coded: the release bumps package.json only.
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

/** The MCP server, transport left to the caller: stdio in `index.ts`, a loopback in tests. */
export function createMcpServer(): McpServer {
  return new McpServer({ name: 'imap-mcp', version });
}
