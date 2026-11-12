import { describe, expect, it } from 'vitest';
import {
  EMPTY_LIST_VIEW,
  LIST_MEMORY_MS,
  LIST_PAGE_SIZE,
  MAX_LIST_LIMIT,
  parseListSnapshot,
  resolveListView,
  scrollRestoreStep,
  viewFromParams,
  type ServiceListSnapshot,
} from './serviceListView';
import { SERVICE_SORTS } from './serviceFilters';

const NOW = 1_800_000_000_000;
const params = (q: string) => new URLSearchParams(q);

const snap = (over: Partial<ServiceListSnapshot> = {}): ServiceListSnapshot => ({
  owner: 'o1:e1',
  entryKey: 'k1',
  savedAt: NOW - 60_000,
  scrollTop: 480,
  view: { ...EMPTY_LIST_VIEW, query: 'Andi', scope: 'stalled', sort: 'oldest' },
  ...over,
});

const resolve = (o: Partial<Parameters<typeof resolveListView>[0]> = {}) =>
  resolveListView({
    snapshot: snap(),
    owner: 'o1:e1',
    entryKey: 'k2',
    params: params(''),
    now: NOW,
    ...o,
  });

describe('viewFromParams', () => {
  it('tanpa parameter saringan → null; ?new=1 bukan saringan', () => {
    expect(viewFromParams(params(''))).toBeNull();
    expect(viewFromParams(params('new=1'))).toBeNull();
  });

  it('membaca tautan Dashboard: status, pickup, tech=me, date=month, open=1', () => {
    expect(viewFromParams(params('status=selesai'))?.status).toBe('selesai');
    expect(viewFromParams(params('pickup=awaiting'))?.pickup).toBe('awaiting');
    expect(viewFromParams(params('tech=me'))?.tech).toBe('me');
    expect(viewFromParams(params('date=month'))?.date).toBe('thisMonth');
    expect(viewFromParams(params('open=1'))?.scope).toBe('open');
  });

  it('nilai asing jatuh ke bawaan, tapi tetap dihitung sebagai tautan bersaringan', () => {
    expect(viewFromParams(params('status=hantu'))).toEqual(EMPTY_LIST_VIEW);
    expect(viewFromParams(params('tech=orang-lain'))?.tech).toBe('all');
  });
});

describe('parseListSnapshot', () => {
  it('bolak-balik JSON mempertahankan isi', () => {
    const s = snap();
    expect(parseListSnapshot(JSON.stringify(s))).toEqual(s);
  });

  it('teks kosong, JSON rusak, atau bentuk salah → null (tak pernah melempar)', () => {
    expect(parseListSnapshot(null)).toBeNull();
    expect(parseListSnapshot('')).toBeNull();
    expect(parseListSnapshot('{rusak')).toBeNull();
    expect(parseListSnapshot('[]')).toBeNull();
    expect(parseListSnapshot('{"owner":"a"}')).toBeNull();
    expect(parseListSnapshot(JSON.stringify({ ...snap(), savedAt: 'kemarin' }))).toBeNull();
  });

  it('kolom usang dipaksa ke nilai sah: status terhapus tidak menyaring daftar jadi kosong', () => {
    const raw = JSON.stringify({
      ...snap(),
      scrollTop: -40,
      view: {
        ...EMPTY_LIST_VIEW,
        status: 'status-lama',
        payment: 'x',
        date: 'kapan-saja',
        sort: 'acak',
        from: 'bukan-tanggal',
        to: '2026-11-09',
        scope: 'tertahan',
        query: 'q'.repeat(500),
      },
    });
    const parsed = parseListSnapshot(raw);
    expect(parsed?.scrollTop).toBe(0);
    expect(parsed?.view).toMatchObject({
      status: 'all',
      payment: 'all',
      date: 'all',
      sort: 'newest',
      from: '',
      to: '2026-11-09',
      scope: 'all',
    });
    expect(parsed?.view.query).toHaveLength(200);
  });

  it('ingatan dari sebelum sakelar lingkup (dua tombol) dibaca ke posisi yang sama', () => {
    const old = (flags: Record<string, unknown>) => {
      const { scope: _drop, ...view } = { ...EMPTY_LIST_VIEW, ...flags };
      return parseListSnapshot(JSON.stringify(snap({ view: view as never })))?.view.scope;
    };
    expect(old({})).toBe('all');
    expect(old({ hideClosed: true })).toBe('open');
    expect(old({ stalledOnly: true })).toBe('stalled');
    // Tertahan selalu menyembunyikan arsip juga, jadi ia menang.
    expect(old({ stalledOnly: true, hideClosed: true })).toBe('stalled');
    // Nilai baru yang sah mengalahkan sisa kolom lama.
    const mixed = { ...EMPTY_LIST_VIEW, scope: 'open', stalledOnly: true };
    expect(parseListSnapshot(JSON.stringify(snap({ view: mixed as never })))?.view.scope).toBe('open');
  });

  it('urutan per kolom: tiap nilai sah dipulihkan apa adanya (termasuk "newest"/"oldest" lama)', () => {
    for (const sort of SERVICE_SORTS) {
      const raw = JSON.stringify(snap({ view: { ...EMPTY_LIST_VIEW, sort } }));
      expect(parseListSnapshot(raw)?.view.sort, sort).toBe(sort);
    }
  });

  it('urutan asing, bertipe salah, atau dari versi lain jatuh ke Terbaru', () => {
    for (const sort of ['customer', 'COSTASC', 'cost-asc', 42, null, ['costAsc'], { sort: 'costAsc' }]) {
      const raw = JSON.stringify({ ...snap(), view: { ...EMPTY_LIST_VIEW, sort } });
      expect(parseListSnapshot(raw)?.view.sort, JSON.stringify(sort)).toBe('newest');
    }
  });
});

