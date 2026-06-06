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

  // ---- Collections ----
  list<K extends CollectionName>(collection: K): Promise<EntityMap[K][]>;
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
}
