import type { CallToolResult } from '@modelcontextprotocol/server';

/** A payload as a compact JSON text result: indentation costs tokens and helps no model. */
export function jsonResult(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}
