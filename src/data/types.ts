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
  /**
   * Catatan bebas milik toko, tampil di nota cetak dan halaman lacak publik.
   * Ini satu-satunya teks di kedua permukaan itu yang ditulis pemiliknya
   * sendiri — jam operasional, syarat garansi, ketentuan pengambilan — jadi
   * dokumen yang dipegang pelanggan terasa milik toko itu, bukan cetakan
   * generik. Kosong berarti bloknya tidak dirender sama sekali.
   */
  publicNote?: string;
  /** Owner-defined paths for the four primary slots in mobile navigation. */
  mobileNavigation?: string[];
  /** Kolom opsional yang tampil di tabel Servis (lihat lib/business/serviceColumns). */
  serviceColumns?: string[];
  /**
   * Target bulanan & overhead budget. Dulu hanya di localStorage per perangkat,
   * sehingga Indikator Break-Even di Laporan berbeda antara laptop dan HP, dan
   * hilang begitu data browser dibersihkan.
   */
  monthlyTarget?: MonthlyTarget;
  /** Sewa per cabang (id cabang → cara bayar). Tanpa entri = bulanan. */
  rent?: Record<ID, OutletRent>;
  /**
   * Setelan operasional yang membentuk SETIAP tiket baru. Dulu semuanya hanya
   * di localStorage: teknisi di HP dan kasir di laptop memakai default garansi
   * berbeda, dan membersihkan data browser menghapusnya — termasuk template
   * WhatsApp yang justru dijual sebagai fitur Pro.
   */
  complaintTemplates?: string[];
  accessoryTemplates?: string[];
  warrantyServiceDays?: number;
  warrantyPartsDays?: number;
  warrantyPresets?: number[];
  waTemplates?: Record<string, string>;
  /**
   * Kapan backup manual terakhir diunduh. Dulu hanya di perangkat masing-masing,
   * jadi pemilik dengan dua perangkat melihat dua kebenaran berbeda tentang
   * kapan terakhir ia mengamankan datanya.
   */
  lastBackupAt?: string;
  /**
   * Email backup mingguan ke owner (0085, Edge Function backup-email). Tak ada
   * nilai = AKTIF; hanya `false` yang mematikannya, supaya toko lama ikut
   * terlindungi tanpa harus menyalakannya dulu.
   */
  backupEmail?: boolean;
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
  /** Garansi bawaan (hari) saat item ini dipasang di tiket (0067); kosong = garansi part toko. */
  warrantyDays?: number | null;
}

export interface Supplier extends BaseEntity {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'ordered'
  | 'partial'
  | 'received'
  | 'cancelled';

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
  /**
   * Uang fisik di laci (0095). Kembalian Kasir selalu diambil dari wallet ini,
   * bukan dari pembayaran yang kebetulan diisi terakhir. Opsional: baris lama.
   */
  isCash?: boolean;
}

/**
 * Transfer saldo antar wallet (0086). Bukan pemasukan/pengeluaran — tidak
 * menyentuh laba. Dibatalkan = `status: 'void'` (baris tetap ada, saldo sudah
 * dikembalikan), bukan dihapus. Uang (wallet & nominal) hanya bisa diubah di
 * bulan berjalan; `note` bebas diedit kapan saja.
 */
export interface WalletTransfer extends BaseEntity {
  fromWalletId: ID;
  toWalletId: ID;
  /** Nama saat transfer dibuat/diedit — tetap terbaca walau wallet diganti nama. */
  fromName: string;
  toName: string;
  amount: number;
  note: string;
  /** Tanggal lokal YYYY-MM-DD. */
  date: string;
  status: 'active' | 'void';
  createdByName?: string;
  voidedAt?: string | null;
  voidedByName?: string | null;
  voidReason?: string | null;
}

/**
 * `Modal` = setoran modal pemilik (uang pribadi disuntik ke kas usaha).
 * Uangnya nyata dan menambah saldo, TAPI bukan pendapatan — dikecualikan
 * dari semua perhitungan omzet/laba lewat `operatingIncomes` (finance.ts).
 */
export type IncomeCategory = 'Servis' | 'Penjualan' | 'Modal' | 'Pelunasan Kasbon' | 'Lainnya';
/**
 * `Prive` = penarikan modal/untung oleh pemilik. Uangnya benar-benar keluar
 * dan mengurangi saldo, TAPI bukan biaya usaha — dikecualikan dari laba
 * lewat `operatingExpenses` (finance.ts). Cermin dari `Modal`.
 */
