import { openDB, type IDBPDatabase } from 'idb';
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

const DB_NAME = 'fixmaster';
const DB_VERSION = 1;

const COLLECTIONS: CollectionName[] = [
  'employees',
  'outlets',
  'customers',
  'inventory',
  'suppliers',
  'purchaseOrders',
  'wallets',
  'incomes',
  'expenses',
  'fixedCosts',
  'services',
  'sales',
  'attendance',
  'taskTemplates',
  'taskInstances',
];

const SINGLETON_STORE = '_singletons';

/**
 * Local-first Repository backed by IndexedDB. Each collection is its own
 * object store with an `orgId` index, so reads are scoped and indexed —
 * no whole-array reads/writes (the FixNova bottleneck). Mutations are
 * per-record and transactional.
 */
export class LocalAdapter implements Repository {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private orgId: ID = '';
  /** Active outlet scope. null = "All Outlets" (show everything). */
  private outletId: ID | null = null;
  private listeners = new Set<ChangeListener>();

  /** Lazily open the IndexedDB connection on first use (test-safe). */
  private db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          for (const name of COLLECTIONS) {
            if (!db.objectStoreNames.contains(name)) {
              const store = db.createObjectStore(name, { keyPath: 'id' });
              store.createIndex('orgId', 'orgId');
            }
          }
          if (!db.objectStoreNames.contains(SINGLETON_STORE)) {
            db.createObjectStore(SINGLETON_STORE);
          }
        },
      });
    }
    return this.dbPromise;
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
    const db = await this.db();
    const all = (await db.getAllFromIndex(collection, 'orgId', this.orgId)) as EntityMap[K][];
    return all.filter((r) => {
      const base = r as BaseEntity;
      if (base.deletedAt) return false;
      // Outlet scoping: when a specific outlet is active, show records for
      // that outlet PLUS org-wide records (outletId null, e.g. wallets,
      // employees). When no outlet is active, show everything.
      if (this.outletId && base.outletId && base.outletId !== this.outletId) return false;
      return true;
    });
  }

  async get<K extends CollectionName>(collection: K, id: ID): Promise<EntityMap[K] | null> {
    const db = await this.db();
    const rec = (await db.get(collection, id)) as EntityMap[K] | undefined;
    if (!rec || (rec as BaseEntity).deletedAt) return null;
    return rec;
  }

  async put<K extends CollectionName>(collection: K, record: EntityMap[K]): Promise<EntityMap[K]> {
    const db = await this.db();
    const stamped = this.stamp(record as unknown as BaseEntity) as unknown as EntityMap[K];
    await db.put(collection, stamped);
    this.notify(collection);
    return stamped;
  }

  async putMany<K extends CollectionName>(
    collection: K,
    records: EntityMap[K][],
  ): Promise<EntityMap[K][]> {
    const db = await this.db();
    const tx = db.transaction(collection, 'readwrite');
    const stamped = records.map(
      (r) => this.stamp(r as unknown as BaseEntity) as unknown as EntityMap[K],
    );
    await Promise.all(stamped.map((r) => tx.store.put(r)));
    await tx.done;
    this.notify(collection);
    return stamped;
  }

  async remove<K extends CollectionName>(collection: K, id: ID): Promise<void> {
    const db = await this.db();
    const rec = (await db.get(collection, id)) as BaseEntity | undefined;
    if (!rec) return;
    rec.deletedAt = new Date().toISOString();
    rec.updatedAt = rec.deletedAt;
    await db.put(collection, rec);
    this.notify(collection);
  }

  async getSingleton<K extends SingletonName>(name: K): Promise<SingletonMap[K] | null> {
    const db = await this.db();
    const key = `${name}:${this.orgId}`;
    const val = (await db.get(SINGLETON_STORE, key)) as SingletonMap[K] | undefined;
    return val ?? null;
  }

  async setSingleton<K extends SingletonName>(
    name: K,
    value: SingletonMap[K],
  ): Promise<SingletonMap[K]> {
    const db = await this.db();
    const key = `${name}:${this.orgId}`;
    await db.put(SINGLETON_STORE, value, key);
    return value;
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async clearAll(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([...COLLECTIONS, SINGLETON_STORE], 'readwrite');
    await Promise.all([...COLLECTIONS, SINGLETON_STORE].map((s) => tx.objectStore(s).clear()));
    await tx.done;
    for (const c of COLLECTIONS) this.notify(c);
  }
}
