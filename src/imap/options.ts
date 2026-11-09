import { getCACertificates } from 'node:tls';

import type { ImapFlowOptions } from 'imapflow';

import type { Account } from '../config.js';

/**
 * The ImapFlow options for an account. The security invariants of AGENTS.md
 * live here: TLS from the first byte or a mandatory STARTTLS (imapflow's
 * default upgrades only when offered, and otherwise carries on in cleartext),
 * certificate verification set explicitly (Node's default yields to
 * NODE_TLS_REJECT_UNAUTHORIZED=0), and no logger (imapflow's default one
 * writes JSON to stdout, the MCP channel).
 */
export function imapOptions(
  account: Account,
  password: string,
  ca: string | undefined,
): ImapFlowOptions {
  return {
    host: account.host,
    port: account.port,
    ...(account.security === 'tls' ? { secure: true } : { secure: false, doSTARTTLS: true }),
    auth: { user: account.user, pass: password },
    tls: {
      rejectUnauthorized: true,
      // Node's `ca` replaces the default authorities: keep them, so caFile only adds one.
      ...(ca === undefined ? {} : { ca: [...getCACertificates('default'), ca] }),
    },
    logger: false,
    // One connection per tool call: nothing to keep alive between calls.
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    socketTimeout: 60_000,
  };
}
