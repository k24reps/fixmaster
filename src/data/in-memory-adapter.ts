import type {
  Repository,
  CollectionName,
  EntityMap,
  SingletonName,
  SingletonMap,
  ChangeListener,
} from './repository';
import type { BaseEntity, ID } from './types';
import { newId } from '@/lib/id';

const COLLECTIONS: CollectionName[] = [
  'employees',
  'outlets',
  'customers',
  'inventory',
  'suppliers',
  'purchaseOrders',
  'wallets',
  'walletTransfers',
  'incomes',
  'expenses',
  'fixedCosts',
  'services',
  'sales',
  'attendance',
  'taskTemplates',
  'taskInstances',
  'activity',
];

/**
 * RAM-only Repository used exclusively by the public landing-page demo
 * (`/demo`). Mirrors {@link LocalAdapter}'s contract — org/outlet scoping,
 * soft-delete tombstones, change notifications, per-org singletons — but
 * keeps everything in `Map`s so it leaves ZERO trace on the visitor's disk
 * and never touches their real IndexedDB data. State lives for the lifetime
 * of the tab/page; a refresh starts fresh (re-seeded by DemoApp).
 *
 * Not wired into `createRepository()`; it is installed at runtime via
 * `installRepository()` only while the demo is mounted, then torn down.
 */
export class InMemoryAdapter implements Repository {
  /** collection name → (record id → record). */
  private stores = new Map<CollectionName, Map<ID, BaseEntity>>();
  /** singleton key (`name:orgId`) → value. */
  private singletons = new Map<string, unknown>();
  private orgId: ID = '';
  private outletId: ID | null = null;
  private listeners = new Set<ChangeListener>();

  constructor() {
    for (const name of COLLECTIONS) this.stores.set(name, new Map());
  }

  private store(collection: CollectionName): Map<ID, BaseEntity> {
    let s = this.stores.get(collection);
    if (!s) {
      s = new Map();
      this.stores.set(collection, s);
    }
    return s;
  }

  setScope(orgId: ID, outletId: ID | null): void {
    this.orgId = orgId;
    this.outletId = outletId;
  }

  private notify(collection: CollectionName) {
    for (const l of this.listeners) l(collection);
  }

  private stamp<T extends BaseEntity>(record: T): T {
    const now = new Date().toISOString();
    return {
      ...record,
      id: record.id || newId(),
      orgId: record.orgId || this.orgId,
      createdAt: record.createdAt || now,
      updatedAt: now,
      deletedAt: record.deletedAt ?? null,
    };
  }

  async list<K extends CollectionName>(collection: K): Promise<EntityMap[K][]> {
    const all = [...this.store(collection).values()] as EntityMap[K][];
    return all.filter((r) => {
      const base = r as BaseEntity;
      if (base.orgId !== this.orgId) return false;
      if (base.deletedAt) return false;
      // Outlet scoping mirrors LocalAdapter: a specific active outlet shows
      // that outlet's records PLUS org-wide ones (outletId null); no active
      // outlet shows everything.
      if (this.outletId && base.outletId && base.outletId !== this.outletId) return false;
      return true;
    });
  }

  async listByDateRange<K extends CollectionName>(
    collection: K,
    dateField: keyof EntityMap[K] & string,
    from: string,
    to: string,
  ): Promise<EntityMap[K][]> {
    const all = await this.list(collection);
    return all.filter((r) => {
      const v = (r as unknown as Record<string, unknown>)[dateField];
      return typeof v === 'string' && v >= from && v <= to;
    });
  }

  async get<K extends CollectionName>(collection: K, id: ID): Promise<EntityMap[K] | null> {
    const rec = this.store(collection).get(id) as EntityMap[K] | undefined;
    if (!rec || (rec as BaseEntity).deletedAt) return null;
    return rec;
  }

  async put<K extends CollectionName>(collection: K, record: EntityMap[K]): Promise<EntityMap[K]> {
    const stamped = this.stamp(record as unknown as BaseEntity) as unknown as EntityMap[K];
    this.store(collection).set((stamped as unknown as BaseEntity).id, stamped as unknown as BaseEntity);
    this.notify(collection);
    return stamped;
  }

  async patch<K extends CollectionName>(
    collection: K,
    id: ID,
    fields: Partial<EntityMap[K]>,
  ): Promise<EntityMap[K]> {
    const current = await this.get(collection, id);
    if (!current) throw new Error('Data tidak ditemukan');
    return this.put(collection, { ...current, ...fields });
  }

  async putMany<K extends CollectionName>(
    collection: K,
    records: EntityMap[K][],
  ): Promise<EntityMap[K][]> {
    const s = this.store(collection);
    const stamped = records.map(
      (r) => this.stamp(r as unknown as BaseEntity) as unknown as EntityMap[K],
    );
    for (const r of stamped) s.set((r as unknown as BaseEntity).id, r as unknown as BaseEntity);
    this.notify(collection);
    return stamped;
  }

  async remove<K extends CollectionName>(collection: K, id: ID): Promise<void> {
    const rec = this.store(collection).get(id);
    if (!rec) return;
    rec.deletedAt = new Date().toISOString();
    rec.updatedAt = rec.deletedAt;
    this.notify(collection);
  }

  async getSingleton<K extends SingletonName>(name: K): Promise<SingletonMap[K] | null> {
    const val = this.singletons.get(`${name}:${this.orgId}`) as SingletonMap[K] | undefined;
    return val ?? null;
  }

  async setSingleton<K extends SingletonName>(
    name: K,
    value: SingletonMap[K],
  ): Promise<SingletonMap[K]> {
    this.singletons.set(`${name}:${this.orgId}`, value);
    return value;
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async clearAll(): Promise<void> {
    for (const name of COLLECTIONS) this.store(name).clear();
    this.singletons.clear();
    for (const c of COLLECTIONS) this.notify(c);
  }
}
