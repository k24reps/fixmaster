import { afterEach, describe, expect, it, vi } from 'vitest';

// Kanal palsu yang meniru realtime-js: removeChannel() memanggil callback
// subscribe milik kanal itu dengan 'CLOSED' (RealtimeChannel.unsubscribe
// "Triggers onClose() hooks").
const channels: { cb?: (s: string) => void }[] = [];
const fakeClient = {
  channel: () => {
    const ch: {
      cb?: (s: string) => void;
      state: string;
      on: () => unknown;
      subscribe: (cb: (s: string) => void) => void;
    } = {
      state: 'joining',
      on: () => ch,
      subscribe: (cb) => {
        // Kanal sungguhan berstatus 'joined' setelah SUBSCRIBED; health timer
        // membacanya.
        ch.cb = (s) => {
          ch.state = s === 'SUBSCRIBED' ? 'joined' : 'closed';
          cb(s);
        };
      },
    };
    channels.push(ch);
    return ch;
  },
  removeChannel: (ch: { cb?: (s: string) => void }) => {
    ch.cb?.('CLOSED');
    return Promise.resolve('ok');
  },
  rpc: vi.fn(),
};
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('subscribeOrgTables', () => {
  it('kanal lama yang dibuang tidak memicu reconnect (putaran notifyAll)', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:8000');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const { subscribeOrgTables } = await import('./supabase-client');

    const statuses: string[] = [];
    const stop = subscribeOrgTables('org', ['services'], () => {}, (s) => statuses.push(s));
    channels[0].cb!('SUBSCRIBED');
    // Satu putus sungguhan (mis. token kedaluwarsa) → satu reconnect.
    channels[0].cb!('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(2_000);
    channels[1].cb!('SUBSCRIBED');
    // Beri waktu lama: tidak boleh ada kanal ketiga, dan 'live' hanya dua kali.
    await vi.advanceTimersByTimeAsync(120_000);

    expect(channels).toHaveLength(2);
    expect(statuses.filter((s) => s === 'live')).toHaveLength(2);
    stop();
  });
});

describe('RPC kode lacak dan jejak cetak (0100)', () => {
  const load = async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:8000');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    return import('./supabase-client');
  };

  // Halaman lacak harus bisa membedakan "tunggu semenit" dari "kode salah";
  // keduanya dulu jatuh ke pesan yang sama.
  it('HTTP 429 dari batas per IP menjadi TrackRateLimitedError', async () => {
    const m = await load();
    fakeClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PT429', message: 'rate_limited' },
      status: 429,
    });
    await expect(m.trackServiceByCode('7K3M9QXR2D')).rejects.toBeInstanceOf(m.TrackRateLimitedError);
    expect(fakeClient.rpc).toHaveBeenLastCalledWith('track_service_by_code', { p_code: '7K3M9QXR2D' });
  });

  it('galat lain tetap Error biasa; nol baris = null', async () => {
    const m = await load();
    fakeClient.rpc.mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' }, status: 500 });
    const err = await m.trackServiceByCode('7K3M9QXR2D').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(m.TrackRateLimitedError);
    fakeClient.rpc.mockResolvedValueOnce({ data: [], error: null, status: 200 });
    expect(await m.trackServiceByCode('7K3M9QXR2D')).toBeNull();
  });

  it('baris kode dipetakan ke bentuk yang sama dengan track_service', async () => {
    const m = await load();
    fakeClient.rpc.mockResolvedValueOnce({
      data: [
        {
          service_no: 'FM-0007',
          device: 'iPhone 12',
          category: 'HP',
          status: 'pengerjaan',
          org_name: 'TechFix',
          org_phone: null,
          org_address: null,
          org_logo_url: null,
          org_public_note: null,
          warranty_service_until: null,
          warranty_parts_until: null,
          part_warranties: null,
          picked_up: null,
          public_history: null,
        },
      ],
      error: null,
      status: 200,
    });
    expect(await m.trackServiceByCode('7K3M9QXR2D')).toMatchObject({
      serviceNo: 'FM-0007',
      orgPhone: '',
      orgNote: '',
      partWarranties: [],
      pickedUp: false,
      publicHistory: [],
    });
  });

  // Sebelum 0100 diterapkan RPC-nya belum ada. Mencetak tetap jalan: alamat
  // lama dan tanpa penanda salinan.
  it('jejak cetak: galat apa pun (mis. RPC belum ada) → null', async () => {
    const m = await load();
    fakeClient.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    expect(await m.fetchServicePrintMeta({ orgId: 'o', serviceId: 's' })).toBeNull();
    fakeClient.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Forbidden' } });
    expect(await m.markServicePrintedRpc({ orgId: 'o', serviceId: 's', kind: 'intake' })).toBeNull();
  });

  it('jejak cetak dipetakan dari baris pertama', async () => {
    const m = await load();
    fakeClient.rpc.mockResolvedValueOnce({
      data: [
        {
          track_code: '7K3M9QXR2D',
          print_count: 2,
          last_printed_at: '2026-11-12T02:05:00Z',
          last_printed_kind: 'service',
        },
      ],
      error: null,
    });
    expect(await m.markServicePrintedRpc({ orgId: 'o', serviceId: 's', kind: 'service' })).toEqual({
      trackCode: '7K3M9QXR2D',
      printCount: 2,
      lastPrintedAt: '2026-11-12T02:05:00Z',
      lastPrintedKind: 'service',
    });
    expect(fakeClient.rpc).toHaveBeenLastCalledWith('mark_service_printed', {
      p_org_id: 'o',
      p_service_id: 's',
      p_kind: 'service',
    });
  });
});
