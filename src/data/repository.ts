import type {
  Organization,
  Employee,
  Outlet,
  Customer,
  InventoryItem,
  Supplier,
  PurchaseOrder,
  Wallet,
  Income,
  Expense,
  FixedCost,
  Service,
  Sale,
  Attendance,
  TaskTemplate,
  TaskInstance,
  ActivityLog,
  ID,
} from './types';

/**
 * The set of entity collections FixMaster persists. Unlike FixNova's
 * single JSONB blob per key, each collection is a proper table/store
 * with per-row records — enabling indexed queries and atomic mutations.
 */
export interface EntityMap {
  employees: Employee;
  outlets: Outlet;
  customers: Customer;
  inventory: InventoryItem;
  suppliers: Supplier;
  purchaseOrders: PurchaseOrder;
  wallets: Wallet;
  incomes: Income;
  expenses: Expense;
  fixedCosts: FixedCost;
  services: Service;
  sales: Sale;
  attendance: Attendance;
  taskTemplates: TaskTemplate;
  taskInstances: TaskInstance;
  activity: ActivityLog;
}

export type CollectionName = keyof EntityMap;

/** Singleton, non-collection records (e.g. the organization profile). */
export interface SingletonMap {
  organization: Organization;
}
export type SingletonName = keyof SingletonMap;

export type ChangeListener = (collection: CollectionName) => void;

/**
 * Storage-agnostic data contract. Implemented by the IndexedDB adapter
 * (local-first dev) and later the Supabase adapter (production), so
 * feature code never depends on the underlying store.
 */
export interface Repository {
  /** Bind the active org/outlet scope for subsequent reads/writes. */
  setScope(orgId: ID, outletId: ID | null): void;

  /**
   * Optional teardown: release realtime channels/timers (cloud adapter). Called
   * on account reset/sign-out. No-op for adapters without live subscriptions.
   */
  dispose?(): void;

  // ---- Collections ----
  /**
   * `full`: every column. The cloud adapter omits heavy columns from plain
   * lists (services.history); anything that must be lossless — backups —
   * passes `full: true`.
   */
  list<K extends CollectionName>(collection: K, options?: { full?: boolean }): Promise<EntityMap[K][]>;
  /**
   * Like `list`, but only rows whose `dateField` falls within [from, to]
   * (inclusive). Pushes the date filter to the QUERY so time-series pages
   * (Dashboard/Laporan/Keuangan) never fetch the whole history — the thing
   * that silently truncated at the PostgREST row cap. `dateField` is the
   * camelCase entity field ('date' for incomes/expenses/sales, 'createdAt'
   * for services); `from`/`to` are the matching literal bounds (a plain
   * 'YYYY-MM-DD' for `date` columns; widen to timestamps for `createdAt`).
   */
  listByDateRange<K extends CollectionName>(
    collection: K,
    dateField: keyof EntityMap[K] & string,
    from: string,
    to: string,
  ): Promise<EntityMap[K][]>;
  get<K extends CollectionName>(collection: K, id: ID): Promise<EntityMap[K] | null>;
  /** Insert or update a record (sets audit fields automatically). */
  put<K extends CollectionName>(collection: K, record: EntityMap[K]): Promise<EntityMap[K]>;
  /** Bulk upsert within a single transaction (atomic). */
  putMany<K extends CollectionName>(
    collection: K,
    records: EntityMap[K][],
  ): Promise<EntityMap[K][]>;
  /** Soft-delete (tombstone) by id. */
  remove<K extends CollectionName>(collection: K, id: ID): Promise<void>;

  // ---- Singletons ----
  getSingleton<K extends SingletonName>(name: K): Promise<SingletonMap[K] | null>;
  setSingleton<K extends SingletonName>(name: K, value: SingletonMap[K]): Promise<SingletonMap[K]>;

  // ---- Reactivity ----
  subscribe(listener: ChangeListener): () => void;

  // ---- Maintenance ----
  clearAll(): Promise<void>;

  /**
   * Cloud-only, demo-only atomic restore. Replaces ALL domain data for the
   * given org in a single server transaction (RPC restore_org_data, migration
   * 0020). Optional: the local adapter restores via clearAll + putMany instead.
   * `payload` keys are snake_case table names → arrays of snake_case rows.
   */
  restoreOrgData?(orgId: ID, payload: Record<string, unknown[]>): Promise<number>;

  /**
   * Cloud-only: cari tiket di SELURUH tabel services, bukan hanya potongan
   * terbaru yang dimuat `list()` (dibatasi PostgREST). Kata kunci mencocokkan
   * nomor, pelanggan, HP, perangkat, dan keluhan; `createdFrom`/`createdTo` =
   * batas timestamp [from, to). Adapter lokal tidak membutuhkannya — daftarnya lengkap.
   */
  queryServices?(opts: {
    term?: string;
    createdFrom?: string;
    createdTo?: string;
    limit: number;
  }): Promise<EntityMap['services'][]>;
}
