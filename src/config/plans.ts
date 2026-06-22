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
  // 'free' is a LEGACY enum value that is intentionally NOT offered: FixMaster
  // uses a trial→paid model (signup grants 'trial', then the org subscribes to
  // a paid tier). No org is ever assigned 'free', so it has no PlanDef here.
  //
  // Two paid tiers, differentiated by FEATURE + quota to make Solo "itch" to
  // upgrade (see priceForOutlets for Pro's per-outlet add-on):
  //   - Solo (standard): a solo technician just starting out. Capped at ONE
  //     user — hiring a 2nd person is the strongest upgrade trigger in the
  //     repair niche. Core ops only; team/branding/scale features are locked.
  //   - Pro (enterprise): a growing business. Unlimited users + every feature
  //     + multi-outlet. 2 outlets included; extras priced via priceForOutlets,
  //     so maxOutlets is unlimited (-1).
  standard: {
    id: 'standard',
    name: 'Solo',
    priceLabel: 'Rp 99.000/bln',
    // Core operating loop only. Locked (Pro-only): suppliers, attendance,
    // tasks, multiOutlet, exportImport, logo, waTemplates.
    features: ['services', 'customers', 'pos', 'inventory', 'finance', 'reports'],
    maxWallets: 2,
    maxOutlets: 1,
    maxUsers: 1, // single-user — second hire forces the upgrade to Pro
  },
  enterprise: {
    id: 'enterprise',
    name: 'Pro',
    priceLabel: 'Rp 199.000/bln',
    features: ENTERPRISE_FEATURES,
    maxWallets: 99,
    maxOutlets: -1, // unlimited; 2 included, extras priced via priceForOutlets
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

/** Whether `outletCount` fits within the plan's outlet quota. -1 = unlimited. */
export function withinOutletQuota(plan: PlanType, outletCount: number): boolean {
  const max = PLANS[plan].maxOutlets;
  return max < 0 || outletCount <= max;
}

/** Whether `userCount` fits within the plan's user quota. -1 = unlimited. */
export function withinUserQuota(plan: PlanType, userCount: number): boolean {
  const max = PLANS[plan].maxUsers;
  return max < 0 || userCount <= max;
}

// ---------- Pro per-outlet pricing ----------
// Pro's base price includes PRO_INCLUDED_OUTLETS outlets; each extra outlet
// adds OUTLET_ADDON_PRICE, capped at PRO_PRICE_CEILING (beyond which outlets
// are effectively unlimited at a flat ceiling). Keeps multi-outlet pricing
// from ballooning while still capturing value as a chain grows.
export const PRO_BASE_PRICE = 199000;
export const PRO_INCLUDED_OUTLETS = 2;
export const OUTLET_ADDON_PRICE = 50000;
export const PRO_PRICE_CEILING = 349000;

/** Monthly Pro price (rupiah) for running `outletCount` outlets. */
export function priceForOutlets(outletCount: number): number {
  const extra = Math.max(0, outletCount - PRO_INCLUDED_OUTLETS);
  return Math.min(PRO_BASE_PRICE + extra * OUTLET_ADDON_PRICE, PRO_PRICE_CEILING);
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

/**
 * Role-based permissions independent of plan.
 *
 * Mirrors the server's RLS boundary (migration 0016):
 *   - manager (owner/admin): operational + financial READ + reports.
 *   - owner ONLY: billing/subscription + managing the owner role.
 *   - karyawan: scoped operational writes; NO financial visibility.
 * The server is the real enforcer; this keeps the UI from showing controls
 * that would just fail.
 */
export function roleAllows(role: Role, action: string): boolean {
  const matrix: Record<Role, string[]> = {
    owner: ['*'],
    admin: [
      'services.write', 'customers.write', 'pos.sell', 'inventory.write',
      'suppliers.write', 'tasks.complete', 'attendance.write',
      'finance.view',
    ],
    karyawan: ['services.write', 'pos.sell', 'tasks.complete', 'attendance.self'],
  };
  const allowed = matrix[role];
  return allowed.includes('*') || allowed.includes(action);
}

/** Manager = owner or admin. Matches the server's is_org_manager(). */
export function isManager(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/** Owner-only capabilities (billing, managing the owner role). */
export function isOwner(role: Role): boolean {
  return role === 'owner';
}
