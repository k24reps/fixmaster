import { describe, it, expect } from 'vitest';
import { searchAll, groupResults } from './search';
import type { Service, Customer, InventoryItem } from '@/data/types';

const svc = (over: Partial<Service>): Service => ({
  id: over.id ?? 's1',
  orgId: 'o1',
  outletId: null,
  serviceNo: over.serviceNo ?? 'FM-0001',
  customerId: 'c1',
  customerName: over.customerName ?? 'Andi Pratama',
  customerPhone: '0812',
  category: over.category ?? 'Laptop',
  device: over.device ?? 'MacBook Pro',
  complaint: '',
  accessories: '',
  status: over.status ?? 'diterima',
  technicianId: null,
  technicianName: '',
  estimateCost: 0,
  finalCost: 0,
  downPayment: 0,
  spareparts: [],
  warrantyServiceUntil: null,
  warrantyPartsUntil: null,
  pickedUp: false,
  pickedUpAt: null,
  warrantyClaimOf: null,
  history: [],
  archived: over.archived ?? false,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

const cust = (over: Partial<Customer>): Customer => ({
  id: over.id ?? 'c1',
  orgId: 'o1',
  outletId: null,
  name: over.name ?? 'Citra Lestari',
  phone: over.phone ?? '08129999',
  email: over.email ?? '',
  address: '',
  note: '',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

const inv = (over: Partial<InventoryItem>): InventoryItem => ({
  id: over.id ?? 'i1',
  orgId: 'o1',
  outletId: null,
  name: over.name ?? 'SSD NVMe 512GB',
  category: over.category ?? 'Sparepart',
  sku: over.sku ?? 'SSD-512',
  stock: 10,
  minStock: 2,
  costPrice: 0,
  sellPrice: 0,
  supplierId: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

const collections = {
  services: [svc({ id: 's1', serviceNo: 'FM-0001', device: 'MacBook Pro', customerName: 'Andi' })],
  customers: [cust({ id: 'c1', name: 'Citra Lestari', phone: '08129999' })],
  inventory: [inv({ id: 'i1', name: 'SSD NVMe 512GB', sku: 'SSD-512' })],
};

describe('searchAll', () => {
  it('returns [] for an empty/whitespace query', () => {
    expect(searchAll('', collections)).toEqual([]);
    expect(searchAll('   ', collections)).toEqual([]);
  });

  it('matches a service by service number and routes to its detail page', () => {
    const r = searchAll('fm-0001', collections);
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('service');
    expect(r[0].to).toBe('/services/s1');
  });

  it('matches a customer by partial name', () => {
    const r = searchAll('citra', collections);
    expect(r[0].type).toBe('customer');
    expect(r[0].to).toBe('/customers');
  });

  it('matches inventory by SKU', () => {
    const r = searchAll('ssd-512', collections);
    expect(r[0].type).toBe('inventory');
    expect(r[0].to).toBe('/inventory');
  });

  it('excludes archived services', () => {
    const arch = { ...collections, services: [svc({ id: 's2', serviceNo: 'FM-0002', archived: true })] };
    expect(searchAll('fm-0002', arch)).toHaveLength(0);
  });

  it('respects the result limit', () => {
    const many = {
      services: Array.from({ length: 20 }, (_, i) =>
        svc({ id: `s${i}`, serviceNo: `FM-1${i}`, device: 'phone match' }),
      ),
      customers: [],
      inventory: [],
    };
    expect(searchAll('phone match', many, 5)).toHaveLength(5);
  });
});

describe('groupResults', () => {
  it('groups by type in service → customer → inventory order', () => {
    const r = searchAll('a', {
      services: [svc({ id: 's1', device: 'a-device' })],
      customers: [cust({ id: 'c1', name: 'a-name' })],
      inventory: [inv({ id: 'i1', name: 'a-part' })],
    });
    const groups = groupResults(r);
    expect(groups.map((g) => g.type)).toEqual(['service', 'customer', 'inventory']);
  });

  it('omits empty groups', () => {
    const r = searchAll('citra', collections);
    const groups = groupResults(r);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('customer');
  });
});
