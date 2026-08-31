import { describe, expect, it } from 'vitest';
import vercelSource from '../../vercel.json?raw';

const config = JSON.parse(vercelSource) as {
  rewrites: Array<{ source: string; destination: string }>;
};

const spaRoutes = [
  '/landing-preview',
  '/operator',
  '/prototype/ticket',
  '/track',
  '/privacy',
  '/terms',
  '/reset-password',
  '/demo',
  '/services',
  '/services/:id',
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
      spaRoutes.map((source) => ({ source, destination: '/index.html' })),
    );
  });

  it('does not rewrite unknown URLs to the landing page', () => {
    expect(config.rewrites.some((rewrite) => rewrite.source.includes('(.*)'))).toBe(false);
  });
});