export type ExpenseCategory =
  | 'Sparepart'
  | 'Operasional'
  | 'Gaji'
  | 'Sewa'
  | 'Listrik & Air'
  | 'Internet & Pulsa'
  | 'Transportasi & Bensin'
  | 'Perlengkapan & ATK'
  | 'Perawatan & Perbaikan'
  | 'Pemasaran & Iklan'
  | 'Pajak & Retribusi'
  | 'Biaya Admin Bank'
  | 'Konsumsi'
  | 'Garansi'
  | 'Refund Penjualan'
  | 'Ongkos Kirim'
  | 'Peralatan & Inventaris'
  | 'Kasbon Karyawan'
  | 'Prive'
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
  /** For expenses auto-created when receiving a PO; lets void_po reverse them. */
  poId?: ID | null;
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
  /** Garansi bawaan item inventori saat baris ini diambil — isian awal garansi part saat Selesai. */
  defaultWarrantyDays?: number | null;
  /** For 'manual' lines: the linked Expense id, so it can be reversed on delete. */
  expenseId?: ID | null;
  /** For 'manual' lines: wallet the cash came out of (for the linked Expense). */
  walletId?: ID | null;
  /**
   * Garansi part ini (hari), ditetapkan saat tiket masuk Selesai. `undefined` =
   * belum diatur (tiket lama, atau part ditambahkan setelah Selesai); 0 = tanpa
   * garansi. Tetap di JSONB `spareparts`, jadi tanpa migrasi tabel.
   */
  warrantyDays?: number;
  /** Tanggal akhir garansi part (YYYY-MM-DD) bila warrantyDays > 0, selain itu null. */
  warrantyUntil?: ISODate | null;
}

export interface ServiceHistoryEntry {
  at: ISODateTime;
  status: ServiceStatus | 'edit';
  by: ID; // employee id
  byName: string;
  note: string;
  /** Internal "edit" entries are hidden from the public tracking page. */
  internal: boolean;
  /**
   * Hanya entri `batal` (sejak 28 Sep 2026): DP yang dikembalikan. Sisanya
   * ditahan toko dan dihitung sebagai pendapatan tiket (`retainedDownPayment`).
   * Tak ada di tiket yang dibatalkan sebelumnya — DP-nya "tak diketahui".
   */
  refund?: number;
}

/** Bagian tiket asli yang diklaim garansinya (migrasi 0065, kolom `claimed_items`). */
export interface ClaimItem {
  kind: 'service' | 'part';
  name: string;
  /** Akhir garansi bagian ini saat klaim dibuat. */
  until: ISODate;
  /** Diisi otomatis untuk klaim lama (0068) dari garansi yang berlaku saat itu — perkiraan. */
  inferred?: boolean;
}

/** Jenis kunci layar unit (0094). Isinya TIDAK di tiket — lihat data/serviceSecret. */
export type ScreenLockKind = 'pin' | 'pola' | 'sandi';

export interface Service extends BaseEntity {
  serviceNo: string;
  customerId: ID;
  customerName: string;
  customerPhone: string;
  category: string; // device type
  device: string;
  complaint: string;
  /**
   * Penanganan (tindakan perbaikan), wajib saat status Selesai (migrasi 0059,
   * kolom `completion_note`). Kolom sendiri, bukan hanya
   * di `history`, supaya daftar servis bisa menampilkannya tanpa memuat riwayat.
   * Opsional: baris lokal lama belum membawanya.
   */
  completionNote?: string;
  /**
   * Saat tiket PERTAMA kali mencapai status "selesai" (migrasi 0080). Kolom
   * sendiri, bukan dipindai dari `history`: Laporan hanya butuh satu stempel
   * waktu ini, dan memuat `history` untuk mendapatkannya menyeret ≈78% ukuran
   * tiap baris — sumber egress terbesar di produk.
   * Opsional: baris lokal lama belum membawanya, jadi `completionDate()`
   * tetap punya jalur mundur ke `history`.
   */
  completedAt?: ISODateTime;
  accessories: string;
  /** IMEI / nomor seri saat unit diterima (0094). Opsional: baris lama belum membawanya. */
  deviceSerial?: string;
  /** Kondisi fisik saat diterima — lecet, retak, bekas air (0094). */
  deviceCondition?: string;
  /** Hanya JENIS kunci layar yang dititipkan; isinya di `service_secrets`. */
  secretKind?: ScreenLockKind | null;
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
  /** Tiket klaim: bagian tiket asli yang diklaim. Kosong untuk tiket biasa & klaim lama. */
  claimedItems?: ClaimItem[] | null;
  /**
   * Append-only audit trail (server-enforced, migration 0058). ABSENT on rows
   * from the cloud `list()` — it is ~78% of every row, so plain lists omit it.
   * Show it with `useServiceHistory`; append with `[...(s.history ?? []), entry]`
   * (the trigger keeps every existing entry either way).
   */
  history?: ServiceHistoryEntry[];
  archived: boolean;
}

/**
 * Every `services` column EXCEPT `history`, for cloud list queries (egress:
 * history is ~78% of a row). PostgREST has no "all columns but one", so the
 * list is explicit — tier3e integration test asserts it still equals the
 * table's columns minus history, so a new column can't silently go missing.
 */
