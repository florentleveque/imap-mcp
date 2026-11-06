import { accountTools } from './accounts.js';
import type { ToolDefinition } from './definitions.js';
import { folderTools } from './folders.js';
import { messageTools } from './messages.js';
import { readTools } from './read.js';

/** Every tool the server exposes, in the order tools/list returns them. */
export const toolDefinitions: ToolDefinition[] = [
  ...accountTools,
  ...folderTools,
  ...messageTools,
  ...readTools,
];
