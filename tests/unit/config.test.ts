import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigError, defaultConfigPath, getAccount, loadConfig } from '../../src/config.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'imap-mcp-config-'));
  path = join(dir, 'config.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = (value: unknown) =>
  writeFile(path, typeof value === 'string' ? value : JSON.stringify(value));

const account = { host: 'imap.example.test', user: 'reader@example.test' };

describe('defaultConfigPath', () => {
  it('sits under ~/.config/imap-mcp on every system', () => {
    expect(defaultConfigPath()).toBe(join(homedir(), '.config', 'imap-mcp', 'config.json'));
  });
});

describe('loadConfig', () => {
  it('reads accounts with TLS on port 993 by default', async () => {
    await write({ accounts: { perso: account } });

    const config = await loadConfig(path);

    expect(config.accounts).toEqual([
      {
        name: 'perso',
        host: 'imap.example.test',
        port: 993,
        security: 'tls',
        user: 'reader@example.test',
      },
    ]);
  });

  it('accepts an explicit TLS mode', async () => {
    await write({ accounts: { perso: { ...account, security: 'tls' } } });

    const [perso] = (await loadConfig(path)).accounts;

    expect(perso).toMatchObject({ security: 'tls', port: 993 });
  });

  it('defaults STARTTLS accounts to port 143', async () => {
    await write({ accounts: { perso: { ...account, security: 'starttls' } } });

    const [perso] = (await loadConfig(path)).accounts;

    expect(perso).toMatchObject({ security: 'starttls', port: 143 });
  });

  it('keeps an explicit port and CA file', async () => {
    await write({ accounts: { perso: { ...account, port: 1993, caFile: '/etc/ca.pem' } } });

    const [perso] = (await loadConfig(path)).accounts;

    expect(perso).toMatchObject({ port: 1993, caFile: '/etc/ca.pem' });
  });

  it('defaults the attachment settings: no directory, 1 MiB inline', async () => {
    await write({ accounts: { perso: account } });

    expect((await loadConfig(path)).attachments).toEqual({ maxInlineBytes: 1_048_576 });
  });

  it('keeps explicit attachment settings', async () => {
    await write({
      accounts: { perso: account },
      attachments: { directory: '/srv/attachments', maxInlineBytes: 2048 },
    });

    expect((await loadConfig(path)).attachments).toEqual({
      directory: '/srv/attachments',
      maxInlineBytes: 2048,
    });
  });

  it('says where the file was expected when it is missing', async () => {
    await expect(loadConfig(path)).rejects.toThrow(
      new ConfigError(`No configuration file at ${path}. Create it as described in the README.`),
    );
  });

  it('rejects a file that is not JSON', async () => {
    await write('{ accounts:');

    await expect(loadConfig(path)).rejects.toThrow(/^Configuration file .* is not valid JSON: /);
  });

  it('refuses a password with a message of its own', async () => {
    await write({ accounts: { perso: { ...account, password: 'x' } } });

    await expect(loadConfig(path)).rejects.toThrow(
      `Invalid configuration file ${path}: accounts.perso: passwords never go in the configuration file`,
    );
  });

  it.each(['pass', 'Password', 'passwd', 'secret'])('treats %s as a password', async (key) => {
    await write({ accounts: { perso: { ...account, [key]: 'x' } } });

    await expect(loadConfig(path)).rejects.toThrow('passwords never go in the configuration file');
  });

  it('keeps the dedicated message when a password comes with other unknown keys', async () => {
    await write({ accounts: { perso: { ...account, colour: 'blue', password: 'x' } } });

    await expect(loadConfig(path)).rejects.toThrow('passwords never go in the configuration file');
  });

  it.each(['bypass', 'passkey'])('does not mistake %s for a password', async (key) => {
    await write({ accounts: { perso: { ...account, [key]: 'x' } } });

    await expect(loadConfig(path)).rejects.toThrow(`Unrecognized key: "${key}"`);
  });

  it('rejects any other unknown key', async () => {
    await write({ accounts: { perso: { ...account, tlsVerify: false } } });

    await expect(loadConfig(path)).rejects.toThrow(
      `Invalid configuration file ${path}: accounts.perso: Unrecognized key: "tlsVerify"`,
    );
  });

  it('rejects an unknown top-level key', async () => {
    await write({ accounts: { perso: account }, insecure: true });

    await expect(loadConfig(path)).rejects.toThrow('Unrecognized key: "insecure"');
  });

  it('offers no cleartext mode', async () => {
    await write({ accounts: { perso: { ...account, security: 'none' } } });

    await expect(loadConfig(path)).rejects.toThrow(/accounts\.perso\.security: /);
  });

  it.each([
    ['upper case', 'Perso'],
    ['a leading hyphen', '-perso'],
    ['a dot', 'per.so'],
  ])('rejects an account name with %s', async (_label, name) => {
    await write({ accounts: { [name]: account } });

    await expect(loadConfig(path)).rejects.toThrow(
      'account names use lower-case letters, digits and hyphens',
    );
  });

  it('reports every rule a long, upper-case account name breaks', async () => {
    await write({ accounts: { ['A'.repeat(65)]: account } });

    await expect(loadConfig(path)).rejects.toThrow(
      'account names are at most 64 characters, account names use lower-case letters, digits and hyphens',
    );
  });

  it.each(['work-2', '2nd'])('accepts the account name %s', async (name) => {
    await write({ accounts: { [name]: account } });

    expect((await loadConfig(path)).accounts.map((a) => a.name)).toEqual([name]);
  });

  it('requires at least one account', async () => {
    await write({ accounts: {} });

    await expect(loadConfig(path)).rejects.toThrow('accounts: declare at least one account');
  });

  it.each([
    ['caFile', { accounts: { perso: { ...account, caFile: 'ca.pem' } } }],
    ['attachments.directory', { accounts: { perso: account }, attachments: { directory: 'out' } }],
  ])('requires an absolute %s', async (_label, value) => {
    await write(value);

    await expect(loadConfig(path)).rejects.toThrow('must be an absolute path');
  });

  it.each([0, 65_536, 993.5])('rejects port %s', async (port) => {
    await write({ accounts: { perso: { ...account, port } } });

    await expect(loadConfig(path)).rejects.toThrow(/accounts\.perso\.port: /);
  });

  it.each([0, 1.5])('rejects maxInlineBytes %s', async (maxInlineBytes) => {
    await write({ accounts: { perso: account }, attachments: { maxInlineBytes } });

    await expect(loadConfig(path)).rejects.toThrow(/attachments\.maxInlineBytes: /);
  });

  it('passes on a read error other than a missing file', async () => {
    await expect(loadConfig(dir)).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('lists every problem, not only the first', async () => {
    await write({ accounts: { perso: { host: '', user: '' } } });

    await expect(loadConfig(path)).rejects.toThrow(
      /accounts\.perso\.host: .*; accounts\.perso\.user: /,
    );
  });
});

describe('getAccount', () => {
  it('finds an account by name', async () => {
    await write({ accounts: { perso: account, work: account } });
    const config = await loadConfig(path);

    expect(getAccount(config, 'work').name).toBe('work');
  });

  it('names the configured accounts when the name is unknown', async () => {
    await write({ accounts: { perso: account, work: account } });
    const config = await loadConfig(path);

    expect(() => getAccount(config, 'other')).toThrow(
      'Unknown account "other". Configured accounts: perso, work.',
    );
  });
});
