// ============================================================
// Ambil SEMUA baris sebuah kueri, halaman demi halaman, lewat keyset `id`.
//
// Satu `select('*')` dipotong diam-diam oleh max_rows PostgREST (1000 di
// Supabase cloud). Untuk backup itu fatal: restore_org_data menghapus baris
// org lebih dulu, jadi berkas yang kehilangan baris lama menghapusnya
// permanen saat dipulihkan.
//
// Kenapa keyset dan bukan offset: soft-delete di tengah backup menggeser
// offset sehingga satu baris terlewat. Kenapa berhenti di halaman KOSONG,
// bukan halaman pendek: server dengan max_rows di bawah PAGE_SIZE selalu
// mengembalikan halaman pendek, dan berhenti di situ memotong lagi.
//
// Tanpa impor, supaya Vitest bisa mengujinya (fetchAll.test.ts) walau
// index.ts berjalan di Deno.
// ============================================================

export const PAGE_SIZE = 1000;

/** Satu halaman: baris dengan id > afterId (null = dari awal), urut id naik, paling banyak `size`. */
export type PageFetcher<T> = (
  afterId: string | null,
  size: number,
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAllById<T extends { id: unknown }>(
  page: PageFetcher<T>,
  label: string,
  size = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await page(after, size);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = data ?? [];
    if (batch.length === 0) return rows;
    const last = String(batch[batch.length - 1].id);
    // Urutan uuid di Postgres = urutan byte = urutan teks hex huruf kecil.
    // Kueri yang lupa `gt('id', …)` akan mengulang halaman yang sama selamanya.
    if (after !== null && last <= after) {
      throw new Error(`${label}: paginasi tidak maju setelah id ${after}`);
    }
    rows.push(...batch);
    after = last;
  }
}
