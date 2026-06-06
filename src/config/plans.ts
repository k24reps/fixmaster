import type { PlanType, Role } from '@/data/types';

/** Feature flags gated by plan. */
export type Feature =
  | 'services'
  | 'customers'
  | 'pos'
  | 'inventory'
  | 'suppliers'
  | 'finance'
  | 'reports'
  | 'attendance'
  | 'tasks'
  | 'multiOutlet'
  | 'exportImport'
  | 'logo'
  | 'waTemplates';

export interface PlanDef {
  id: PlanType;
  name: string;
  priceLabel: string;
  features: Feature[];
  maxWallets: number;
  maxOutlets: number;
  maxUsers: number; // -1 = unlimited
}

const ENTERPRISE_FEATURES: Feature[] = [
  'services', 'customers', 'pos', 'inventory', 'suppliers', 'finance',
  'reports', 'attendance', 'tasks', 'multiOutlet', 'exportImport', 'logo', 'waTemplates',
];

export const PLANS: Record<PlanType, PlanDef> = {
  // NOTE: the plan_type enum keys are fixed in Postgres
  // ('free','standard','enterprise','trial','suspended'). We keep the keys
  // stable (no risky enum migration) and only tune labels/quotas/prices.
  // Locked decision: users UNLIMITED on every usable tier; price tiers by
  // number of outlets. Price numbers are PLACEHOLDER — confirm before launch.
  free: {
    id: 'free',
    name: 'Free',
    priceLabel: 'Rp 0',
    features: ['services', 'customers', 'pos'],
    maxWallets: 1,
    maxOutlets: 1,
    maxUsers: -1,
  },
  standard: {
    id: 'standard',
    name: 'Solo',
    priceLabel: 'Rp 49.000/bln', // placeholder
    features: ['services', 'customers', 'pos', 'inventory', 'finance', 'reports', 'attendance', 'tasks', 'waTemplates', 'logo'],
    maxWallets: 5,
    maxOutlets: 1,
    maxUsers: -1,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Bisnis',
    priceLabel: 'Rp 199.000/bln', // placeholder
    features: ENTERPRISE_FEATURES,
    maxWallets: 99,
    maxOutlets: 10,
    maxUsers: -1,
  },
  trial: {
    id: 'trial',
    name: 'Trial',
    priceLabel: '14 hari',
    // Trial = Bisnis minus data portability, to encourage upgrade.
    features: ENTERPRISE_FEATURES.filter((f) => f !== 'exportImport'),
    maxWallets: 99,
    maxOutlets: 10,
    maxUsers: -1,
  },
  suspended: {
    id: 'suspended',
    name: 'Suspended',
    priceLabel: '—',
    features: [],
    maxWallets: 0,
    maxOutlets: 0,
    maxUsers: 0,
  },
};

/** Whether a plan grants a feature. Internal Tasks is Enterprise/Trial only. */
export function planAllows(plan: PlanType, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

/** Paid tiers a customer can subscribe to, cheapest first (by outlet capacity). */
export const PAID_TIERS: PlanType[] = ['standard', 'enterprise'];

/** Whether `outletCount` fits within the plan's outlet quota. */
export function withinOutletQuota(plan: PlanType, outletCount: number): boolean {
  return outletCount <= PLANS[plan].maxOutlets;
}

/**
 * Cheapest paid tier that fits `outletCount` outlets, or null when no tier
 * can (i.e. exceeds the largest plan). Used to suggest an upgrade target.
 */
export function outletTierFor(outletCount: number): PlanType | null {
  for (const tier of PAID_TIERS) {
    if (withinOutletQuota(tier, outletCount)) return tier;
  }
  return null;
}

/** Role-based permissions independent of plan. */
export function roleAllows(role: Role, action: string): boolean {
  const matrix: Record<Role, string[]> = {
    owner: ['*'],
    admin: [
      'services.write', 'customers.write', 'pos.sell', 'inventory.write',
      'suppliers.write', 'tasks.complete', 'attendance.write', 'reports.view',
    ],
    karyawan: ['services.write', 'pos.sell', 'tasks.complete', 'attendance.self'],
  };
  const allowed = matrix[role];
  return allowed.includes('*') || allowed.includes(action);
}
