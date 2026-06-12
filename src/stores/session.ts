import { create } from 'zustand';
import type { Organization, Employee, ID } from '@/data/types';
import { repository } from '@/data';
import { isSupabaseConfigured, getMyMembership, claimInvite } from '@/data/supabase-client';

const ACTIVE_EMP_KEY = 'fixmaster-active-emp'; // sessionStorage: forces PIN re-entry per tab
const ACTIVE_ORG_KEY = 'fixmaster-active-org'; // localStorage: which org is loaded locally
const ACTIVE_OUTLET_KEY = 'fixmaster-active-outlet'; // localStorage: active branch scope

export type BootState = 'loading' | 'needs-setup' | 'needs-pin' | 'ready';

interface SessionState {
  boot: BootState;
  org: Organization | null;
  employees: Employee[];
  currentEmployee: Employee | null;
  /** Active branch scope. null = "All Outlets". */
  activeOutletId: ID | null;
  /**
   * Outlets this user may access (cloud Level 2). Empty = no restriction
   * (manager, local mode, or pre-assignment). Drives the branch selector and
   * transaction outlet resolution.
   */
  allowedOutletIds: ID[];

  bootstrap: () => Promise<void>;
  setOrg: (org: Organization) => void;
  loadEmployees: () => Promise<void>;
  signInEmployee: (employee: Employee) => void;
  signOutEmployee: () => void;
  setActiveOutlet: (outletId: ID | null) => void;
  /** Clear in-memory session (used on cloud account switch). Non-destructive. */
  reset: () => void;
  resetWorkspace: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  boot: 'loading',
  org: null,
  employees: [],
  currentEmployee: null,
  activeOutletId: null,
  allowedOutletIds: [],

  bootstrap: async () => {
    // Cloud mode: the signed-in account drives identity. Resolve the org +
    // current employee from the user's membership (no PIN, no localStorage).
    if (isSupabaseConfigured) {
      // Defensive: ensure splash during (re)resolution. On account switch the
      // auth store also calls reset() so boot is already 'loading' here.
      set({ boot: 'loading' });
      let membership = await getMyMembership();
      if (!membership) {
        // New account may have been invited to an org — claim it before
        // falling back to onboarding (joins as a member, skips the wizard).
        const claimedOrgId = await claimInvite().catch(() => null);
        if (claimedOrgId) {
          membership = await getMyMembership();
        }
      }
      if (!membership) {
        set({ boot: 'needs-setup' });
        return;
      }
      repository.setScope(membership.orgId, null);
      const org = await repository.getSingleton('organization');
      if (!org) {
        set({ boot: 'needs-setup' });
        return;
      }
      const employees = await repository.list('employees');
      const emp = employees.find((e) => e.id === membership.membershipId) ?? null;
      set({
        org,
        employees,
        currentEmployee: emp,
        activeOutletId: null,
        allowedOutletIds: membership.outletIds ?? [],
        boot: 'ready',
      });
      return;
    }

    const orgId = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!orgId) {
      set({ boot: 'needs-setup' });
      return;
    }
    const activeOutlet = localStorage.getItem(ACTIVE_OUTLET_KEY) || null;
    repository.setScope(orgId, activeOutlet);
    const org = await repository.getSingleton('organization');
    if (!org) {
      set({ boot: 'needs-setup' });
      return;
    }
    const employees = await repository.list('employees');
    set({ org, employees, activeOutletId: activeOutlet });

