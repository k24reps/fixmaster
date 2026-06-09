import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase-client';
import type {
  Repository,
  CollectionName,
  EntityMap,
  SingletonName,
  SingletonMap,
  ChangeListener,
} from './repository';
import type { ID } from './types';

/** Map each repository collection to its Postgres table name. */
const TABLE: Record<CollectionName, string> = {
  employees: 'memberships',
  outlets: 'outlets',
  customers: 'customers',
  inventory: 'inventory_items',
  suppliers: 'suppliers',
  purchaseOrders: 'purchase_orders',
  wallets: 'wallets',
  incomes: 'incomes',
  expenses: 'expenses',
  fixedCosts: 'fixed_costs',
  services: 'services',
  sales: 'sales',
  attendance: 'attendance',
  taskTemplates: 'task_templates',
  taskInstances: 'task_instances',
  activity: 'activity_logs',
};

/**
 * Translate a Supabase write error. A row-level-security violation (Postgres
 * 42501) on a write almost always means the org's subscription has lapsed
 * (is_org_active = false, migration 0010) — surface that in plain Indonesian
 * instead of the raw "row-level security policy" message. Other errors pass
 * through unchanged.
 */
function rethrowWrite(error: { code?: string; message?: string }): never {
  if (error.code === '42501') {
    throw new Error(
      'Langganan kedaluwarsa atau melebihi kuota — perpanjang di Pengaturan → Langganan untuk melanjutkan.',
    );
  }
  throw error;
}

const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

function toRow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[camelToSnake(k)] = v;
  }
  return out;
}

function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out as T;
}

/**
 * Supabase-backed Repository implementing the same contract as the local
 * adapter. Feature code is unchanged when switching adapters. RLS + atomic
 * RPCs (see supabase/migrations) provide the integrity guarantees.
 */
export class SupabaseAdapter implements Repository {
  private orgId: ID = '';
  private listeners = new Set<ChangeListener>();
  private client: SupabaseClient;

  constructor() {
    const c = getSupabase();
    if (!c) throw new Error('Supabase is not configured');
    this.client = c;
  }

  setScope(orgId: ID): void {
    this.orgId = orgId;
  }

  private notify(collection: CollectionName) {
    for (const l of this.listeners) l(collection);
  }

  async list<K extends CollectionName>(collection: K): Promise<EntityMap[K][]> {
    const { data, error } = await this.client
      .from(TABLE[collection])
      .select('*')
      .eq('org_id', this.orgId);
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<EntityMap[K]>(r));
  }

  async get<K extends CollectionName>(collection: K, id: ID): Promise<EntityMap[K] | null> {
    const { data, error } = await this.client
      .from(TABLE[collection])
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? fromRow<EntityMap[K]>(data) : null;
  }

  async put<K extends CollectionName>(collection: K, record: EntityMap[K]): Promise<EntityMap[K]> {
    const row = toRow({ ...record, orgId: (record as { orgId?: string }).orgId || this.orgId });
    const { data, error } = await this.client
      .from(TABLE[collection])
      .upsert(row)
      .select()
      .single();
    if (error) rethrowWrite(error);
    this.notify(collection);
    return fromRow<EntityMap[K]>(data);
  }

  async putMany<K extends CollectionName>(
    collection: K,
    records: EntityMap[K][],
  ): Promise<EntityMap[K][]> {
    const rows = records.map((r) =>
      toRow({ ...r, orgId: (r as { orgId?: string }).orgId || this.orgId }),
    );
    const { data, error } = await this.client.from(TABLE[collection]).upsert(rows).select();
    if (error) rethrowWrite(error);
    this.notify(collection);
    return (data ?? []).map((r) => fromRow<EntityMap[K]>(r));
  }

  async remove<K extends CollectionName>(collection: K, id: ID): Promise<void> {
    // Hard delete; FK cascades + RLS protect integrity server-side.
    const { error } = await this.client.from(TABLE[collection]).delete().eq('id', id);
    if (error) rethrowWrite(error);
    this.notify(collection);
  }

  async getSingleton<K extends SingletonName>(name: K): Promise<SingletonMap[K] | null> {
    if (name === 'organization') {
      const { data, error } = await this.client
        .from('organizations')
        .select('*')
        .eq('id', this.orgId)
        .maybeSingle();
      if (error) throw error;
      return data ? fromRow<SingletonMap[K]>(data) : null;
    }
    return null;
  }

  async setSingleton<K extends SingletonName>(
    name: K,
    value: SingletonMap[K],
  ): Promise<SingletonMap[K]> {
    if (name === 'organization') {
      const { data, error } = await this.client
        .from('organizations')
        .update(toRow(value as unknown as Record<string, unknown>))
        .eq('id', this.orgId)
        .select()
        .single();
      if (error) throw error;
      return fromRow<SingletonMap[K]>(data);
    }
    return value;
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async clearAll(): Promise<void> {
    // No-op for cloud: deleting an org cascades server-side via the dashboard.
    // Intentionally not destructive from the client.
  }

  /**
   * Demo-only atomic restore (RPC restore_org_data, migration 0020). The server
   * enforces owner + is_demo, forces org_id, and runs in one transaction. On
   * success we notify every collection so all live queries refetch.
   */
  async restoreOrgData(orgId: ID, payload: Record<string, unknown[]>): Promise<number> {
    const { data, error } = await this.client.rpc('restore_org_data', {
      p_org_id: orgId,
      p_payload: payload,
    });
    if (error) {
      const msg = error.message ?? '';
      if (/Forbidden/i.test(msg)) {
        throw new Error('Hanya owner yang boleh memulihkan data.');
      }
      if (/demo/i.test(msg)) {
        throw new Error('Restore hanya tersedia untuk akun demo.');
      }
      throw error;
    }
    // Refetch all collections in the UI.
    for (const c of Object.keys(TABLE) as CollectionName[]) this.notify(c);
    const result = data as { ok?: boolean; restored?: number } | null;
    return result?.restored ?? 0;
  }

  /** Access the raw client for RPC calls (atomic mutations). */
  rpc() {
    return this.client;
  }
}
