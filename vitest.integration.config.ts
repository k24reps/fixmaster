import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Separate config for network-bound integration tests (RLS/RPC against the
 * staging Supabase project). Kept out of the default `npm run test` run so the
 * fast, offline unit suite stays pure. Run with: `npm run test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: [
      'tests/integration/**/*.integration.test.ts',
      'tests/audit/**/*.audit.test.ts',
    ],
    globals: true,
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
