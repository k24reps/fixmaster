import { repository } from '@/data';
import type { CollectionName } from '@/data/repository';
import {
  buildBackup,
  serializeBackup,
  parseBackup,
  backupFilename,
  type BackupFile,
} from '@/lib/business/backup';

/**
 * Backup / Restore IO — the bridge between the pure backup core and the
 * repository. Captures every collection plus the organization singleton into
 * one lossless JSON file, and restores by REPLACING all data (clearAll +
 * putMany), which is the safest, most predictable semantics for a restore.
 *
 * Scope: local-first mode. In cloud mode, restore is intentionally disabled
 * (cross-tenant id collisions + RLS make a blind bulk overwrite unsafe);
 * cloud users rely on Supabase backups/PITR instead.
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
  const collections: Record<string, unknown[]> = {};
  await Promise.all(
    ALL_COLLECTIONS.map(async (name) => {
      collections[name] = await repository.list(name);
    }),
  );
  const organization = await repository.getSingleton('organization');
  return buildBackup(collections, organization, orgId);
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
    await repository.clearAll();

    let restored = 0;
    for (const name of ALL_COLLECTIONS) {
      const rows = backup.collections[name];
      if (Array.isArray(rows) && rows.length > 0) {
        // The backup carries fully-formed records; putMany re-stamps updatedAt
        // but preserves id/orgId/createdAt, so relations are kept.
        await repository.putMany(name, rows as never);
        restored += rows.length;
      }
    }

    if (backup.organization) {
      await repository.setSingleton('organization', backup.organization as never);
    }

    return { ok: true, restored };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Gagal memulihkan data.',
    };
  }
}
