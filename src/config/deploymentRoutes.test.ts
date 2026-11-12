import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router-dom';
import vercelSource from '../../vercel.json?raw';
import { productionRoutes } from '@/app/router';

const config = JSON.parse(vercelSource) as {
  rewrites: Array<{ source: string; destination: string }>;
};

/**
 * Every path the production router serves, as a Vercel source pattern.
 * Derived from the router itself: the old hand-written list here missed
 * `/istilah`, so the glossary 404'd on refresh while this test stayed green.
 */
function routerPaths(routes: RouteObject[], parent = ''): string[] {
  return routes.flatMap((r) => {
    if (r.index || r.path === '*') return [];
    const path = r.path?.startsWith('/') ? r.path : `${parent.replace(/\/$/, '')}/${r.path ?? ''}`;
    // `/` is index.html itself; Vercel serves it without a rewrite.
    const own = path === '/' ? [] : [path];
    return [...own, ...routerPaths(r.children ?? [], path)];
  });
}

/**
 * Served by index.html but chosen OUTSIDE the router: App.tsx swaps in the
 * demo app when `location.pathname === '/demo'`.
 */
const NON_ROUTER_PATHS = ['/demo'];

describe('Vercel SPA route allowlist', () => {
  it('rewrites exactly the routes the production bundle serves', () => {
    const expected = [...routerPaths(productionRoutes), ...NON_ROUTER_PATHS].sort();
    expect(config.rewrites.map((r) => r.source).sort()).toEqual(expected);
  });

  it('includes known deep links (guards the derivation itself)', () => {
    const paths = routerPaths(productionRoutes);
    for (const p of ['/istilah', '/services/:id', '/t/:code', '/track', '/settings']) {
      expect(paths).toContain(p);
    }
    // Dev-only routes stay out of the production list (router.tsx, devOnlyRoutes).
    expect(paths).not.toContain('/prototype/ticket');
  });

  it('points every rewrite at the SPA shell', () => {
    for (const r of config.rewrites) expect(r.destination).toBe('/index.html');
  });

  it('does not rewrite unknown URLs to the landing page', () => {
    expect(config.rewrites.some((rewrite) => rewrite.source.includes('(.*)'))).toBe(false);
  });
});
