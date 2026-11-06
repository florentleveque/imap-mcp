/**
 * Stands in for ImapFlow in unit tests: records every call, and answers from
 * the data a test gives it. Its answers copy what imapflow returns against
 * GreenMail; the integration suite checks the real thing.
 */

import type { ImapFlowOptions } from 'imapflow';

export class FakeMailClient {
  readonly calls: string[] = [];
  readonly listeners = new Map<string, (error: Error) => void>();
  connectError: unknown;
  lockError: unknown;
  logoutError: unknown;

  constructor(readonly options: ImapFlowOptions = {}) {}

  on(event: string, listener: (error: Error) => void): this {
    this.listeners.set(event, listener);
    return this;
  }

  async connect(): Promise<void> {
    this.calls.push(`connect${this.listeners.has('error') ? ' (error listener set)' : ''}`);
    if (this.connectError) throw this.connectError;
  }

  async logout(): Promise<void> {
    this.calls.push('logout');
    if (this.logoutError) throw this.logoutError;
  }

  close(): void {
    this.calls.push('close');
  }

  async getMailboxLock(path: string, options: unknown): Promise<{ release(): void }> {
    this.calls.push(`lock ${path} ${JSON.stringify(options)}`);
    if (this.lockError) throw this.lockError;
    return { release: () => this.calls.push(`release ${path}`) };
  }
}

/** An `openClient` that hands out `client` and keeps the options it was given. */
export function opener(client = new FakeMailClient()) {
  const opened: ImapFlowOptions[] = [];
  const openClient = (options: ImapFlowOptions) => {
    opened.push(options);
    return client as never;
  };
  return { client, opened, openClient };
}
