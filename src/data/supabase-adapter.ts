import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, subscribeOrgTables } from './supabase-client';
import { useRealtimeStore } from '@/stores/realtime';
import { useSessionStore } from '@/stores/session';
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
 * Reverse of TABLE: Postgres table name → repository collection. Used to map a
 * realtime event's table back to the collection a UI query should refetch.
 */
export const TABLE_TO_COLLECTION: Record<string, CollectionName> = Object.fromEntries(
  (Object.entries(TABLE) as [CollectionName, string][]).map(([col, tbl]) => [tbl, col]),
) as Record<string, CollectionName>;

/**
 * Domain tables synced via realtime (migration 0021). Excludes `memberships`
 * (team/login rarely changes and isn't org_id-filtered the same way) — that
 * mirrors the publication contents.
 */
export const REALTIME_TABLES: readonly string[] = [
  'outlets', 'customers', 'suppliers', 'inventory_items', 'wallets',
  'fixed_costs', 'services', 'purchase_orders', 'sales', 'incomes',
  'expenses', 'attendance', 'task_templates', 'task_instances', 'activity_logs',
];

/**
 * Collections whose Postgres table has an `outlet_id` column AND should be
 * filtered by the active outlet scope. Transactional data + Hybrid wallets.
 * Shared config (customers, inventory, suppliers, employees, outlets) is
 * intentionally org-wide (OQ-A), so it is NOT outlet-filtered here. Filtering a
 * table without the column would raise a Postgres error, so this set is exact.
 */
const OUTLET_SCOPED: ReadonlySet<CollectionName> = new Set<CollectionName>([
  'services', 'sales', 'incomes', 'expenses',
  'attendance', 'purchaseOrders', 'taskInstances', 'wallets',
]);

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
  /** Active outlet scope. null = "All Outlets" (no outlet filter). */
  private outletId: ID | null = null;
  private listeners = new Set<ChangeListener>();
  private client: SupabaseClient;
  /** Unsubscribe handle for the active org's realtime channel. */
  private unsubscribeRealtime: (() => void) | null = null;
  /** Per-collection debounce timers, to coalesce bursts of realtime events. */
  private debounceTimers = new Map<CollectionName, ReturnType<typeof setTimeout>>();
  /**
   * True once the channel has gone offline, until the next successful resync.
   * The status sequence after an outage is offline→connecting→live (not a
   * direct offline→live), so we can't detect a reconnect by the previous
   * status alone — we latch this flag on 'offline' and resync on the next
   * 'live'. Starts false so the initial connect (connecting→live) doesn't
   * trigger a redundant refetch.
   */
  private wasOffline = false;

  constructor() {
    const c = getSupabase();
    if (!c) throw new Error('Supabase is not configured');
    this.client = c;
  }

  setScope(orgId: ID, outletId: ID | null = null): void {
    // Store outlet scope first: an outlet-only change (same org) must still
    // take effect even though the realtime channel below is rebound per-org.
    this.outletId = outletId;
    if (orgId === this.orgId && this.unsubscribeRealtime) return;
    this.orgId = orgId;
    // (Re)bind the realtime channel to this org so other devices' changes
    // refetch the affected collection here. Tear down any previous channel.
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = null;
    this.wasOffline = false;
    if (orgId) {
      this.unsubscribeRealtime = subscribeOrgTables(
        orgId,
        // `organizations` carries org-level config (e.g. device categories) on
        // the singleton row, not a collection — refreshed specially below.
        [...REALTIME_TABLES, 'organizations'],
        (table) => {
          if (table === 'organizations') {
            void this.refreshOrganization();
            return;
          }
          const collection = TABLE_TO_COLLECTION[table];
          if (collection) this.notifyDebounced(collection);
        },
        (status) => {
          useRealtimeStore.getState().setStatus(status);
          // Reconnect after an outage: events may have been missed while the
          // channel was down, so refetch every collection (full resync) plus
          // the org singleton. The server stays the source of truth — we never
          // merge on the client. The sequence is offline→connecting→live, so we
          // latch `wasOffline` and fire on the next 'live'.
          if (status === 'offline') {
            this.wasOffline = true;
          } else if (status === 'live' && this.wasOffline) {
            this.wasOffline = false;
            this.notifyAll();
            void this.refreshOrganization();
          }
        },
      );
    }
  }

  private notify(collection: CollectionName) {
    for (const l of this.listeners) l(collection);
  }

  /** Notify every collection so all live queries refetch (resync / restore). */
  private notifyAll() {
    for (const c of Object.keys(TABLE) as CollectionName[]) this.notify(c);
  }

  /**
   * Refetch the organization singleton into the session store. The org row is
   * loaded once at boot (not a TanStack collection), so realtime edits to
   * org-level config (e.g. device categories saved on another device) need an
   * explicit refresh here. Updates the `org` slice directly — NOT setOrg(),
   * which would reset the active outlet scope. Best-effort.
   */
  private async refreshOrganization(): Promise<void> {
    try {
      const org = await this.getSingleton('organization');
      if (org) useSessionStore.setState({ org });
    } catch {
      /* realtime refresh is best-effort; next boot/refetch will reconcile */
    }
  }

  /**
   * Notify after a short quiet period per collection. Bulk server writes (e.g.
   * a restore) emit many events; debouncing collapses them into one refetch.
   */
  private notifyDebounced(collection: CollectionName) {
    const existing = this.debounceTimers.get(collection);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(
      collection,
      setTimeout(() => {
        this.debounceTimers.delete(collection);
        this.notify(collection);
      }, 250),
    );
  }

  /** Tear down the realtime channel + pending timers (call on sign-out). */
  dispose(): void {
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = null;
    this.wasOffline = false;
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    useRealtimeStore.getState().reset();
  }

  async list<K extends CollectionName>(collection: K): Promise<EntityMap[K][]> {
    let query = this.client
      .from(TABLE[collection])
      .select('*')
      .eq('org_id', this.orgId)
      .is('deleted_at', null); // mirror LocalAdapter: hide soft-deleted rows
    // Outlet scoping (mirrors the local adapter): when a specific outlet is
    // active, return that outlet's rows PLUS org-wide rows (outlet_id null).
    // Only applied to tables that actually have an outlet_id column.
    if (this.outletId && OUTLET_SCOPED.has(collection)) {
      query = query.or(`outlet_id.eq.${this.outletId},outlet_id.is.null`);
    }
    // Newest-first, ALWAYS ordered: PostgREST caps responses (max_rows, default
    // 1000) and without ORDER BY the truncated subset is unspecified — an
    // append-only table like activity_logs would show an arbitrary slice,
    // possibly missing the NEWEST events. Ordered, the cap drops oldest rows.
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
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
      if (error.code === '42501') {
        throw new Error(
          'Langganan kedaluwarsa atau melebihi kuota — perpanjang di Pengaturan → Langganan untuk melanjutkan.',
        );
      }
      throw error;
    }
    // Refetch all collections in the UI.
    this.notifyAll();
    const result = data as { ok?: boolean; restored?: number } | null;
    return result?.restored ?? 0;
  }

  /** Access the raw client for RPC calls (atomic mutations). */
  rpc() {
    return this.client;
  }
}
