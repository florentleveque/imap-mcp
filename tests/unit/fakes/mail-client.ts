/**
 * Stands in for ImapFlow in unit tests: records every call, and answers from
 * the data a test gives it. Its answers copy what imapflow returns against
 * GreenMail; the integration suite checks the real thing.
 */

import { Readable } from 'node:stream';

import type { FetchQueryObject, ImapFlowOptions } from 'imapflow';

import type { FakeMessage } from '../fixtures.js';

export class FakeMailClient {
  readonly calls: string[] = [];
  readonly listeners = new Map<string, (error: Error) => void>();
  connectError: unknown;
  lockError: unknown;
  logoutError: unknown;

  folders: unknown[] = [];
  /** Stored in UID order, as a server returns them. */
  messages: FakeMessage[] = [];
  /** What SEARCH answers; the integration suite checks the real matching. */
  searchResult: number[] | false = [];

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

  async list(): Promise<unknown[]> {
    this.calls.push('list');
    return this.folders;
  }

  async search(query: unknown, options: unknown): Promise<number[] | false> {
    this.calls.push(`search ${JSON.stringify(query)} ${JSON.stringify(options)}`);
    return this.searchResult;
  }

  async fetchAll(range: number[], query: FetchQueryObject, options: unknown) {
    const fields = Object.keys(query).filter((key) => query[key as keyof FetchQueryObject]);
    this.calls.push(
      `fetch ${JSON.stringify(range)} ${fields.join(',')} ${JSON.stringify(options)}`,
    );
    const wanted = new Set(range);
    return this.messages
      .filter((message) => wanted.has(message.uid))
      .map(({ parts: _parts, ...message }) => ({ seq: message.uid, ...message }));
  }

  async download(uid: string, part: string, options: { maxBytes?: number }) {
    this.calls.push(`download ${uid} ${part} ${JSON.stringify(options)}`);
    const stored = this.messages.find((message) => String(message.uid) === uid)?.parts[part];
    if (!stored) return {};
    const content = stored.content.subarray(0, options.maxBytes ?? stored.content.length);
    return { meta: stored.meta, content: Readable.from([content]) };
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
