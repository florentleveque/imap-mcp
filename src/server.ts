import { createRequire } from 'node:module';

import { McpServer } from '@modelcontextprotocol/server';

import type { ToolContext } from './tools/definitions.js';
import { toolDefinitions } from './tools/registry.js';

// Read at runtime, not hard-coded: the release bumps package.json only.
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

/**
 * The MCP server, transport left to the caller: stdio in `index.ts`, a loopback
 * in tests. A handler that throws becomes an `isError` result carrying only the
 * error message (the SDK's own handling), which is why messages are written
 * for the person reading them and never hold a password.
 */
export function createMcpServer(context: ToolContext): McpServer {
  const server = new McpServer({ name: 'imap-mcp', version });
  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      (args) => tool.handler(args, context),
    );
  }
  return server;
}
