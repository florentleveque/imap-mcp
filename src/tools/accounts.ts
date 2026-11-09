import { z } from 'zod';

import { loadConfig } from '../config.js';
import { jsonResult } from '../mcp-format.js';
import { defineTool, READ_ONLY, type ToolDefinition } from './definitions.js';

export const accountTools: ToolDefinition[] = [
  defineTool({
    name: 'list-accounts',
    title: 'List accounts',
    description:
      'List the mail accounts this server is configured for: name, IMAP host, port, TLS mode ' +
      '(tls or starttls) and user name. Call it first: the other tools take the name as their ' +
      '`account` parameter. Reads the configuration file only and contacts no mail server.',
    inputSchema: z.strictObject({}),
    annotations: { ...READ_ONLY, openWorldHint: false },
    handler: async (_params, { configPath }) => {
      const { accounts } = await loadConfig(configPath);
      return jsonResult({
        accounts: accounts.map(({ name, host, port, security, user }) => ({
          name,
          host,
          port,
          security,
          user,
        })),
      });
    },
  }),
];
