import { z } from 'zod';

import { toFolder } from '../imap/folders.js';
import { withClient } from '../imap/session.js';
import { jsonResult } from '../mcp-format.js';
import { defineTool, loadAccount, READ_ONLY, type ToolDefinition } from './definitions.js';
import { accountField } from './fields.js';

export const folderTools: ToolDefinition[] = [
  defineTool({
    name: 'list-folders',
    title: 'List folders',
    description:
      'List the folders of an account: path (the `folder` parameter of the other tools), ' +
      'display name, whether it is subscribed, whether it can be opened, and its special use ' +
      '(\\Sent, \\Trash, \\Drafts, \\Junk, \\Archive, \\All, \\Flagged) when the server declares ' +
      'one. A folder without a declared special use has none, whatever its name.',
    inputSchema: z.strictObject({ account: accountField }),
    annotations: READ_ONLY,
    handler: async ({ account: name }, context) => {
      const { account } = await loadAccount(context, name);
      const entries = await withClient(account, context.session, (client) => client.list());
      return jsonResult({ account: name, folders: entries.map(toFolder) });
    },
  }),
];