describe('limit (baris yang sudah "ditampilkan lebih banyak")', () => {
  const limitOf = (limit: unknown) => {
    const raw = JSON.stringify({ ...snap(), view: { ...EMPTY_LIST_VIEW, limit } });
    return parseListSnapshot(raw)?.view.limit;
  };

  it('bawaan satu halaman, dan nilai sah bolak-balik apa adanya', () => {
    expect(EMPTY_LIST_VIEW.limit).toBe(LIST_PAGE_SIZE);
    for (const n of [LIST_PAGE_SIZE, 100, 250, MAX_LIST_LIMIT]) expect(limitOf(n), String(n)).toBe(n);
  });

  it('ingatan lama tanpa limit jatuh ke satu halaman, bukan NaN atau tanpa batas', () => {
    const { limit: _omit, ...view } = EMPTY_LIST_VIEW;
    void _omit;
    const raw = JSON.stringify({ ...snap(), view });
    expect(parseListSnapshot(raw)?.view.limit).toBe(LIST_PAGE_SIZE);
  });

  it('nilai rusak dijepit ke [satu halaman, batas waras]; bertipe salah jatuh ke satu halaman', () => {
    expect(limitOf(0)).toBe(LIST_PAGE_SIZE);
    expect(limitOf(-500)).toBe(LIST_PAGE_SIZE);
    expect(limitOf(49)).toBe(LIST_PAGE_SIZE);
    expect(limitOf(MAX_LIST_LIMIT + 1)).toBe(MAX_LIST_LIMIT);
    expect(limitOf(9_999_999)).toBe(MAX_LIST_LIMIT);
    expect(limitOf(120.4)).toBe(120);
    for (const bad of ['200', null, true, [200], { n: 200 }]) {
      expect(limitOf(bad), JSON.stringify(bad)).toBe(LIST_PAGE_SIZE);
    }
  });

  it('kembali dari tiket memulihkan limit bersama gulirnya; tautan Dashboard mulai dari satu halaman', () => {
    const deep = snap({ scrollTop: 4200, view: { ...EMPTY_LIST_VIEW, query: 'Andi', limit: 200 } });
    const back = resolve({ snapshot: deep });
    expect(back.view.limit).toBe(200);
    expect(back.scrollTop).toBe(4200);
    expect(resolve({ snapshot: deep, params: params('tech=me') }).view.limit).toBe(LIST_PAGE_SIZE);
    expect(resolve({ snapshot: deep, owner: 'o2:e1' }).view.limit).toBe(LIST_PAGE_SIZE);
  });
});

