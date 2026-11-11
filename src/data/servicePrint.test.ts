import { beforeEach, describe, expect, it, vi } from 'vitest';

const cloud = vi.hoisted(() => ({ on: false }));
vi.mock('@/stores/demo', () => ({ isCloudMode: () => cloud.on }));
vi.mock('@/data/supabase-client', () => ({
  fetchServicePrintMeta: vi.fn(async () => null),
  markServicePrintedRpc: vi.fn(async () => null),
}));

import { fetchServicePrintMeta, markServicePrintedRpc } from '@/data/supabase-client';
import { getServicePrintMeta, recordServicePrint } from './servicePrint';

beforeEach(() => {
  cloud.on = false;
});

describe('servicePrint: lokal dan demo', () => {
  // Tanpa server tak ada yang bisa menerjemahkan kode jadi tiket; alamat lama
  // (dibaca dari IndexedDB) tetap bisa dibuka di tab lain.
  it('tanpa kode lacak dan belum pernah dicetak', async () => {
    expect(await getServicePrintMeta({ id: 'a', orgId: 'o' })).toEqual({
      trackCode: null,
      printCount: 0,
      lastPrintedAt: null,
      lastPrintedKind: null,
    });
  });

  it('mencatat cetakan per tiket, jenis terakhir menang', async () => {
    const first = await recordServicePrint({ id: 'b', orgId: 'o' }, 'intake');
    expect(first).toMatchObject({ printCount: 1, lastPrintedKind: 'intake' });
    expect(typeof first?.lastPrintedAt).toBe('string');
    const second = await recordServicePrint({ id: 'b', orgId: 'o' }, 'service');
    expect(second).toMatchObject({ printCount: 2, lastPrintedKind: 'service' });
    expect(await getServicePrintMeta({ id: 'b', orgId: 'o' })).toEqual(second);
    expect((await getServicePrintMeta({ id: 'c', orgId: 'o' }))?.printCount).toBe(0);
  });
});

describe('servicePrint: cloud', () => {
  it('membaca dan mencatat lewat RPC, tidak menyentuh memori lokal', async () => {
    cloud.on = true;
    await getServicePrintMeta({ id: 'd', orgId: 'o' });
    await recordServicePrint({ id: 'd', orgId: 'o' }, 'handover');
    expect(fetchServicePrintMeta).toHaveBeenCalledWith({ orgId: 'o', serviceId: 'd' });
    expect(markServicePrintedRpc).toHaveBeenCalledWith({ orgId: 'o', serviceId: 'd', kind: 'handover' });
    cloud.on = false;
    expect((await getServicePrintMeta({ id: 'd', orgId: 'o' }))?.printCount).toBe(0);
  });
});
