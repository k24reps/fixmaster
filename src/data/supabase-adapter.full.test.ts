import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionName } from './repository';

/*
 * list(…, { full: true }) adalah jalur backup. Dulu `full` hanya mengganti
 * kolom, sehingga services/sales/incomes/expenses/activity terpotong di
 * max_rows PostgREST (1000), dan restore_org_data menghapus sisanya saat
 * berkas itu dipulihkan. Server palsu di sini menerapkan cap tersebut.
 */

type Row = { id: string; org_id: string; created_at: string; deleted_at: string | null };

const TOTAL = 2500;
let rows: Row[] = [];
let maxRows = 1000;
/** Dipanggil setiap kali satu halaman dilayani; dipakai untuk soft-delete di tengah backup. */
let onPage: (() => void) | null = null;

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

function query() {
  const st: {
    gt: string | null;
    limit: number | null;
    range: [number, number] | null;
    order: { col: keyof Row; asc: boolean }[];
  } = { gt: null, limit: null, range: null, order: [] };
  const q: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'or']) q[k] = () => q;
  q.is = () => q;
  q.order = (col: keyof Row, opts?: { ascending?: boolean }) => {
    st.order.push({ col, asc: opts?.ascending ?? true });
    return q;
  };
  q.gt = (_col: string, v: string) => {
    st.gt = v;
    return q;
  };
  q.limit = (n: number) => {
    st.limit = n;
    return q;
  };
  q.range = (a: number, b: number) => {
    st.range = [a, b];
    return q;
  };
  q.then = (resolve: (v: unknown) => void) => {
    let out = rows.filter((r) => r.deleted_at === null && (st.gt === null || r.id > st.gt));
    out.sort((a, b) => {
      for (const { col, asc } of st.order) {
        const x = String(a[col]);
        const y = String(b[col]);
        if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
    if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
    if (st.limit !== null) out = out.slice(0, st.limit);
    out = out.slice(0, maxRows);
    onPage?.();
    resolve({ data: out, error: null });
  };
  return q;
}

vi.mock('./supabase-client', async (orig) => ({
  ...(await orig<typeof import('./supabase-client')>()),
  getSupabase: () => ({ from: () => query() }),
  subscribeOrgTables: () => () => {},
}));

async function adapter() {
  const { SupabaseAdapter } = await import('./supabase-adapter');
  const a = new SupabaseAdapter();
  (a as unknown as { orgId: string }).orgId = 'org';
  return a;
}

beforeEach(() => {
  maxRows = 1000;
  onPage = null;
  rows = Array.from({ length: TOTAL }, (_, i) => ({
    // id acak terhadap created_at, seperti uuid v4 sungguhan.
    id: uuid((i * 7919) % TOTAL),
    org_id: 'org',
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    deleted_at: null,
  }));
});

const BACKED_UP: CollectionName[] = [
  'services', 'sales', 'incomes', 'expenses', 'activity', 'attendance',
  'purchaseOrders', 'taskInstances', 'customers', 'inventory',
];

describe('SupabaseAdapter.list({ full: true }) — jalur backup', () => {
  it.each(BACKED_UP)('%s: semua baris, melewati cap max_rows', async (name) => {
    const got = await (await adapter()).list(name, { full: true });
    expect(got).toHaveLength(TOTAL);
    expect(new Set(got.map((r) => r.id)).size).toBe(TOTAL);
  });

  it('server dengan max_rows di bawah 1000 tetap utuh', async () => {
    maxRows = 250;
    const got = await (await adapter()).list('services', { full: true });
    expect(got).toHaveLength(TOTAL);
  });

  it('soft-delete di tengah backup tidak membuat baris lain terlewat', async () => {
    let served = 0;
    onPage = () => {
      // Setelah halaman pertama, hapus satu baris yang SUDAH terambil.
      if (++served === 1) rows.find((r) => r.id === uuid(0))!.deleted_at = '2026-11-12T00:00:00Z';
    };
    const got = await (await adapter()).list('sales', { full: true });
    expect(got).toHaveLength(TOTAL);
  });

  it('daftar biasa tetap dipotong cap (perilaku layar tidak berubah)', async () => {
    const got = await (await adapter()).list('services');
    expect(got).toHaveLength(1000);
  });
});
