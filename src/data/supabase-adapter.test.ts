import { describe, it, expect } from 'vitest';
import { TABLE_TO_COLLECTION, REALTIME_TABLES } from './supabase-adapter';

describe('TABLE_TO_COLLECTION (realtime reverse map)', () => {
  it('maps Postgres table names back to repository collections', () => {
    expect(TABLE_TO_COLLECTION['services']).toBe('services');
    expect(TABLE_TO_COLLECTION['inventory_items']).toBe('inventory');
    expect(TABLE_TO_COLLECTION['purchase_orders']).toBe('purchaseOrders');
    expect(TABLE_TO_COLLECTION['activity_logs']).toBe('activity');
    expect(TABLE_TO_COLLECTION['task_instances']).toBe('taskInstances');
  });

  it('resolves every realtime table to a known collection', () => {
    for (const table of REALTIME_TABLES) {
      expect(TABLE_TO_COLLECTION[table], `missing mapping for ${table}`).toBeDefined();
    }
  });
});

describe('REALTIME_TABLES', () => {
  it('excludes memberships (team/login not domain-synced)', () => {
    expect(REALTIME_TABLES).not.toContain('memberships');
  });

  it('covers the 15 domain tables', () => {
    expect(REALTIME_TABLES).toHaveLength(15);
    expect(new Set(REALTIME_TABLES).size).toBe(15); // no duplicates
  });
});
