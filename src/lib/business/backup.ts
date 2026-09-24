/**
 * Backup / Restore — pure, storage-agnostic core.
 *
 * A backup is a full JSON snapshot of every collection (with real ids,
 * orgId, timestamps) PLUS the organization singleton — so it round-trips
 * losslessly, unlike the human-readable CSV export. Kept DOM/repository-free
 * so the shape + validation logic is unit-testable.
 *
 * Scope note: captures current LIVE records (soft-deleted tombstones are not
 * included by design — restoring recreates the live dataset, which is the
 * intent of a backup).
 */
import type { BackupEmailRun } from '@/data/cloudBackup';

/** Bump when the on-disk shape changes incompatibly. */
export const BACKUP_VERSION = 1;

/** Marker so we never try to restore some unrelated JSON file. */
export const BACKUP_APP = 'fixmaster';

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  orgId: string | null;
  /** collectionName → array of records (opaque here; typed at the IO layer). */
  collections: Record<string, unknown[]>;
  /** The organization singleton, or null. */
  organization: unknown | null;
}

/** Build a backup object from already-fetched data (pure). */
export function buildBackup(
  collections: Record<string, unknown[]>,
  organization: unknown | null,
  orgId: string | null,
  now: Date = new Date(),
): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    orgId,
    collections,
    organization,
  };
}

/** Pretty-print a backup to a JSON string. */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export type ParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string };

/**
 * Parse + validate a backup file's text. Rejects non-FixMaster files, wrong
 * shapes, and newer (incompatible) versions with a clear Indonesian message.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File bukan JSON yang valid.' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Struktur file backup tidak dikenali.' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.app !== BACKUP_APP) {
    return { ok: false, error: 'File ini bukan backup FixMaster.' };
  }
  if (typeof obj.version !== 'number') {
    return { ok: false, error: 'Versi backup tidak terbaca.' };
  }
  if (obj.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `Backup dibuat oleh versi lebih baru (v${obj.version}). Perbarui aplikasi dulu.`,
    };
  }
  if (typeof obj.collections !== 'object' || obj.collections === null) {
    return { ok: false, error: 'Backup tidak memuat data koleksi.' };
  }

  // Tiap koleksi HARUS array. Dulu tidak diperiksa: `{"services": "halo"}`
  // lolos sebagai file sah, lalu masuk ke penulisan sebagai `as never`.
  const collections = obj.collections as Record<string, unknown>;
  for (const [name, rows] of Object.entries(collections)) {
    if (!Array.isArray(rows)) {
      return { ok: false, error: `Koleksi "${name}" rusak — isinya bukan daftar data.` };
    }
  }

  // Backup nol data ditolak, bukan diterima lalu dijalankan.
  //
  // Restore itu GANTI TOTAL: jalur cloud (RPC restore_org_data, migrasi 0020)
  // menghapus lima belas tabel sebelum membaca satu baris pun dari payload,
  // dan jalur lokal memanggil clearAll() lebih dulu. File kosong karena itu
  // menghapus segalanya lalu melapor "berhasil memulihkan 0 data" — dengan
  // toast hijau. Tidak ada alasan sah memulihkan file nol data ke atas data
  // hidup; kalau tujuannya mengosongkan toko, itu tindakan lain.
  //
  // Ini bukan skenario karangan: unduhan yang terpotong, atau backup otomatis
  // yang gagal mengumpulkan baris, menghasilkan berkas yang persis begini —
  // dan dipulihkan lewat jalur yang sama.
  const total = Object.values(collections).reduce<number>(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
  if (total === 0) {
    return {
      ok: false,
      error: 'File backup ini tidak berisi data sama sekali. Memulihkannya akan menghapus seluruh data Anda tanpa mengembalikan apa pun.',
    };
  }

  return { ok: true, backup: obj as unknown as BackupFile };
}

/** Total record count across all collections (for confirmation copy). */
export function countRecords(backup: BackupFile): number {
  return Object.values(backup.collections).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
}

