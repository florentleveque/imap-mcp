/**
 * A server wired to a configuration file in a temporary directory and to a
 * fake IMAP client, driven through real `tools/call` requests: what a test
 * sees is what an MCP client would.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeMailClient, opener } from './fakes/mail-client.js';
import { LoopbackTransport, openSession } from './server-harness.js';

export const PASSWORD = 'sentinel-password-7f3a';

export const ACCOUNT = { host: 'imap.example.test', user: 'reader@example.test' };

export interface ToolResult {
  content: { type: string; text?: string; data?: string; mimeType?: string; resource?: unknown }[];
  isError?: boolean;
}

export async function toolServer(config: unknown = { accounts: { perso: ACCOUNT } }) {
  const dir = await mkdtemp(join(tmpdir(), 'imap-mcp-tools-'));
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  const client = new FakeMailClient();
  const { opened, openClient } = opener(client);
  const transport = new LoopbackTransport();
  await openSession(transport, {
    configPath,
    session: { passwords: async () => PASSWORD, openClient },
  });

  return {
    dir,
    client,
    opened,
    async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
      const response = await transport.request('tools/call', { name, arguments: args });
      if (response.error) throw new Error(`tools/call failed: ${response.error.message}`);
      return response.result as unknown as ToolResult;
    },
    /** The JSON payload of a successful call. */
    async json(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
      const result = await this.call(name, args);
      if (result.isError) throw new Error(`${name} failed: ${result.content[0]?.text}`);
      return JSON.parse(result.content[0]?.text ?? '');
    },
    /** The error text of a failed call. */
    async error(name: string, args: Record<string, unknown> = {}): Promise<string> {
      const result = await this.call(name, args);
      if (!result.isError) throw new Error(`${name} unexpectedly succeeded`);
      return result.content[0]?.text ?? '';
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
