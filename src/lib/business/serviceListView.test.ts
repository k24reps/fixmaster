import { describe, expect, it } from 'vitest';
import {
  EMPTY_LIST_VIEW,
  LIST_MEMORY_MS,
  parseListSnapshot,
  resolveListView,
  viewFromParams,
  type ServiceListSnapshot,
} from './serviceListView';

const NOW = 1_800_000_000_000;
const params = (q: string) => new URLSearchParams(q);

const snap = (over: Partial<ServiceListSnapshot> = {}): ServiceListSnapshot => ({
  owner: 'o1:e1',
  entryKey: 'k1',
  savedAt: NOW - 60_000,
  scrollTop: 480,
  view: { ...EMPTY_LIST_VIEW, query: 'Andi', stalledOnly: true, sort: 'oldest' },
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
    expect(viewFromParams(params('open=1'))?.hideClosed).toBe(true);
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
        stalledOnly: 'ya',
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
      stalledOnly: false,
    });
    expect(parsed?.view.query).toHaveLength(200);
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
    expect(r.view.stalledOnly).toBe(true);
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
    expect(r.view.hideClosed).toBe(true);
    expect(r.view.query).toBe('');
  });
});
