/**
 * FixMaster — Entity Types
 * Single source of truth for all data shapes across the app.
 * Designed for a relational model (one concern per entity), unlike
 * FixNova's JSONB key-value blobs. Each entity carries audit fields
 * to support per-row sync + conflict resolution later (Supabase phase).
 */

// ---------- Shared ----------
export type ID = string;
export type ISODate = string; // e.g. "2026-06-02"
export type ISODateTime = string; // e.g. "2026-06-02T09:00:00.000Z"

/** Audit fields present on every persisted record. */
export interface BaseEntity {
  id: ID;
  orgId: ID;
  outletId: ID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Soft-delete tombstone for sync safety. */
  deletedAt: ISODateTime | null;
}

// ---------- Roles & Plans ----------
export type Role = 'owner' | 'admin' | 'karyawan';

// NOTE: the Postgres `plan_type` enum also contains a legacy 'free' value,
// but FixMaster uses a trial→paid model, so 'free' is NOT offered and is
// intentionally omitted here. Signup always grants 'trial'; no org is ever
// assigned 'free'. The enum value is left in the DB to avoid a risky migration.
export type PlanType = 'standard' | 'enterprise' | 'trial' | 'suspended';

// ---------- Organization & Users ----------
export interface Organization {
  id: ID;
  name: string;
  address: string;
  phone: string;
  /**
   * Logo image src, rendered directly as `<img src>`. Holds either a data URL
   * (local mode) or a public Storage URL (cloud — bucket `org-logos`). See
   * `src/data/storage.ts`. Null = no logo (initial-letter fallback shown).
   */
  logoDataUrl: string | null;
  servicePrefix: string; // e.g. "FM"
  planType: PlanType;
  trialStartedAt: ISODateTime | null;
  planExpiredAt: ISODateTime | null;
  maxOutlets: number;
  maxUsers: number;
  /**
   * Demo workspace flag (cloud). When true, the owner may REPLACE all domain
   * data via restore_org_data (migration 0020) — used to keep the public
   * landing-page demo account fresh. Real customer orgs are false, so their
   * data can never be wiped by restore. Defaults false everywhere.
   */
  isDemo?: boolean;
  /**
   * Org-scoped config that must sync across devices (cloud) instead of living
   * in per-browser localStorage. Extensible jsonb (migration 0032). Currently
   * holds the device-category dropdown list; future org config can be added
   * here without a new migration. Optional + tolerant of missing keys.
   */
  settings?: OrgSettings;
  createdAt: ISODateTime;
}

/** Shape of `Organization.settings` (jsonb). All keys optional. */
export interface OrgSettings {
  /** Device categories offered in the "new service" dropdown. */
  deviceCategories?: string[];
}

export interface Employee extends BaseEntity {
  name: string;
  role: Role;
  /** Salted PIN hash (never plaintext). Format: "s2:<hex>". */
  pinHash: string;
  active: boolean;
}

export interface Outlet extends BaseEntity {
  name: string;
  address: string;
  isPrimary: boolean;
  /**
   * Attendance geofence (optional). When `lat`/`lng` are set, clock-in is
   * validated server-side to be within `geofenceRadiusM` meters of this point.
   * Unset = no geofence (clock-in allowed anywhere, legacy behavior).
   */
  lat?: number | null;
  lng?: number | null;
  geofenceRadiusM?: number | null;
}

