// One GreenMail container, configured the same way for the integration suite
// (tests/integration/global-setup.ts) and the functional-validation
// environment (scripts/functional-env.mjs): authentication on (the image turns
// it off by default) and a keystore signed by the test CA.
import { fileURLToPath } from 'node:url';

import { GenericContainer, Wait } from 'testcontainers';

// Pinned by digest: the tag is mutable, and this image runs with the test CA.
const IMAGE =
  'greenmail/standalone:2.1.15@sha256:309ba544ea482e5d4265d09921cdab07c8dad2cc4481d715c9b8ff5d3f0a149f';
const KEYSTORE = '/home/greenmail/imap-mcp-test.p12';

const IMAP = 3143;
const IMAPS = 3993;
const API = 8080;

export const testCaPath = fileURLToPath(
  new URL('../tests/integration/fixtures/tls/ca.pem', import.meta.url),
);

/** Start the container; resolves once its API reports it ready. */
export async function startGreenMail() {
  const container = await new GenericContainer(IMAGE)
    .withEnvironment({
      GREENMAIL_OPTS: [
        '-Dgreenmail.setup.test.all',
        '-Dgreenmail.hostname=0.0.0.0',
        `-Dgreenmail.tls.keystore.file=${KEYSTORE}`,
        '-Dgreenmail.tls.keystore.password=changeit',
      ].join(' '),
    })
    .withCopyFilesToContainer([
      {
        source: fileURLToPath(
          new URL('../tests/integration/fixtures/tls/greenmail.p12', import.meta.url),
        ),
        target: KEYSTORE,
        mode: 0o644,
      },
    ])
    .withExposedPorts(IMAP, IMAPS, API)
    .withWaitStrategy(Wait.forHttp('/api/service/readiness', API).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();

  return {
    container,
    endpoints: {
      host: container.getHost(),
      imap: container.getMappedPort(IMAP),
      imaps: container.getMappedPort(IMAPS),
      api: container.getMappedPort(API),
    },
  };
}