describe('scrollRestoreStep', () => {
  const step = (o: Partial<Parameters<typeof scrollRestoreStep>[0]> = {}) =>
    scrollRestoreStep({ loading: false, archivePending: false, rowCount: 120, ...o });

  it('semua termuat dan ada baris → pulihkan', () => {
    expect(step()).toBe('restore');
  });

  it('jendela belum dimuat → tunggu, berapa pun barisnya', () => {
    expect(step({ loading: true })).toBe('wait');
    expect(step({ loading: true, rowCount: 0 })).toBe('wait');
  });

  it('arsip diminta tapi belum tiba → tunggu, walau jendela sudah punya beberapa baris cocok', () => {
    // Cari "Andi": 2 baris cocok ada di jendela, 40 lagi di arsip. Menggulir ke
    // posisi baris ke-30 sekarang tersangkut di ujung 2 baris itu.
    expect(step({ archivePending: true, rowCount: 2 })).toBe('wait');
    expect(step({ archivePending: true, rowCount: 0 })).toBe('wait');
  });

  it('semua termuat tapi kosong → lewati, supaya posisi lama tak meloncat saat baris muncul kemudian', () => {
    expect(step({ rowCount: 0 })).toBe('skip');
  });

  it('urutannya: arsip yang tiba menggeser keputusan dari tunggu ke pulihkan', () => {
    const seq = [
      { loading: true, archivePending: false, rowCount: 0 },
      { loading: false, archivePending: true, rowCount: 2 },
      { loading: false, archivePending: false, rowCount: 42 },
    ].map(scrollRestoreStep);
    expect(seq).toEqual(['wait', 'wait', 'restore']);
  });
});

describe('resolveListView', () => {
  it('tanpa ingatan dan tanpa tautan → daftar bersih di puncak', () => {
    expect(resolve({ snapshot: null })).toEqual({ view: EMPTY_LIST_VIEW, scrollTop: 0 });
  });

  it('kembali dari tiket (entri baru, URL polos) → pulihkan kotak cari, saringan, dan gulir', () => {
    const r = resolve();
    expect(r.view.query).toBe('Andi');
    expect(r.view.sort).toBe('oldest');
    expect(r.view.scope).toBe('stalled');
    expect(r.scrollTop).toBe(480);
  });

  it('tautan Dashboard pada entri baru menang atas ingatan, tanpa gulir', () => {
    const r = resolve({ params: params('tech=me') });
    expect(r.view).toEqual({ ...EMPTY_LIST_VIEW, tech: 'me' });
    expect(r.scrollTop).toBe(0);
  });

  it('tombol Kembali peramban ke entri berparameter yang sama memulihkan apa yang diketik', () => {
    const r = resolve({
      params: params('tech=me'),
      entryKey: 'k1',
      snapshot: snap({ view: { ...EMPTY_LIST_VIEW, tech: 'me', query: 'Andi' } }),
    });
    expect(r.view).toMatchObject({ tech: 'me', query: 'Andi' });
    expect(r.scrollTop).toBe(480);
  });

  it('ingatan milik pengguna/outlet lain diabaikan', () => {
    expect(resolve({ owner: 'o1:e2' })).toEqual({ view: EMPTY_LIST_VIEW, scrollTop: 0 });
    expect(resolve({ owner: 'o2:e1' })).toEqual({ view: EMPTY_LIST_VIEW, scrollTop: 0 });
  });

  it('ingatan basi (lewat masa berlaku) diabaikan; tepat di batas masih dipercaya', () => {
    expect(resolve({ snapshot: snap({ savedAt: NOW - LIST_MEMORY_MS - 1 }) }).view).toEqual(
      EMPTY_LIST_VIEW,
    );
    expect(resolve({ snapshot: snap({ savedAt: NOW - LIST_MEMORY_MS }) }).view.query).toBe('Andi');
  });

  it('ingatan basi tidak menghalangi tautan Dashboard', () => {
    const r = resolve({
      snapshot: snap({ savedAt: NOW - LIST_MEMORY_MS - 1, entryKey: 'k2' }),
      params: params('open=1'),
    });
    expect(r.view.scope).toBe('open');
    expect(r.view.query).toBe('');
  });
});
