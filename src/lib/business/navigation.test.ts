import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/config/navigation';
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

describe('grup rail', () => {
  // Sidebar menarik sambungan bertitik di tiap pergantian grup. Grup yang
  // muncul dua kali terpisah akan memecah satu grup menjadi dua sambungan.
  it('anggota satu grup berurutan', () => {
    const runs = NAV_ITEMS.map((item) => item.group).filter(
      (group, i, all) => i === 0 || all[i - 1] !== group,
    );
    expect(new Set(runs).size).toBe(runs.length);
  });

  it('karyawan tetap melihat dua grup: operasional dan kantor', () => {
    const groups = getVisibleNavigation('karyawan', 'enterprise').map(({ item }) => item.group);
    expect([...new Set(groups)]).toEqual(['ops', 'office']);
  });
});
