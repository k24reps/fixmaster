import type { PlanType, Role } from '@/data/types';

/*
 * Sejak harga per unit (14 Nov 2026, migrasi 0101) tidak ada lagi paket yang
 * membedakan fitur atau kuota: semua toko mendapat semua modul, pengguna, dan
 * outlet. Harga tinggal di config/pricing.ts. Enum plan_type di Postgres tetap
 * ('free','standard','enterprise','trial','suspended') karena terkunci, tetapi
 * nilainya kini hanya bermakna untuk 'suspended': toko yang ditangguhkan
 * operator tidak bisa menulis apa pun.
 */

/** Toko ditangguhkan operator: server menolak semua penulisan. */
export function isSuspended(plan: PlanType | null | undefined): boolean {
  return plan === 'suspended';
}

/**
 * Role-based permissions.
 *
 * Mirrors the server's RLS boundary (migration 0016):
 *   - manager (owner/admin): operational + financial READ + reports.
 *   - owner ONLY: billing/saldo + managing the owner role + deleting tickets.
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
