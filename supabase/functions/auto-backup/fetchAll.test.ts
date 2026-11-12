import { describe, expect, it } from 'vitest';
import { fetchAllById, type PageFetcher } from './fetchAll.ts';

type Row = { id: string };

const ids = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));

/** Server palsu: urut id, keyset `gt`, lalu dipotong max_rows seperti PostgREST. */
function server(rows: Row[], maxRows: number): PageFetcher<Row> {
  return async (after, size) => {
    const page = rows
      .filter((r) => after === null || r.id > after)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, Math.min(size, maxRows));
    return { data: page, error: null };
  };
}

describe('fetchAllById (auto-backup)', () => {
  it('mengambil semua baris melewati cap 1000', async () => {
    const all = ids(2500);
    const got = await fetchAllById(server(all, 1000), 'services');
    expect(got).toHaveLength(2500);
    expect(new Set(got.map((r) => r.id)).size).toBe(2500);
  });

  it('tidak berhenti di halaman pendek bila max_rows di bawah ukuran halaman', async () => {
    const got = await fetchAllById(server(ids(2500), 300), 'services');
    expect(got).toHaveLength(2500);
  });

  it('tabel kosong dan tabel tepat satu halaman', async () => {
    expect(await fetchAllById(server([], 1000), 'sales')).toEqual([]);
    expect(await fetchAllById(server(ids(1000), 1000), 'sales')).toHaveLength(1000);
  });

  it('error kueri membawa nama tabel', async () => {
    const broken: PageFetcher<Row> = async () => ({ data: null, error: { message: 'boom' } });
    await expect(fetchAllById(broken, 'incomes')).rejects.toThrow('incomes: boom');
  });

  it('kueri yang lupa keyset gagal keras, bukan berputar selamanya', async () => {
    const stuck: PageFetcher<Row> = async () => ({ data: ids(3), error: null });
    await expect(fetchAllById(stuck, 'expenses')).rejects.toThrow('paginasi tidak maju');
  });
});
