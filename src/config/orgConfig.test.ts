import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Organization } from '@/data/types';

// --- Mocks ---------------------------------------------------------------
// orgConfig pulls the active org from the session store and writes via the
// repository. Both are mocked so these tests stay pure (no IndexedDB/Supabase).

const state: { org: Organization | null } = { org: null };
const setStateMock = vi.fn((patch: { org: Organization }) => {
  state.org = patch.org;
});

vi.mock('@/stores/session', () => ({
  useSessionStore: {
    getState: () => ({ org: state.org }),
    setState: (patch: { org: Organization }) => setStateMock(patch),
  },
}));

const setSingletonMock = vi.fn(async (_name: string, value: Organization) => value);

vi.mock('@/data', () => ({
  repository: {
    setSingleton: (name: string, value: Organization) => setSingletonMock(name, value),
  },
}));

import { getCategories, setCategories, seedCategoriesFromLocal } from './orgConfig';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'TechFix',
    address: '',
    phone: '',
    logoDataUrl: null,
    servicePrefix: 'FM',
    planType: 'trial',
    trialStartedAt: null,
    planExpiredAt: null,
    maxOutlets: 1,
    maxUsers: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Organization;
}

describe('orgConfig device categories (cloud-backed, 0032)', () => {
  beforeEach(() => {
    state.org = makeOrg();
    setStateMock.mockClear();
    setSingletonMock.mockClear();
    localStorage.clear();
  });

  it('reads categories from the org settings (cloud) when present', () => {
    state.org = makeOrg({ settings: { deviceCategories: ['Laptop', 'HP'] } });
    expect(getCategories()).toEqual(['Laptop', 'HP']);
  });

  it('falls back to legacy per-device localStorage when cloud is empty', () => {
    localStorage.setItem('fixmaster-categories-org-1', JSON.stringify(['Printer']));
    expect(getCategories()).toEqual(['Printer']);
  });

  it('returns empty list when neither cloud nor local has data', () => {
    expect(getCategories()).toEqual([]);
  });

  it('persists categories to the org row and refreshes the session store', async () => {
    await setCategories(['Tablet', 'Konsol']);
    expect(setSingletonMock).toHaveBeenCalledTimes(1);
    const [name, value] = setSingletonMock.mock.calls[0];
    expect(name).toBe('organization');
    expect(value.settings?.deviceCategories).toEqual(['Tablet', 'Konsol']);
    // Store updated so readers react immediately.
    expect(setStateMock).toHaveBeenCalledTimes(1);
    expect(getCategories()).toEqual(['Tablet', 'Konsol']);
  });

  it('preserves other settings keys when writing categories', async () => {
    state.org = makeOrg({ settings: { deviceCategories: ['A'] } });
    await setCategories(['A', 'B']);
    const [, value] = setSingletonMock.mock.calls[0];
    expect(value.settings?.deviceCategories).toEqual(['A', 'B']);
  });

  describe('seedCategoriesFromLocal', () => {
    it('lifts a legacy local list into the cloud when cloud is empty', async () => {
      localStorage.setItem('fixmaster-categories-org-1', JSON.stringify(['Laptop']));
      const seeded = await seedCategoriesFromLocal();
      expect(seeded).toBe(true);
      expect(setSingletonMock).toHaveBeenCalledTimes(1);
      expect(getCategories()).toEqual(['Laptop']);
    });

    it('is a no-op when the cloud copy already exists', async () => {
      state.org = makeOrg({ settings: { deviceCategories: ['Laptop'] } });
      localStorage.setItem('fixmaster-categories-org-1', JSON.stringify(['Stale']));
      const seeded = await seedCategoriesFromLocal();
      expect(seeded).toBe(false);
      expect(setSingletonMock).not.toHaveBeenCalled();
    });

    it('is a no-op when there is nothing local to seed', async () => {
      const seeded = await seedCategoriesFromLocal();
      expect(seeded).toBe(false);
      expect(setSingletonMock).not.toHaveBeenCalled();
    });
  });
});