/** Dated filename slug for a downloaded backup. */
export function backupFilename(now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `fixmaster-backup-${d}.json`;
}

// ============================================================
// Cloud restore payload — pure mapping for the restore_org_data RPC.
// ============================================================

/**
 * Collection (EntityMap key) → Postgres table name, for the cloud restore RPC.
 * `employees` (→ memberships) is INTENTIONALLY OMITTED: team/login accounts are
 * never overwritten by restore (see migration 0020). FK columns that point at
 * memberships (technician_id, cashier_id, …) are nulled server-side, so the
 * client does not need to scrub them here.
 */
export const RESTORE_TABLE_MAP: Record<string, string> = {
  outlets: 'outlets',
  suppliers: 'suppliers',
  customers: 'customers',
  wallets: 'wallets',
  inventory: 'inventory_items',
  fixedCosts: 'fixed_costs',
  services: 'services',
  purchaseOrders: 'purchase_orders',
  sales: 'sales',
  incomes: 'incomes',
  expenses: 'expenses',
  attendance: 'attendance',
  activity: 'activity_logs',
  taskTemplates: 'task_templates',
  taskInstances: 'task_instances',
};

const camelToSnakeKey = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());

/**
 * Build the `restore_org_data` payload from a backup: keyed by snake_case table
 * name, each row converted to snake_case columns. Excludes memberships and the
 * organization profile/billing (never overwritten). Pure + testable.
 */
export function buildRestorePayload(backup: BackupFile): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [collection, table] of Object.entries(RESTORE_TABLE_MAP)) {
    const rows = backup.collections[collection];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    out[table] = rows.map((rec) => {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
        if (v === undefined) continue;
        row[camelToSnakeKey(k)] = v;
      }
      return row;
    });
  }
  return out;
}

// ============================================================
// Backup reminder — pure due-date logic.
// ============================================================

export type BackupFrequency = 'off' | 'daily' | 'weekly' | 'monthly';

const FREQUENCY_DAYS: Record<Exclude<BackupFrequency, 'off'>, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

/**
 * Whether a backup is due given the last backup time + chosen frequency.
 * - 'off' → never due.
 * - never backed up (null) → due (when a frequency is set).
 * - otherwise → due once the interval has elapsed.
 */
export function isBackupDue(
  lastBackupAt: string | null,
  frequency: BackupFrequency,
  now: Date = new Date(),
): boolean {
  if (frequency === 'off') return false;
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt).getTime();
  if (Number.isNaN(last)) return true;
  const elapsedDays = (now.getTime() - last) / 86_400_000;
  return elapsedDays >= FREQUENCY_DAYS[frequency];
}
/**
 * Pemangkasan retensi auto-backup.
 *
 * Salinan asli logika ini hidup di Edge Function (`supabase/functions/
 * auto-backup/index.ts`), yang berjalan di Deno dan tidak ikut suite ini.
 * Yang diuji di sini adalah KONTRAKNYA — kalau perilaku di bawah berubah,
 * fungsi itu ikut salah, dan kesalahannya berupa data yang terhapus.
 */
export function prunableBackups(names: string[], keep: number): string[] {
  return [...names].sort().reverse().slice(keep);
}

/** Satu kalimat status email backup terakhir untuk kartu Backup & Restore. */
export function backupEmailStatus(run: BackupEmailRun | null): string {
  if (!run) return 'Email pertama dikirim Senin berikutnya pukul 07.00 WIB.';
  const when = new Date(run.sentAt).toLocaleString('id-ID');
  switch (run.status) {
    case 'sent':
      return `Terakhir dikirim ${when} ke ${run.recipients.join(', ')}.`;
    case 'failed':
      return `Pengiriman terakhir gagal (${when})${run.error ? ` — ${run.error}` : ''}.`;
    case 'skipped':
      return `Minggu terakhir dilewati (${when})${run.error ? `: ${run.error}` : ''}.`;
    default:
      return `Uji coba server ${when} — belum benar-benar dikirim.`;
  }
}
