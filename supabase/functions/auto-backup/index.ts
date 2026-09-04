// ============================================================
// FixMaster — Edge Function: auto-backup
//
// Membuat snapshot JSON penuh untuk SETIAP organisasi aktif, mengunggahnya ke
// bucket privat `org-backups`, memangkas riwayat ke RETENTION berkas terbaru,
// dan mencatat tiap percobaan di `backup_runs`.
//
// Kenapa fungsi, bukan SQL murni: Storage adalah API, bukan tabel — plpgsql
// tidak bisa menulis byte berkasnya. Jadi pg_cron memanggil endpoint ini
// (lihat migrasi 0052) dan fungsi inilah yang berbicara ke Storage.
//
// Gerbang: `verify_jwt = false` di config.toml supaya pg_cron bisa
// menjangkaunya, lalu SATU-SATUNYA gerbang adalah header rahasia bersama.
// Menyerahkannya ke verify_jwt akan salah: JWT pengguna biasa mana pun juga
// lolos, dan endpoint ini menyentuh data SEMUA organisasi.
//
// Deploy:
//   supabase functions deploy auto-backup
//   supabase secrets set BACKUP_CRON_SECRET="<rahasia panjang acak>"
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Versi format berkas — harus sama dengan BACKUP_VERSION di src/lib/business/backup.ts. */
const BACKUP_VERSION = 1;
const BACKUP_APP = 'fixmaster';
const BUCKET = 'org-backups';

/** Berapa banyak salinan disimpan per organisasi. Yang terlama dibuang. */
const RETENTION = 7;

/**
 * Tabel Postgres → nama koleksi di berkas backup.
 *
 * Ini KEBALIKAN dari RESTORE_TABLE_MAP di `src/lib/business/backup.ts`, dan
 * keduanya harus tetap sepadan: berkas yang ditulis di sini dipulihkan oleh
 * `restoreBackup()` di klien. `memberships` sengaja tidak ada — akun tim tidak
 * pernah ditimpa oleh restore (migrasi 0020).
 */
const TABLE_TO_COLLECTION: Record<string, string> = {
  outlets: 'outlets',
  suppliers: 'suppliers',
  customers: 'customers',
  wallets: 'wallets',
  inventory_items: 'inventory',
  fixed_costs: 'fixedCosts',
  services: 'services',
  purchase_orders: 'purchaseOrders',
  sales: 'sales',
  incomes: 'incomes',
  expenses: 'expenses',
  attendance: 'attendance',
  activity_logs: 'activity',
  task_templates: 'taskTemplates',
  task_instances: 'taskInstances',
};

const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

function fromRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[snakeToCamel(k)] = v;
  return out;
}

/**
 * Nama objek untuk satu backup. ISO timestamp dengan `:` diganti `-` agar aman
 * sebagai nama berkas, dan tetap terurut leksikografis — itulah yang membuat
 * pemangkasan retensi bisa mengandalkan urutan nama saja.
 */
function objectName(orgId: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${orgId}/auto-${stamp}.json`;
}

/**
 * Objek yang harus dihapus agar tersisa `keep` terbaru.
 *
 * Kontraknya diuji di `src/lib/business/backup.test.ts` lewat kembaran
 * `prunableBackups()` — fungsi ini berjalan di Deno dan tidak ikut suite
 * Vitest, jadi keduanya harus berperilaku identik. Kesalahan di sini berupa
 * DATA YANG TERHAPUS, bukan sekadar tampilan yang meleset.
 */
export function prunable(names: string[], keep: number): string[] {
  return [...names].sort().reverse().slice(keep);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const expected = Deno.env.get('BACKUP_CRON_SECRET');
  if (!expected) {
    // Gagal tertutup: tanpa rahasia terkonfigurasi, endpoint ini menolak
    // melayani apa pun alih-alih berjalan tanpa gerbang.
    return new Response(JSON.stringify({ error: 'BACKUP_CRON_SECRET belum diset' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (req.headers.get('x-cron-secret') !== expected) {
    return new Response('forbidden', { status: 403 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Organisasi yang tidak disuspend. Org yang sudah kedaluwarsa tetap
  // di-backup: justru di situ pemiliknya paling mungkin butuh datanya kembali.
  const { data: orgs, error: orgErr } = await admin
    .from('organizations')
    .select('*')
    .neq('plan_type', 'suspended');

  if (orgErr) {
    return new Response(JSON.stringify({ error: orgErr.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const results: { orgId: string; status: string; error?: string }[] = [];

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    const startedAt = new Date().toISOString();
    let objectPath: string | null = null;
    let sizeBytes = 0;
    let recordCount = 0;

    try {
      // ---- 1) Kumpulkan seluruh koleksi ----
      const collections: Record<string, unknown[]> = {};
      for (const [table, collection] of Object.entries(TABLE_TO_COLLECTION)) {
        const { data, error } = await admin
          .from(table)
          .select('*')
          .eq('org_id', orgId)
          .is('deleted_at', null);
        if (error) throw new Error(`${table}: ${error.message}`);
        collections[collection] = (data ?? []).map(fromRow);
        recordCount += data?.length ?? 0;
      }

      // ---- 2) Rakit berkas dalam format BackupFile v1 ----
      const now = new Date();
      const backup = {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exportedAt: now.toISOString(),
        orgId,
        collections,
        organization: fromRow(org as Record<string, unknown>),
      };
      const body = JSON.stringify(backup, null, 2);
      sizeBytes = new TextEncoder().encode(body).length;

      // ---- 3) Unggah ----
      objectPath = objectName(orgId, now);
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(objectPath, new Blob([body], { type: 'application/json' }), {
          contentType: 'application/json',
          upsert: false,
        });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      // ---- 4) Pangkas ke RETENTION terbaru ----
      // Pemangkasan sengaja SETELAH unggah berhasil: kalau unggahan gagal,
      // salinan lama tidak boleh ikut hilang.
      const { data: listed, error: listErr } = await admin.storage
        .from(BUCKET)
        .list(orgId, { limit: 100 });
      if (listErr) throw new Error(`list: ${listErr.message}`);
      const stale = prunable(
        (listed ?? []).map((o) => o.name),
        RETENTION,
      );
      if (stale.length > 0) {
        const { error: rmErr } = await admin.storage
          .from(BUCKET)
          .remove(stale.map((n) => `${orgId}/${n}`));
        // Gagal memangkas TIDAK menggagalkan backup — berkasnya sudah aman;
        // yang tersisa hanya kelebihan penyimpanan.
        if (rmErr) console.error(`[auto-backup] prune ${orgId}: ${rmErr.message}`);
      }

      await admin.from('backup_runs').insert({
        org_id: orgId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'ok',
        object_path: objectPath,
        size_bytes: sizeBytes,
        record_count: recordCount,
        trigger: 'cron',
      });
      results.push({ orgId, status: 'ok' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Kegagalan satu org tidak boleh menghentikan yang lain.
      await admin.from('backup_runs').insert({
        org_id: orgId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'failed',
        object_path: objectPath,
        error: message.slice(0, 500),
        trigger: 'cron',
      });
      console.error(`[auto-backup] ${orgId}: ${message}`);
      results.push({ orgId, status: 'failed', error: message });
    }
  }

  const failed = results.filter((r) => r.status === 'failed').length;
  return new Response(
    JSON.stringify({ total: results.length, failed, results }),
    {
      // 207 saat sebagian gagal: monitor eksternal bisa membedakan "semua
      // beres" dari "ada yang jatuh" tanpa mengurai body.
      status: failed === 0 ? 200 : 207,
      headers: { 'content-type': 'application/json' },
    },
  );
});
