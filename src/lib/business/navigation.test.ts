import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOBILE_NAV_PATHS,
  getVisibleNavigation,
  resolveMobileNavigation,
  sanitizeMobileNavPaths,
} from './navigation';

describe('mobile navigation', () => {
  it('uses the four operational defaults when no owner layout exists', () => {
    expect(sanitizeMobileNavPaths(undefined)).toEqual(DEFAULT_MOBILE_NAV_PATHS);
  });

  it('drops duplicate and unknown paths, then fills empty slots', () => {
    expect(sanitizeMobileNavPaths(['/finance', '/finance', '/unknown'])).toEqual([
      '/finance',
      '/',
      '/services',
      '/pos',
    ]);
  });

  it('fills owner-only choices with safe destinations for staff', () => {
    const staffNavigation = getVisibleNavigation('karyawan', 'enterprise');
    const resolved = resolveMobileNavigation(
      ['/reports', '/settings', '/services', '/pos'],
      staffNavigation,
    );

    expect(resolved.map(({ item }) => item.to)).toEqual(['/services', '/pos', '/', '/inventory']);
  });

  it('keeps plan-locked entries visible for the owner', () => {
    const ownerNavigation = getVisibleNavigation('owner', 'standard');
    const resolved = resolveMobileNavigation(['/attendance'], ownerNavigation);

    expect(resolved[0].item.to).toBe('/attendance');
    expect(resolved[0].locked).toBe(true);
  });
});
