/**
 * Starts one GreenMail container for the whole integration run and hands its
 * endpoints to the tests through `provide`/`inject`. Each test file creates its
 * own user, which also isolates the mailboxes.
 */

import type { StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';

import { startGreenMail } from '../../scripts/greenmail.mjs';

export interface GreenMailEndpoints {
  host: string;
  imap: number;
  imaps: number;
  api: number;
}

declare module 'vitest' {
  export interface ProvidedContext {
    greenmail: GreenMailEndpoints;
  }
}

let container: StartedTestContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  const started = await startGreenMail();
  container = started.container;
  project.provide('greenmail', started.endpoints);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
