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
    // Nested git worktrees (other sessions) live under .claude/.claire — they
    // hold full repo copies whose *.test files would otherwise be scanned by the
    // parent checkout's run. CI checks out clean so never sees them; locally we
    // must exclude them or every run balloons + fails on foreign node_modules.
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      '**/.claude/worktrees/**',
      '**/.claire/worktrees/**',
    ],
    // #506: the 5000ms default is too tight for a 248-file parallel jsdom suite.
    // Heavy render tests (GameForm/GameWizard) run in ≤122ms isolated but balloon
    // to 5–7s under full-suite CPU/memory contention (10 forks saturating 10 cores
    // + jsdom GC churn), tipping over 5s non-deterministically. 20s gives ~3×
    // headroom over the worst observed (7s) without masking genuine hangs.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
