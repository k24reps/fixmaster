import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from './in-memory-adapter';
import type { Customer } from './types';

function makeCustomer(id: string, orgId: string, name: string): Customer {
  return {
    id,
    orgId,
    outletId: null,
    name,
    phone: '08' + id,
    email: '',
    address: '',
    note: '',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  };
}

describe('InMemoryAdapter (RAM-only demo repository)', () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    adapter.setScope('org-1', null);
  });

  it('persists and retrieves a record with audit stamping', async () => {
    const saved = await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    expect(saved.createdAt).not.toBe('');
    expect(saved.updatedAt).not.toBe('');
    expect((await adapter.get('customers', '1'))?.name).toBe('Andi');
  });

  it('scopes list() to the active organization', async () => {
    await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    adapter.setScope('org-2', null);
    await adapter.put('customers', makeCustomer('2', 'org-2', 'Budi'));

    const org2 = await adapter.list('customers');
    expect(org2).toHaveLength(1);
    expect(org2[0].name).toBe('Budi');

    adapter.setScope('org-1', null);
    const org1 = await adapter.list('customers');
    expect(org1).toHaveLength(1);
    expect(org1[0].name).toBe('Andi');
  });

  it('soft-deletes (tombstones) records and hides them from reads', async () => {
    await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    await adapter.remove('customers', '1');
    expect(await adapter.get('customers', '1')).toBeNull();
    expect(await adapter.list('customers')).toHaveLength(0);
  });

  it('patch mengubah kolom yang dikirim saja, sisanya dari data tersimpan', async () => {
    await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    // Salinan basi di perangkat lain tak ikut dikirim — hanya kolom yang diubah.
    await adapter.put('customers', { ...makeCustomer('1', 'org-1', 'Andi'), phone: '0899' });
    await adapter.patch('customers', '1', { name: 'Andi S' });
    const got = await adapter.get('customers', '1');
    expect(got?.name).toBe('Andi S');
    expect(got?.phone).toBe('0899');
    await expect(adapter.patch('customers', 'tidak-ada', { name: 'x' })).rejects.toThrow();
  });

  it('bulk upserts', async () => {
    await adapter.putMany('customers', [
      makeCustomer('1', 'org-1', 'Andi'),
      makeCustomer('2', 'org-1', 'Budi'),
      makeCustomer('3', 'org-1', 'Citra'),
    ]);
    expect(await adapter.list('customers')).toHaveLength(3);
  });

  it('stores and retrieves a singleton scoped per org', async () => {
    await adapter.setSingleton('organization', {
      id: 'org-1',
      name: 'TechFix',
      address: '',
      phone: '',
      logoDataUrl: null,
      servicePrefix: 'TF',
      planType: 'trial',
      trialStartedAt: null,
      planExpiredAt: null,
      maxOutlets: 5,
      maxUsers: -1,
      createdAt: '',
    });
    expect((await adapter.getSingleton('organization'))?.name).toBe('TechFix');
  });

  it('notifies subscribers on mutation, and stops after unsubscribe', async () => {
    const changes: string[] = [];
    const unsub = adapter.subscribe((c) => changes.push(c));
    await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    unsub();
    await adapter.put('customers', makeCustomer('2', 'org-1', 'Budi'));
    expect(changes).toContain('customers');
    expect(changes).toHaveLength(1);
  });

  it('clearAll empties every collection', async () => {
    await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    await adapter.clearAll();
    expect(await adapter.list('customers')).toHaveLength(0);
  });

  it('leaves no trace across instances (RAM isolation)', async () => {
    await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    const fresh = new InMemoryAdapter();
    fresh.setScope('org-1', null);
    expect(await fresh.list('customers')).toHaveLength(0);
  });
});
