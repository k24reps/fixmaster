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
import { useSessionStore } from '@/stores/session';
import { newId } from '@/lib/id';
import type { ActivityAction, ActivityLog } from '@/data/types';

export interface LogInput {
  action: ActivityAction;
  entityType?: string;
  entityId?: string | null;
  entityLabel?: string;
  meta?: Record<string, unknown>;
}

export function logActivity(input: LogInput): void {
  try {
    const { org, currentEmployee, activeOutletId } = useSessionStore.getState();
    if (!org || !currentEmployee) return; // no actor/org context → skip
    const now = new Date().toISOString();
    const record: ActivityLog = {
      id: newId(),
      orgId: org.id,
      outletId: activeOutletId,
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
    // Fire-and-forget: ignore rejection (best-effort audit).
    void repository.put('activity', record).catch(() => {});
  } catch {
    // Never let logging throw into the caller.
  }
}
