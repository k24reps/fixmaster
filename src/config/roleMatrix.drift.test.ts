/**
 * TIER 3 — Anti-drift: cermin peran KLIEN vs penegak SERVER (RLS).
 *
 * `roleAllows`/`isManager`/`isOwner` di plans.ts hanya MENCERMINKAN batas RLS
 * server (migration 0002/0009/0010/0016/0017). Bila server berubah tapi cermin
 * klien tidak (atau sebaliknya), UI bisa menampilkan kontrol yang pasti gagal
 * atau menyembunyikan yang seharusnya ada. Test ini mengunci konsistensinya.
 *
 * Sumber kebenaran = matriks server di bawah, diturunkan langsung dari policy.
 * Hijau = cermin konsisten. Bila merah → salah satu sisi bergeser.
 */
import { describe, it, expect } from 'vitest';
import type { Role } from '@/data/types';
import { roleAllows, isManager, isOwner } from './plans';

// Batas server yang relevan untuk UI (dari RLS/RPC):
//   - Baca keuangan (incomes/expenses select) = manager-only (0016).
//   - Manager (is_org_manager) = owner + admin (0001).
//   - Owner-only: billing/start_subscription (0016) + kelola peran owner.
const SERVER = {
  financeReadManagerOnly: true,
  managers: ['owner', 'admin'] as Role[],
  owners: ['owner'] as Role[],
};

describe('Tier 3 — anti-drift: isManager mirrors is_org_manager()', () => {
  for (const role of ['owner', 'admin', 'karyawan'] as Role[]) {
    it(`isManager(${role}) == server`, () => {
      expect(isManager(role)).toBe(SERVER.managers.includes(role));
    });
  }
});

describe('Tier 3 — anti-drift: isOwner mirrors is_org_owner()', () => {
  for (const role of ['owner', 'admin', 'karyawan'] as Role[]) {
    it(`isOwner(${role}) == server`, () => {
      expect(isOwner(role)).toBe(SERVER.owners.includes(role));
    });
  }
});

describe('Tier 3 — anti-drift: finance visibility mirrors RLS', () => {
  it('hanya manager yang boleh finance.view (incomes/expenses manager-only)', () => {
    expect(roleAllows('owner', 'finance.view')).toBe(true);
    expect(roleAllows('admin', 'finance.view')).toBe(true);
    // karyawan TIDAK boleh — sesuai incomes_select/expenses_select 0016.
    expect(roleAllows('karyawan', 'finance.view')).toBe(false);
  });

  it('konsisten dengan flag SERVER.financeReadManagerOnly', () => {
    const managerOnly =
      roleAllows('owner', 'finance.view') &&
      roleAllows('admin', 'finance.view') &&
      !roleAllows('karyawan', 'finance.view');
    expect(managerOnly).toBe(SERVER.financeReadManagerOnly);
  });
});
