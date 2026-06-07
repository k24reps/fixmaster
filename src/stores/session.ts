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

export const useSessionStore = create<SessionState>((set) => ({
  boot: 'loading',
  org: null,
  employees: [],
  currentEmployee: null,
  activeOutletId: null,

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
      set({ org, employees, currentEmployee: emp, activeOutletId: null, boot: 'ready' });
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
    set({ boot: 'loading', org: null, employees: [], currentEmployee: null, activeOutletId: null });
  },

  resetWorkspace: async () => {
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
