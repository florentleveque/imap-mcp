#!/usr/bin/env node
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { defaultConfigPath } from './config.js';
import { openImapFlow } from './imap/client.js';
import { createMcpServer } from './server.js';

const { values } = parseArgs({ options: { config: { type: 'string' } } });

serveStdio(() =>
  createMcpServer({
    // Absolute from the start: a relative --config depends on the directory the
    // MCP client starts the server in, and errors then name the real place.
    configPath: resolve(values.config ?? defaultConfigPath()),
    session: {
      // The password sources (keyring, command, environment) arrive with #4.
      passwords: async () => {
        throw new Error('No password source is available yet.');
      },
      openClient: openImapFlow,
    },
  }),
);
