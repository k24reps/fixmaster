/**
 * Activity logging helper. Records an audit entry for the current actor
 * (from the session store) into the `activity` collection.
 *
 * Fire-and-forget by design: logging must NEVER block or break the user
 * action it accompanies. Failures are swallowed (best-effort audit) — the
 * server RLS is the real integrity boundary, and a missing log line should
 * not abort a sale or an edit. Call it WITHOUT await.
 *
 * Owner-only visibility is enforced by RLS (migration 0019): every member
 * may INSERT, only the owner may SELECT.
 */
import { repository } from '@/data';
import { isCloudMode } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import { newId } from '@/lib/id';
import type { ActivityAction, ActivityLog } from '@/data/types';

export interface LogInput {
  action: ActivityAction;
  entityType?: string;
  entityId?: string | null;
  entityLabel?: string;
  meta?: Record<string, unknown>;
  /**
   * Cabang OBJEK yang diubah. Dulu baris log selalu memakai cabang yang sedang
   * aktif di layar penulisnya — yang bisa sama sekali berbeda dari cabang
   * transaksinya, dan membuat penyaringan per cabang berbohong. Kosong = tidak
   * terikat cabang.
   */
  outletId?: string | null;
}

/**
 * Peristiwa yang DATABASE catat sendiri di cloud (trigger & RPC 0073/0076/0077).
 * Klien tidak ikut mencatatnya di sana: barisnya akan dobel, dan yang lebih
 * penting — jejak ini tidak boleh bergantung pada browser yang masih hidup
 * sesudah server selesai. Di lokal/demo tidak ada trigger, jadi klien tetap
 * yang mencatat.
 *
 * Satu daftar, bukan `if (!isCloudMode())` yang tersebar di tiap layar: menambah
 * trigger berikutnya cukup satu baris di sini, dan tidak ada pemanggil yang
 * ketinggalan atau berlebihan.
 */
const SERVER_LOGGED: ReadonlySet<ActivityAction> = new Set<ActivityAction>([
  'sale.void',
  'po.void',
  'wallet.transfer',
  'wallet.transfer.edit',
  'wallet.transfer.void',
  'income.delete',
  'expense.delete',
  'data.restore',
  'activity.purge',
]);

export function logActivity(input: LogInput): void {
  if (isCloudMode() && SERVER_LOGGED.has(input.action)) return;
  try {
    const { org, currentEmployee } = useSessionStore.getState();
    if (!org || !currentEmployee) return; // no actor/org context → skip
    const now = new Date().toISOString();
    const record: ActivityLog = {
      id: newId(),
      orgId: org.id,
      outletId: input.outletId ?? null,
      actorId: currentEmployee.id,
      actorName: currentEmployee.name,
      actorRole: currentEmployee.role,
      action: input.action,
      entityType: input.entityType ?? '',
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? '',
      meta: input.meta ?? {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    // Fire-and-forget: never block/break the user action. But WARN on failure —
    // a fully silent catch hid a weeks-long RLS bug that dropped every staff
    // audit entry (INSERT..RETURNING vs owner-only SELECT policy).
    void repository.put('activity', record).catch((e) => {
      console.warn('[activity] gagal mencatat log:', input.action, e);
    });
  } catch {
    // Never let logging throw into the caller.
  }
}
