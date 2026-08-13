/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // The only chunk above the default 500 KB limit is react-vendor (the
    // framework itself), which is cached independently and can't be split
    // meaningfully. Raise the warning threshold so the build stays clean.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendor code into separate chunks so
        // they cache independently of app code and shrink the entry bundle.
        // Function form (Vite 8 / Rolldown types manualChunks as a function).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase-vendor';
          if (
            id.includes('/react-router') ||
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // The offline unit suite lives under src/. Network-bound integration
    // tests (tests/integration/**) run separately via test:integration so a
    // plain `npm run test` stays fast and hermetic.
    // Edge Functions are Deno, but their PURE helpers (e.g. the GoPay
    // notification parser) are plain TS and belong in the offline suite —
    // that parser guards a money path and must not ship untested.
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'supabase/functions/**/*.{test,spec}.ts',
    ],
    exclude: ['tests/integration/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/data/**'],
      exclude: ['**/*.test.ts', '**/types.ts'],
    },
  },
});
