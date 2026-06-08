import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': dirname,
      // `server-only` is a Next.js marker module — fails the build if a
      // server module ends up in client code. In vitest the resolver doesn't
      // know about it, so we redirect to an empty stub.
      'server-only': path.join(dirname, 'vitest.server-only-stub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // #506: the 5000ms default is too tight for a 248-file parallel jsdom suite.
    // Heavy render tests (GameForm/GameWizard) run in ≤122ms isolated but balloon
    // to 5–7s under full-suite CPU/memory contention (10 forks saturating 10 cores
    // + jsdom GC churn), tipping over 5s non-deterministically. 20s gives ~3×
    // headroom over the worst observed (7s) without masking genuine hangs.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
