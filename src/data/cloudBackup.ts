import { getSupabase, isSupabaseConfigured } from './supabase-client';

/**
 * Akses klien ke backup otomatis di bucket privat `org-backups`.
 *
 * Bucket-nya privat (tidak seperti `org-logos`), jadi tidak ada URL publik —
 * unduhan lewat objek yang di-fetch langsung dengan sesi pengguna, dan RLS
 * (migrasi 0051) memastikan owner hanya melihat folder org-nya sendiri.
 */

const BUCKET = 'org-backups';

export interface CloudBackup {
  /** Nama objek di dalam folder org, mis. `auto-2026-09-03T18-00-00-000Z.json`. */
  name: string;
  /** Path lengkap untuk unduh/hapus. */
  path: string;
  sizeBytes: number;
  createdAt: string | null;
}

export interface BackupRun {
  startedAt: string;
  finishedAt: string | null;
  status: 'ok' | 'failed';
  recordCount: number | null;
  sizeBytes: number | null;
  error: string | null;
  trigger: string;
}

/**
 * Daftar backup milik org, terbaru dulu.
 *
 * Nama berkas memuat ISO timestamp, jadi urutan leksikografis = urutan waktu;
 * itu sebabnya penamaan di Edge Function memakai timestamp yang bisa diurut,
 * dan kenapa di sini tidak perlu membaca metadata satu per satu.
 */
export async function listCloudBackups(orgId: string): Promise<CloudBackup[]> {
  const client = isSupabaseConfigured ? getSupabase() : null;
  if (!client || !orgId) return [];
  const { data, error } = await client.storage.from(BUCKET).list(orgId, { limit: 50 });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((o) => o.name.endsWith('.json'))
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((o) => ({
      name: o.name,
      path: `${orgId}/${o.name}`,
      sizeBytes: (o.metadata as { size?: number } | null)?.size ?? 0,
      createdAt: o.created_at ?? null,
    }));
}

/** Isi satu berkas backup sebagai teks, siap dioper ke `restoreBackup()`. */
export async function readCloudBackup(path: string): Promise<string> {
  const client = isSupabaseConfigured ? getSupabase() : null;
  if (!client) throw new Error('Supabase tidak terkonfigurasi');
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error) throw new Error(error.message);
  return await data.text();
}

/**
 * Percobaan backup terakhir — sukses MAUPUN gagal.
 *
 * Yang gagal justru yang paling penting ditampilkan: backup yang diam-diam
 * berhenti bekerja membuat pemilik merasa terlindungi padahal tidak.
 */
export async function latestBackupRun(orgId: string): Promise<BackupRun | null> {
  const client = isSupabaseConfigured ? getSupabase() : null;
  if (!client || !orgId) return null;
  const { data, error } = await client
    .from('backup_runs')
    .select('started_at, finished_at, status, record_count, size_bytes, error, trigger')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    startedAt: data.started_at as string,
    finishedAt: (data.finished_at as string | null) ?? null,
    status: data.status as 'ok' | 'failed',
    recordCount: (data.record_count as number | null) ?? null,
    sizeBytes: (data.size_bytes as number | null) ?? null,
    error: (data.error as string | null) ?? null,
    trigger: (data.trigger as string | null) ?? 'cron',
  };
}
