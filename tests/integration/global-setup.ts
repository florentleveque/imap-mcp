/**
 * Starts one GreenMail container for the whole integration run and hands its
 * endpoints to the tests through `provide`/`inject`. Authentication stays on
 * (the image disables it by default), so a wrong password really fails; each
 * test file creates its own user, which also isolates the mailboxes.
 */

import { fileURLToPath } from 'node:url';

import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

// Pinned by digest: the tag is mutable, and this image runs with the test CA.
const IMAGE =
  'greenmail/standalone:2.1.15@sha256:309ba544ea482e5d4265d09921cdab07c8dad2cc4481d715c9b8ff5d3f0a149f';
const KEYSTORE = '/home/greenmail/imap-mcp-test.p12';

const IMAP = 3143;
const IMAPS = 3993;
const API = 8080;

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
  container = await new GenericContainer(IMAGE)
    .withEnvironment({
      // The image default minus `-Dgreenmail.auth.disabled`, with our keystore.
      GREENMAIL_OPTS: [
        '-Dgreenmail.setup.test.all',
        '-Dgreenmail.hostname=0.0.0.0',
        `-Dgreenmail.tls.keystore.file=${KEYSTORE}`,
        '-Dgreenmail.tls.keystore.password=changeit',
      ].join(' '),
    })
    .withCopyFilesToContainer([
      {
        source: fileURLToPath(new URL('fixtures/tls/greenmail.p12', import.meta.url)),
        target: KEYSTORE,
        mode: 0o644,
      },
    ])
    .withExposedPorts(IMAP, IMAPS, API)
    .withWaitStrategy(Wait.forHttp('/api/service/readiness', API).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();

  project.provide('greenmail', {
    host: container.getHost(),
    imap: container.getMappedPort(IMAP),
    imaps: container.getMappedPort(IMAPS),
    api: container.getMappedPort(API),
  });
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