    // Restore the per-tab employee session if present.
    const activeEmp = sessionStorage.getItem(ACTIVE_EMP_KEY);
    const emp = activeEmp ? employees.find((e) => e.id === activeEmp) : null;
    if (emp) {
      set({ currentEmployee: emp, boot: 'ready' });
    } else {
      set({ boot: 'needs-pin' });
    }
  },

  setOrg: (org) => {
    localStorage.setItem(ACTIVE_ORG_KEY, org.id);
    repository.setScope(org.id, null);
    set({ org });
  },

  loadEmployees: async () => {
    const employees = await repository.list('employees');
    set({ employees });
  },

  signInEmployee: (employee) => {
    sessionStorage.setItem(ACTIVE_EMP_KEY, employee.id);
    set({ currentEmployee: employee, boot: 'ready' });
  },

  signOutEmployee: () => {
    sessionStorage.removeItem(ACTIVE_EMP_KEY);
    set({ currentEmployee: null, boot: 'needs-pin' });
  },

  setActiveOutlet: (outletId) => {
    const orgId = useSessionStore.getState().org?.id;
    if (!orgId) return;
    if (outletId) localStorage.setItem(ACTIVE_OUTLET_KEY, outletId);
    else localStorage.removeItem(ACTIVE_OUTLET_KEY);
    // Re-scope the repository BEFORE state updates, so the subsequent
    // refetch (triggered by the changed query key) reads the new scope.
    repository.setScope(orgId, outletId);
    set({ activeOutletId: outletId });
  },

  reset: () => {
    // Release any cloud realtime channels bound to the previous org/account.
    repository.dispose?.();
    set({ boot: 'loading', org: null, employees: [], currentEmployee: null, activeOutletId: null, allowedOutletIds: [] });
  },

  resetWorkspace: async () => {
    // Cloud: clearAll() is intentionally a no-op (multi-tenant safety), so a
    // reset must go through the atomic, owner-only RPC. An empty payload wipes
    // ALL operational data while KEEPING the org, team (memberships), and
    // subscription — the account stays signed in with an empty workspace (it
    // does NOT return to the wizard, since the org still exists). The RPC
    // notifies every collection, so the UI refetches to empty.
    if (isSupabaseConfigured) {
      const orgId = get().org?.id;
      if (orgId && repository.restoreOrgData) {
        await repository.restoreOrgData(orgId, {});
      }
      return;
    }
    // Local: full wipe + back to the setup wizard.
    await repository.clearAll();
    localStorage.removeItem(ACTIVE_ORG_KEY);
    localStorage.removeItem(ACTIVE_OUTLET_KEY);
    sessionStorage.removeItem(ACTIVE_EMP_KEY);
    set({ boot: 'needs-setup', org: null, employees: [], currentEmployee: null, activeOutletId: null });
  },
}));

/** Convenience selector for the current employee's id. */
export function currentEmployeeId(): ID | null {
  return useSessionStore.getState().currentEmployee?.id ?? null;
}

/**
 * Resolve which outlet a newly-created transaction should be stamped with.
 * - If a specific outlet is active, use it.
 * - Else ("All Outlets"): fall back to the user's single allowed outlet, or
 *   the org's primary/first outlet. Returns null only when no outlet exists.
 * `requirePick` (OQ-C) is true for multi-outlet staff who must choose a branch
 * explicitly; callers should block and prompt when this returns null.
 */
export function resolveCreateOutlet(outlets: { id: ID; isPrimary?: boolean }[]): ID | null {
  const { activeOutletId, allowedOutletIds } = useSessionStore.getState();
  if (activeOutletId) return activeOutletId;
  // Staff restricted to exactly one outlet → unambiguous.
  if (allowedOutletIds.length === 1) return allowedOutletIds[0];
  // Otherwise default to primary (or first) outlet within the allowed set.
  const pool = allowedOutletIds.length
    ? outlets.filter((o) => allowedOutletIds.includes(o.id))
    : outlets;
  if (pool.length === 0) return null;
  return (pool.find((o) => o.isPrimary) ?? pool[0]).id;
}

/**
 * Whether a multi-outlet user must explicitly pick a branch before transacting
 * (OQ-C): true when "All Outlets" is active AND they can access more than one
 * outlet. Managers (no restriction) with multiple outlets also must pick.
 */
export function mustPickOutlet(outletCount: number): boolean {
  const { activeOutletId, allowedOutletIds } = useSessionStore.getState();
  if (activeOutletId) return false;
  const reachable = allowedOutletIds.length || outletCount;
  return reachable > 1;
}
