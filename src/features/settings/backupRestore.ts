import { repository } from '@/data';
import type { CollectionName } from '@/data/repository';
import { isSupabaseConfigured } from '@/data/supabase-client';
import { useSessionStore } from '@/stores/session';
import {
  buildBackup,
  buildRestorePayload,
  serializeBackup,
  parseBackup,
  backupFilename,
  type BackupFile,
} from '@/lib/business/backup';

/**
 * Backup / Restore IO — the bridge between the pure backup core and the
 * repository. Captures every collection plus the organization singleton into
 * one lossless JSON file.
 *
 * Restore semantics depend on the active mode:
 *   - Local-first: REPLACE everything (clearAll + putMany).
 *   - Cloud: delegate to the atomic, demo-only RPC `restore_org_data`
 *     (migration 0020) via repository.restoreOrgData. Team (memberships) and
 *     the org profile/billing are excluded; the server enforces owner +
 *     is_demo and forces org_id (cross-tenant safety). Non-demo cloud orgs
 *     rely on Supabase backups/PITR instead.
 */

/** All persisted collections (mirrors EntityMap). */
const ALL_COLLECTIONS: CollectionName[] = [
  'employees',
  'outlets',
  'customers',
  'inventory',
  'suppliers',
  'purchaseOrders',
  'wallets',
  'incomes',
  'expenses',
  'fixedCosts',
  'services',
  'sales',
  'attendance',
  'taskTemplates',
  'taskInstances',
];

/** Read every collection + the org singleton into a backup object. */
export async function createBackup(orgId: string | null): Promise<BackupFile> {
  // Force org-wide scope so the backup captures EVERY outlet's data, not just
  // the active branch. Without this, listing under an active-outlet scope
  // silently omits other branches — and a later full-restore would delete them.
  const prevOutlet = useSessionStore.getState().activeOutletId;
  if (orgId) repository.setScope(orgId, null);
  try {
    const collections: Record<string, unknown[]> = {};
    await Promise.all(
      ALL_COLLECTIONS.map(async (name) => {
        collections[name] = await repository.list(name);
      }),
    );
    const organization = await repository.getSingleton('organization');
    return buildBackup(collections, organization, orgId);
  } finally {
    if (orgId) repository.setScope(orgId, prevOutlet);
  }
}

/** Trigger a client-side download of the backup JSON. */
export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([serializeBackup(backup)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type RestoreResult =
  | { ok: true; restored: number }
  | { ok: false; error: string };

/**
 * Replace ALL current data with a backup's contents.
 * Wipes everything first (clearAll), then bulk-inserts each collection and the
 * org singleton. Records keep their original ids/timestamps so relations stay
 * intact. Returns the number of records restored.
 */
export async function restoreBackup(text: string): Promise<RestoreResult> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const backup = parsed.backup;

  try {
    // Cloud mode: delegate to the atomic, demo-only server RPC. Team
    // (memberships) + org profile/billing are excluded by buildRestorePayload,
    // and the server enforces owner + is_demo. The active org's id wins over
    // whatever the file claims (cross-tenant safety).
    if (isSupabaseConfigured && repository.restoreOrgData) {
      const orgId = useSessionStore.getState().org?.id;
      if (!orgId) return { ok: false, error: 'Tidak ada organisasi aktif.' };
      const payload = buildRestorePayload(backup);
      const restored = await repository.restoreOrgData(orgId, payload);
      return { ok: true, restored };
    }

    // Local mode: wipe everything, then bulk-insert each collection + the org
    // singleton. Records keep ids/timestamps so relations stay intact.
    // Snapshot the current data org-wide first so a mid-restore failure (quota,
    // a bad record) can roll back instead of leaving the DB wiped/partial.
    const orgId = useSessionStore.getState().org?.id ?? null;
    const prevOutlet = useSessionStore.getState().activeOutletId;
    if (orgId) repository.setScope(orgId, null);

    const snapshot: Record<string, unknown[]> = {};
    for (const name of ALL_COLLECTIONS) {
      snapshot[name] = await repository.list(name);
    }
    const prevOrg = await repository.getSingleton('organization');

    try {
      await repository.clearAll();

      let restored = 0;
      for (const name of ALL_COLLECTIONS) {
        const rows = backup.collections[name];
        if (Array.isArray(rows) && rows.length > 0) {
          await repository.putMany(name, rows as never);
          restored += rows.length;
        }
      }

      if (backup.organization) {
        await repository.setSingleton('organization', backup.organization as never);
      }

      return { ok: true, restored };
    } catch (writeErr) {
      // ponytail: best-effort rollback from the in-memory snapshot. Not a true
      // transaction (the local adapter has no cross-store txn), but it prevents
      // total data loss on a partial write.
      await repository.clearAll().catch(() => {});
      for (const name of ALL_COLLECTIONS) {
        const rows = snapshot[name];
        if (Array.isArray(rows) && rows.length > 0) {
          await repository.putMany(name, rows as never).catch(() => {});
        }
      }
      if (prevOrg) {
        await repository.setSingleton('organization', prevOrg as never).catch(() => {});
      }
      throw writeErr;
    } finally {
      if (orgId) repository.setScope(orgId, prevOutlet);
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Gagal memulihkan data.',
    };
  }
}
