import { describe, it, expect, vi } from 'vitest';

/**
 * Backup harus LOSSLESS. Daftar servis cloud tidak memuat `history` (egress),
 * jadi backup yang memakai list() biasa akan memulihkan setiap tiket dengan
 * jejak audit kosong — kehilangan data yang baru terasa saat restore.
 */
const list = vi.fn<(name: string, options?: { full?: boolean }) => Promise<unknown[]>>(
  async () => [],
);

vi.mock('@/data', () => ({
  repository: {
    list: (name: string, options?: { full?: boolean }) => list(name, options),
    setScope: () => {},
    getSingleton: async () => null,
  },
}));
vi.mock('@/data/supabase-client', () => ({ isSupabaseConfigured: true }));
vi.mock('@/stores/session', () => ({
  useSessionStore: { getState: () => ({ activeOutletId: null, org: { id: 'o1' } }) },
}));

const { createBackup } = await import('./backupRestore');

describe('createBackup', () => {
  it('meminta baris PENUH untuk setiap koleksi, termasuk services', async () => {
    await createBackup('o1');
    expect(list).toHaveBeenCalledWith('services', { full: true });
    for (const [, options] of list.mock.calls) expect(options).toEqual({ full: true });
  });
});
