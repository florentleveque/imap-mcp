import { defineConfig } from 'vitest/config';

// Integration suite: the real IMAP code against a GreenMail container. Kept out
// of `vitest.config.ts`, which Stryker and the coverage gate load, so neither
// needs Docker. Why: docs/decisions/imap-layer.md.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/integration/global-setup.ts'],
    // A cold run pulls the image before the first test; the timeouts cover a
    // TLS handshake and a few IMAP round trips, not the pull.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
