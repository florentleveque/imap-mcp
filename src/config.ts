import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { type core, z } from 'zod';

export interface Account {
  name: string;
  host: string;
  port: number;
  security: 'tls' | 'starttls';
  user: string;
  caFile?: string;
}

export interface Config {
  accounts: Account[];
  attachments: { directory?: string; maxInlineBytes: number };
}

/** A configuration problem, worded for the person who edits the file. */
export class ConfigError extends Error {}

// The MCP client picks the working directory, so a relative path would mean
// something different from one client to the next.
const absolutePath = z.string().refine(isAbsolute, 'must be an absolute path');

const accountSchema = z.strictObject({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535).optional(),
  // No cleartext value, on purpose: AGENTS.md "Security invariants".
  security: z.enum(['tls', 'starttls']).default('tls'),
  user: z.string().min(1),
  caFile: absolutePath.optional(),
});

const configSchema = z.strictObject({
  accounts: z
    .record(
      // Account names become keyring entry names (#4): keep them plain.
      z
        .string()
        .max(64, 'account names are at most 64 characters')
        .regex(/^[a-z0-9][a-z0-9-]*$/, 'account names use lower-case letters, digits and hyphens'),
      accountSchema,
    )
    .refine((accounts) => Object.keys(accounts).length > 0, 'declare at least one account'),
  attachments: z
    .strictObject({
      directory: absolutePath.optional(),
      maxInlineBytes: z.number().int().positive().default(1_048_576),
    })
    .prefault({}),
});

const PASSWORD_KEY = /^(pass|password|passwd|secret)$/i;

function describeIssue(issue: core.$ZodIssue): string {
  if (issue.code === 'unrecognized_keys' && issue.keys.some((key) => PASSWORD_KEY.test(key))) {
    return 'passwords never go in the configuration file';
  }
  if (issue.code === 'invalid_key') return issue.issues.map((inner) => inner.message).join(', ');
  return issue.message;
}

function formatIssue(issue: core.$ZodIssue): string {
  const where = issue.path.join('.');
  return where ? `${where}: ${describeIssue(issue)}` : describeIssue(issue);
}

export function defaultConfigPath(): string {
  return join(homedir(), '.config', 'imap-mcp', 'config.json');
}

/** Read and validate the configuration file; throws a `ConfigError` worded for its author. */
export async function loadConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigError(
        `No configuration file at ${path}. Create it as described in the README.`,
      );
    }
    throw error;
  }

  // JSON.parse refuses the byte-order mark some Windows editors write.
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    // Not JSON.parse's message: it quotes the text around the error, which may be a password.
    throw new ConfigError(
      `Configuration file ${path} is not valid JSON: keys and strings take double quotes, and no comma ends a list.`,
    );
  }

  const parsed = configSchema.safeParse(json);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(formatIssue).join('; ');
    throw new ConfigError(`Invalid configuration file ${path}: ${problems}`);
  }

  const { accounts, attachments } = parsed.data;
  return {
    accounts: Object.entries(accounts).map(([name, { port, ...account }]) => ({
      name,
      ...account,
      port: port ?? (account.security === 'tls' ? 993 : 143),
    })),
    attachments,
  };
}

export function getAccount(config: Config, name: string): Account {
  const account = config.accounts.find((candidate) => candidate.name === name);
  if (!account) {
    const known = config.accounts.map((candidate) => candidate.name).join(', ');
    throw new ConfigError(`Unknown account "${name}". Configured accounts: ${known}.`);
  }
  return account;
}