// ---------- Customers ----------
export interface Customer extends BaseEntity {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

// ---------- Inventory & Suppliers ----------
export interface InventoryItem extends BaseEntity {
  name: string;
  category: string;
  sku: string;
  stock: number;
  minStock: number;
  costPrice: number; // HPP
  sellPrice: number;
  supplierId: ID | null;
}

export interface Supplier extends BaseEntity {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrderLine {
  itemId: ID;
  name: string;
  qty: number;
  costPrice: number;
  receivedQty: number;
}

export interface PurchaseOrder extends BaseEntity {
  poNumber: string;
  supplierId: ID;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  orderedAt: ISODate | null;
  receivedAt: ISODate | null;
  note: string;
}

// ---------- Wallets & Finance ----------
export interface Wallet extends BaseEntity {
  name: string;
  balance: number;
  sortOrder: number;
}

export type IncomeCategory = 'Servis' | 'Penjualan' | 'Lainnya';
export type ExpenseCategory =
  | 'Sparepart'
  | 'Operasional'
  | 'Gaji'
  | 'Sewa'
  | 'Garansi'
  | 'Refund Penjualan'
  | 'Lainnya';

export interface Income extends BaseEntity {
  date: ISODate;
  category: IncomeCategory;
  amount: number;
  walletId: ID;
  description: string;
  /** Link back to the originating service, if any. */
  serviceId: ID | null;
  /** Link back to the originating POS sale, if any (for void reversal). */
  saleId?: ID | null;
}

export interface Expense extends BaseEntity {
  date: ISODate;
  category: ExpenseCategory;
  amount: number;
  walletId: ID;
  description: string;
}

export interface FixedCost extends BaseEntity {
  name: string;
  amount: number;
}

// ---------- Services ----------
export type ServiceStatus =
  | 'diterima'
  | 'diagnosa'
  | 'konfirmasi'
  | 'tunggu'
  | 'pengerjaan'
  | 'selesai'
  | 'lunas'
  | 'batal';

export interface ServiceSparepart {
  /**
   * Inventory item id, or `null` for an ad-hoc "modal dadakan" cost line
   * (a part/service bought outside stock). Kept in the same JSONB array as
   * inventory parts so no DB migration is needed.
   */
  itemId: ID | null;
  name: string;
  qty: number;
  costPrice: number;
  sellPrice: number;
  /** Whether stock has already been deducted (deferred until "pengerjaan"). */
  deducted: boolean;
  /**
   * Line kind. 'inventory' (default) = drawn from stock, deducts inventory,
   * makes NO expense (capital already spent at purchase). 'manual' = ad-hoc
   * out-of-pocket cost that DOES create a linked Expense (real cash out).
   * Optional so legacy rows (no field) read as 'inventory'.
   */
  kind?: 'inventory' | 'manual';
  /** For 'manual' lines: the linked Expense id, so it can be reversed on delete. */
  expenseId?: ID | null;
  /** For 'manual' lines: wallet the cash came out of (for the linked Expense). */
  walletId?: ID | null;
}

export interface ServiceHistoryEntry {
  at: ISODateTime;
  status: ServiceStatus | 'edit';
  by: ID; // employee id
  byName: string;
  note: string;
  /** Internal "edit" entries are hidden from the public tracking page. */
  internal: boolean;
}

export interface Service extends BaseEntity {
  serviceNo: string;
  customerId: ID;
  customerName: string;
  customerPhone: string;
  category: string; // device type
  device: string;
  complaint: string;
  accessories: string;
  status: ServiceStatus;
  technicianId: ID | null;
  technicianName: string;
  estimateCost: number;
  finalCost: number;
  downPayment: number;
  spareparts: ServiceSparepart[];
  /** Service/labor warranty expiry (set when marked "selesai"). */
  warrantyServiceUntil: ISODate | null;
  /** Spare-part warranty expiry (set when marked "selesai"). */
  warrantyPartsUntil: ISODate | null;
  /** Whether the device has been physically collected by the customer. */
  pickedUp: boolean;
  /** When the device was collected (independent of payment status). */
  pickedUpAt: ISODateTime | null;
  /** If this ticket is a warranty claim, links to the original ticket ID. */
  warrantyClaimOf: ID | null;
  history: ServiceHistoryEntry[];
  archived: boolean;
}

// ---------- POS Sales ----------
export interface SaleLine {
  itemId: ID;
  name: string;
  qty: number;
  sellPrice: number;
  costPrice: number;
}

export interface PaymentAllocation {
  walletId: ID;
  amount: number;
}

export interface Sale extends BaseEntity {
  saleNo: string;
  date: ISODate;
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  discountType: 'percent' | 'amount';
  total: number;
  payments: PaymentAllocation[];
  cashierId: ID;
  cashierName: string;
  voided: boolean;
  voidedReason: string;
}

// ---------- Attendance ----------
export type AttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'alpha';

export interface Attendance extends BaseEntity {
  employeeId: ID;
  employeeName: string;
  date: ISODate;
  status: AttendanceStatus;
  checkIn: string | null; // "HH:MM"
  checkOut: string | null; // "HH:MM"
  totalHours: number;
  note: string;
}

// ---------- Internal Tasks (NEW — not in FixNova) ----------
export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly';

export type AssigneeType = 'role' | 'employee' | 'outlet';

export interface TaskTemplate extends BaseEntity {
  title: string;
  description: string;
  recurrence: RecurrenceType;
  /** weekly: 0-6 (Sun-Sat). */
  weekdays: number[];
  /** monthly: 1-31. */
  monthDays: number[];
  /** once: specific date. */
  onceDate: ISODate | null;
  assigneeType: AssigneeType;
  assigneeRole: Role | null;
  assigneeEmployeeId: ID | null;
  assigneeOutletId: ID | null;
  active: boolean;
  startDate: ISODate;
  endDate: ISODate | null;
}

export type TaskInstanceStatus = 'pending' | 'done' | 'skipped';

export interface TaskInstance extends BaseEntity {
  /** Owning template, or null for an ad-hoc quick task (no template). */
  templateId: ID | null;
  title: string;
  description: string;
  dueDate: ISODate;
  status: TaskInstanceStatus;
  completedAt: ISODateTime | null;
  completedById: ID | null;
  completedByName: string;
  note: string;
}

// ---------- Targets ----------
export interface MonthlyTarget {
  revenue: number;
  serviceCount: number;
  overheadBudget: number;
}

// ---------- Activity Log (audit trail, owner-only read) ----------
/** Canonical action verbs recorded in the activity log. */
export type ActivityAction =
  | 'auth.login'
  | 'sale.create'
  | 'sale.void'
  | 'income.create'
  | 'income.delete'
  | 'expense.create'
  | 'expense.update'
  | 'expense.delete'
  | 'inventory.create'
  | 'inventory.update'
  | 'inventory.delete'
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'attendance.update'
  | 'attendance.delete'
  | 'attendance.checkin'
  | 'attendance.checkout'
  | 'task.create'
  | 'task.complete'
  | 'service.create'
  | 'service.status'
  | 'wallet.transfer';

export interface ActivityLog extends BaseEntity {
  /** Membership id of who performed the action (null if removed later). */
  actorId: ID | null;
  actorName: string;
  actorRole: Role | null;
  action: ActivityAction;
  /** Entity kind affected, e.g. 'sale', 'customer'. */
  entityType: string;
  /** Affected entity id (string; not an FK so logs survive deletes). */
  entityId: string | null;
  /** Human-readable label, e.g. sale no / customer name. */
  entityLabel: string;
  /** Free-form structured context (amounts, before/after, reason). */
  meta: Record<string, unknown>;
}

