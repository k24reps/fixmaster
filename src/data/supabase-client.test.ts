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
