import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalAdapter } from './local-adapter';
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

describe('LocalAdapter (IndexedDB integration)', () => {
  let adapter: LocalAdapter;

  beforeEach(async () => {
    // Fresh DB name per test would be ideal, but clearAll keeps it isolated.
    adapter = new LocalAdapter();
    adapter.setScope('org-1', null);
    await adapter.clearAll();
  });

  it('persists and retrieves a record with audit stamping', async () => {
    const saved = await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    expect(saved.createdAt).not.toBe('');
    expect(saved.updatedAt).not.toBe('');

    const fetched = await adapter.get('customers', '1');
    expect(fetched?.name).toBe('Andi');
  });

  it('scopes list() to the active organization', async () => {
    await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));

    // Switch to a different org and add another customer.
    adapter.setScope('org-2', null);
    await adapter.put('customers', makeCustomer('2', 'org-2', 'Budi'));
    const org2 = await adapter.list('customers');
    expect(org2).toHaveLength(1);
    expect(org2[0].name).toBe('Budi');

    // Back to org-1: should only see its own record.
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

  it('bulk upserts in a single transaction', async () => {
    await adapter.putMany('customers', [
      makeCustomer('1', 'org-1', 'Andi'),
      makeCustomer('2', 'org-1', 'Budi'),
      makeCustomer('3', 'org-1', 'Citra'),
    ]);
    const all = await adapter.list('customers');
    expect(all).toHaveLength(3);
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
    const org = await adapter.getSingleton('organization');
    expect(org?.name).toBe('TechFix');
  });

  it('notifies subscribers on mutation', async () => {
    const changes: string[] = [];
    const unsub = adapter.subscribe((c) => changes.push(c));
    await adapter.put('customers', makeCustomer('1', 'org-1', 'Andi'));
    unsub();
    await adapter.put('customers', makeCustomer('2', 'org-1', 'Budi'));
    expect(changes).toContain('customers');
    expect(changes).toHaveLength(1); // unsubscribed before the second put
  });
});
