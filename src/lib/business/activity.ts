/**
 * Pure activity-log presentation logic: action labels, icons, tone, and
 * filtering. No DOM/repository deps → unit-testable. The owner-facing page
 * composes these with the raw ActivityLog rows.
 */
import type { ActivityAction, ActivityLog, Role } from '@/data/types';

export interface ActionMeta {
  /** Indonesian label for the action. */
  label: string;
  /** Icon name (must exist in the Icon registry). */
  icon: string;
  /** Semantic tone for the row accent. */
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

const ACTION_META: Record<ActivityAction, ActionMeta> = {
  'auth.login': { label: 'Masuk', icon: 'right-to-bracket', tone: 'info' },
  'sale.create': { label: 'Penjualan baru', icon: 'cash-register', tone: 'success' },
  'sale.void': { label: 'Batalkan penjualan', icon: 'circle-xmark', tone: 'danger' },
  'income.create': { label: 'Tambah pemasukan', icon: 'arrow-trend-up', tone: 'success' },
  'income.update': { label: 'Ubah pemasukan', icon: 'pen', tone: 'neutral' },
  'income.delete': { label: 'Hapus pemasukan', icon: 'trash', tone: 'danger' },
  'expense.create': { label: 'Tambah pengeluaran', icon: 'arrow-trend-down', tone: 'warning' },
  'expense.update': { label: 'Ubah pengeluaran', icon: 'pen', tone: 'neutral' },
  'expense.delete': { label: 'Hapus pengeluaran', icon: 'trash', tone: 'danger' },
  'inventory.create': { label: 'Tambah barang', icon: 'box', tone: 'success' },
  'inventory.update': { label: 'Ubah barang', icon: 'pen', tone: 'neutral' },
  'inventory.delete': { label: 'Hapus barang', icon: 'trash', tone: 'danger' },
  'customer.create': { label: 'Tambah pelanggan', icon: 'users', tone: 'success' },
  'customer.update': { label: 'Ubah pelanggan', icon: 'pen', tone: 'neutral' },
  'customer.delete': { label: 'Hapus pelanggan', icon: 'trash', tone: 'danger' },
  'attendance.update': { label: 'Koreksi absensi', icon: 'pen', tone: 'neutral' },
  'attendance.delete': { label: 'Hapus absensi', icon: 'trash', tone: 'danger' },
  'attendance.checkin': { label: 'Check-in', icon: 'right-to-bracket', tone: 'success' },
  'attendance.checkout': { label: 'Check-out', icon: 'right-from-bracket', tone: 'info' },
  'task.create': { label: 'Tambah tugas', icon: 'list-check', tone: 'success' },
  'task.complete': { label: 'Selesaikan tugas', icon: 'circle-check', tone: 'success' },
  'service.create': { label: 'Servis baru', icon: 'screwdriver-wrench', tone: 'success' },
  'service.status': { label: 'Ubah status servis', icon: 'wrench', tone: 'info' },
  'wallet.transfer': { label: 'Transfer saldo', icon: 'arrow-right-arrow-left', tone: 'info' },
};

const FALLBACK_META: ActionMeta = { label: 'Aktivitas', icon: 'info-circle', tone: 'neutral' };

/** Presentation metadata for an action verb (safe for unknown verbs). */
export function actionMeta(action: string): ActionMeta {
  return ACTION_META[action as ActivityAction] ?? FALLBACK_META;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Pemilik',
  admin: 'Admin',
  karyawan: 'Karyawan',
};

/** Indonesian label for a role (empty for null). */
export function roleLabel(role: Role | null): string {
  return role ? ROLE_LABEL[role] : '';
}

export interface ActivityFilter {
  /** Substring match on actor name or entity label (case-insensitive). */
  query?: string;
  /** Restrict to a single actor role. */
  role?: Role | 'all';
  /** Restrict to a single action verb. */
  action?: string | 'all';
}

/**
 * Filter + sort logs newest-first. Pure: returns a new array. Soft-deleted
 * rows (deletedAt) are excluded defensively, though the table is append-only.
 */
export function filterActivity(logs: ActivityLog[], filter: ActivityFilter = {}): ActivityLog[] {
  const q = (filter.query ?? '').trim().toLowerCase();
  return logs
    .filter((l) => !l.deletedAt)
    .filter((l) => (filter.role && filter.role !== 'all' ? l.actorRole === filter.role : true))
    .filter((l) => (filter.action && filter.action !== 'all' ? l.action === filter.action : true))
    .filter((l) =>
      q
        ? l.actorName.toLowerCase().includes(q) || l.entityLabel.toLowerCase().includes(q)
        : true,
    )
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/** Compact one-line summary, e.g. "Batalkan penjualan · INV-0007". */
export function summarize(log: ActivityLog): string {
  const { label } = actionMeta(log.action);
  return log.entityLabel ? `${label} · ${log.entityLabel}` : label;
}