export const SERVICE_LIST_COLUMNS: string =
  'id,org_id,outlet_id,service_no,customer_id,customer_name,customer_phone,category,device,' +
  'complaint,completion_note,completed_at,accessories,device_serial,device_condition,secret_kind,' +
  'status,technician_id,technician_name,' +
  'estimate_cost,final_cost,' +
  'down_payment,spareparts,warranty_until,warranty_service_until,warranty_parts_until,' +
  'picked_up,picked_up_at,warranty_claim_of,claimed_items,archived,created_at,updated_at,deleted_at';

/**
 * Hitungan untuk lampu rel navigasi, dijawab satu RPC (`nav_counts`, 0081).
 * Menggantikan penarikan tiga tabel utuh yang dibayar di SETIAP halaman karena
 * rel ini hidup di Sidebar dan MobileBottomNav. Tugas TIDAK ada di sini: aturan
 * visibilitasnya per peran, dan menyalinnya ke SQL akan membuat badge menyimpang
 * dari halaman Tugas.
 */
export interface NavCounts {
  servicesActive: number;
  servicesAwaitingConfirm: boolean;
  inventoryOut: number;
  inventoryLow: number;
  poOpen: number;
}

/**
 * Hitungan tugas `pending` per template: lewat tenggat, dan jatuh tempo hari ini.
 * Keluaran RPC `task_counts_by_template` (0083), sekaligus bentuk yang dihasilkan
 * `groupTaskCounts` di jalur lokal — supaya keduanya lewat SATU langkah
 * visibilitas (`visibleTaskCounts`). `templateId` null = tugas tanpa template.
 */
export interface TaskCountGroup {
  templateId: string | null;
  overdue: number;
  dueToday: number;
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
  /** Pelanggan yang membeli, bila kasir mengaitkannya (0070). Null = pembeli umum. */
  customerId?: ID | null;
  /** Nama pelanggan saat transaksi — tetap terbaca meski datanya berubah kemudian. */
  customerName?: string;
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
  /**
   * Lokasi saat absen, bila dikirim perangkat (0076). Satu-satunya bukti selain
   * angka jam itu sendiri ketika jam kerja dipersoalkan.
   */
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
}

// ---------- Internal Tasks (NEW — not in FixNova) ----------
export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly';

export type AssigneeType = 'role' | 'employee' | 'outlet';

/** One task inside a template. Stored in the template's `items` JSONB array. */
export interface TaskTemplateItem {
  /** Stable id — correlates generated instances back to this item. */
  id: ID;
  title: string;
  description: string;
  /** Order within the template (asc). Edited only in the Template tab. */
  sortOrder: number;
}

export interface TaskTemplate extends BaseEntity {
  /** Group name, e.g. "SOP Buka Toko". Shown as the header in the daily tab. */
  name: string;
  /** The tasks this template produces each due date. */
  items: TaskTemplateItem[];
  /** @deprecated Pre-0041 single-task title. Kept only for backfill safety. */
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
  /** Manual SOP order (asc). Seeds each generated instance's sortOrder. */
  sortOrder: number;
}

export type TaskInstanceStatus = 'pending' | 'done' | 'skipped';

export interface TaskInstance extends BaseEntity {
  /** Owning template, or null for an ad-hoc quick task (no template). */
  templateId: ID | null;
  /**
   * Which TaskTemplateItem produced this instance (null for ad-hoc). Together
   * with templateId + dueDate this is the uniqueness key (migration 0041), and
   * it's how the daily list looks up the item's current order.
   */
  itemId: ID | null;
  title: string;
  description: string;
  dueDate: ISODate;
  status: TaskInstanceStatus;
  completedAt: ISODateTime | null;
  completedById: ID | null;
  completedByName: string;
  note: string;
  /**
   * Order within the day (asc). Copied from the template at generation, then
   * freely overridable — an override only affects THIS day, since tomorrow's
   * instance is a fresh row seeded from the template again.
   */
  sortOrder: number;
}

// ---------- Targets ----------
export interface MonthlyTarget {
  revenue: number;
  serviceCount: number;
  overheadBudget: number;
}

/**
 * Cara bayar sewa tempat per cabang. Kios servis ada yang bayar bulanan, ada
 * yang tahunan — sewa tahunan yang dicatat sekaligus membuat satu bulan
 * overhead-nya melonjak dan sebelas bulan lainnya terlihat terlalu sehat.
 */
export interface OutletRent {
  mode: 'bulanan' | 'tahunan';
  /** Nominal per tahun; dipakai hanya bila mode tahunan. */
  yearly: number;
}

// ---------- Activity Log (audit trail, owner-only read) ----------
/** Canonical action verbs recorded in the activity log. */
export type ActivityAction =
  | 'auth.login'
  | 'sale.create'
  | 'sale.void'
  | 'income.create'
  | 'income.update'
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
  | 'task.uncomplete'
  | 'po.void'
  | 'member.invite'
  | 'member.role'
  | 'member.deactivate'
  | 'member.delete'
  | 'settings.update'
  | 'activity.purge'
  | 'invite.revoke'
  | 'data.restore'
  | 'service.create'
  | 'service.status'
  | 'wallet.transfer'
  | 'wallet.transfer.edit'
  | 'wallet.transfer.void';

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
