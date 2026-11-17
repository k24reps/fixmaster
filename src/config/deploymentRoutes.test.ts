import { describe, expect, it } from 'vitest';
import vercelSource from '../../vercel.json?raw';
import { STATIC_PAGES } from './staticPages';

const config = JSON.parse(vercelSource) as {
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

// Rute yang boleh diindeks mesin pencari. Rewrite lain (lacak pelanggan, demo,
// operator, halaman aplikasi yang bagi tamu menampilkan landing) wajib noindex.
const indexableRoutes = ['/privacy', '/terms'];

// Sumber header di vercel.json ditulis sebagai grup regex mentah tanpa
// parameter bernama, jadi RegExp biasa mencocokkannya sama seperti Vercel.
function headersFor(path: string) {
  return config.headers
    .filter((rule) => new RegExp(`^${rule.source}$`).test(path))
    .flatMap((rule) => rule.headers);
}

const robotsTagFor = (path: string) =>
  headersFor(path).find((header) => header.key === 'X-Robots-Tag')?.value;

const spaRoutes = [
  '/landing-preview',
  '/operator',
  // '/prototype/ticket' sengaja tidak ada: rutenya hanya didaftarkan di dev
  // server (router.tsx, devOnlyRoutes), jadi produksi tak perlu rewrite-nya.
  '/track',
  '/t/:code',
  '/privacy',
  '/terms',
  '/reset-password',
  '/demo',
  '/services',
  '/services/:id',
  '/calculator',
  '/pos',
  '/customers',
  '/inventory',
  '/suppliers',
  '/finance',
  '/tasks',
  '/attendance',
  '/reports',
  '/activity',
  '/settings',
];

describe('Vercel SPA route allowlist', () => {
  it('keeps every public and app deep link available', () => {
    expect(config.rewrites).toEqual(
      spaRoutes.map((source) => {
        // Halaman publik non-landing punya HTML statis sendiri (staticPages.ts).
        const page = STATIC_PAGES.find((p) => p.path === source);
        return { source, destination: page ? `/${page.file}` : '/index.html' };
      }),
    );
  });

  it('does not rewrite unknown URLs to the landing page', () => {
    expect(config.rewrites.some((rewrite) => rewrite.source.includes('(.*)'))).toBe(false);
  });
});

describe('Vercel crawler headers', () => {
  it('writes header sources without named params, so the test matcher stays faithful', () => {
    expect(config.headers.some((rule) => rule.source.includes(':'))).toBe(false);
  });

  it('marks every non-public rewrite noindex', () => {
    for (const { source } of config.rewrites) {
      if (indexableRoutes.includes(source)) continue;
      const path = source.replace(/:\w+/g, 'X7K2QA');
      expect(robotsTagFor(path), path).toBe('noindex');
    }
  });

  it('keeps the landing and legal pages indexable', () => {
    for (const path of ['/', ...indexableRoutes]) {
      expect(robotsTagFor(path), path).toBeUndefined();
    }
  });

  it('points agent-readable files at the landing as canonical', () => {
    for (const path of ['/index.md', '/pricing.md', '/llms.txt', '/llms-full.txt']) {
      expect(headersFor(path)).toContainEqual({
        key: 'Link',
        value: '<https://fixmaster.app/>; rel="canonical"',
      });
    }
    expect(headersFor('/indexXmd')).not.toContainEqual(
      expect.objectContaining({ value: '<https://fixmaster.app/>; rel="canonical"' }),
    );
  });
});
