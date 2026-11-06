// Adapted from fruggr/zendesk-mcp-server (MIT, see THIRD-PARTY-NOTICES.md).
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { z } from 'zod';

import { type Account, type Config, getAccount, loadConfig } from '../config.js';
import type { SessionDeps } from '../imap/session.js';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** What a handler may reach. The configuration is read on every call, so an edit applies at once. */
export interface ToolContext {
  configPath: string;
  session: SessionDeps;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject;
  annotations: ToolAnnotations;
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<CallToolResult>;
}

/**
 * Types `handler` against its own `inputSchema`. The cast is sound because the
 * server validates the arguments with that schema before calling the handler.
 */
export function defineTool<Schema extends z.ZodObject>(
  tool: Omit<ToolDefinition, 'inputSchema' | 'handler'> & {
    inputSchema: Schema;
    handler: (params: z.output<Schema>, context: ToolContext) => Promise<CallToolResult>;
  },
): ToolDefinition {
  return {
    ...tool,
    handler: (params, context) => tool.handler(params as z.output<Schema>, context),
  };
}

/** Reads the mailbox and changes nothing; talks to the account's IMAP server. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** The configuration as it stands now, and the account a call names. */
export async function loadAccount(
  context: ToolContext,
  name: string,
): Promise<{ config: Config; account: Account }> {
  const config = await loadConfig(context.configPath);
  return { config, account: getAccount(config, name) };
}
