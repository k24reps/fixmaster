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
  free: {
    id: 'free',
    name: 'Free',
    priceLabel: 'Rp 0',
    features: ['services', 'customers'],
    maxWallets: 1,
    maxOutlets: 1,
    maxUsers: 2,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    priceLabel: 'Rp 99.000/bln',
    features: ['services', 'customers', 'pos', 'inventory', 'finance', 'reports', 'waTemplates'],
    maxWallets: 3,
    maxOutlets: 1,
    maxUsers: 5,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceLabel: 'Rp 199.000/bln',
    features: ENTERPRISE_FEATURES,
    maxWallets: 99,
    maxOutlets: 5,
    maxUsers: -1,
  },
  trial: {
    id: 'trial',
    name: 'Trial',
    priceLabel: '14 hari',
    // Trial = Enterprise minus data portability, to encourage upgrade.
    features: ENTERPRISE_FEATURES.filter((f) => f !== 'exportImport'),
    maxWallets: 99,
    maxOutlets: 5,
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
