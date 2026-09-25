/**
 * Pure business logic for the service ticket lifecycle.
 * No DOM/repository dependencies → fully unit-testable. The UI layer
 * calls these to compute next states, then persists via the repository.
 */
import type {
  ClaimItem,
  Service,
  ServiceStatus,
  ServiceSparepart,
  Role,
} from '@/data/types';
import { addDays } from '@/lib/time';

/** Allowed status transitions (state machine). */
const TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  diterima: ['diagnosa', 'batal'],
  diagnosa: ['konfirmasi', 'batal'],
  konfirmasi: ['tunggu', 'pengerjaan', 'batal'],
  tunggu: ['pengerjaan', 'batal'],
  pengerjaan: ['selesai', 'batal'],
  // Pengerjaan = buka lagi (salah tandai Selesai); batal = unit tak ditebus.
  selesai: ['lunas', 'pengerjaan', 'batal'],
  lunas: [],
  batal: [],
};

export function canTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: ServiceStatus): ServiceStatus[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * Statuses an employee (non owner/admin) is NOT allowed to set. Only the
 * money-sensitive settlement (`lunas`) and the destructive cancellation
 * (`batal`) are owner/admin-only. Staff own the full work pipeline INCLUDING
 * `konfirmasi` (cost-estimate confirmation) — otherwise they'd be stuck at
 * `diagnosa`, whose only forward transitions are `konfirmasi`/`batal` (both
 * blocked), which also forced the Status modal into the DP-only screen.
 */
const RESTRICTED_FOR_STAFF: ServiceStatus[] = ['lunas', 'batal'];

/** Whether a role may move a ticket into a given status. */
export function canSetStatus(role: Role, status: ServiceStatus): boolean {
  if (role === 'owner' || role === 'admin') return true;
  return !RESTRICTED_FOR_STAFF.includes(status);
}

/**
 * Whether spareparts should be deducted from stock when entering a status.
 * NOTE: under immediate deduction (stock leaves the shelf the moment an
 * inventory line is ADDED), this path is a legacy fallback — it only fires for
 * lines still flagged `deducted:false` (e.g. data created before that change).
 * New lines arrive already `deducted:true`, so `computeStockDeduction` skips
 * them here and no double-deduction occurs.
 */
export function shouldDeductStock(status: ServiceStatus): boolean {
  return status === 'pengerjaan';
}

/**
 * Compute which spareparts still need deduction when a ticket reaches a
 * stock-affecting status. Returns the items to deduct (qty by itemId) and
 * the updated sparepart list with `deducted` flags set. Manual "modal dadakan"
 * lines (kind 'manual' / itemId null) are skipped — they have no stock.
 */
export function computeStockDeduction(
  spareparts: ServiceSparepart[],
  status: ServiceStatus,
): { deductions: { itemId: string; qty: number }[]; updated: ServiceSparepart[] } {
  if (!shouldDeductStock(status)) {
    return { deductions: [], updated: spareparts };
  }
  const deductions: { itemId: string; qty: number }[] = [];
  const updated = spareparts.map((sp) => {
    const isInventory = sp.kind !== 'manual' && sp.itemId != null;
    if (isInventory && !sp.deducted) {
      deductions.push({ itemId: sp.itemId as string, qty: sp.qty });
      return { ...sp, deducted: true };
    }
    return sp;
  });
  return { deductions, updated };
}

/**
 * Compute stock to RETURN to inventory when a ticket is cancelled: every
 * inventory line still flagged `deducted` is reversed (qty by itemId) and the
 * line is flipped to `deducted:false` so a re-cancel / further edit can't
 * double-restore. Manual lines have no stock and are skipped (their cash is
 * reversed separately via their linked Expense). Indeks di `consumed` = part
 * terpakai (terpasang/rusak): tidak kembali ke rak dan tetap `deducted`
 * (cermin cancel_service 0088).
 */
export function computeStockRestore(
  spareparts: ServiceSparepart[],
  consumed: ReadonlySet<number> = new Set(),
): { restorations: { itemId: string; qty: number }[]; updated: ServiceSparepart[] } {
  const restorations: { itemId: string; qty: number }[] = [];
  const updated = spareparts.map((sp, i) => {
    const isInventory = sp.kind !== 'manual' && sp.itemId != null;
    if (isInventory && sp.deducted && !consumed.has(i)) {
      restorations.push({ itemId: sp.itemId as string, qty: sp.qty });
      return { ...sp, deducted: false };
    }
    return sp;
  });
  return { restorations, updated };
}

/**
 * Selisih stok saat daftar sparepart tiket berubah. Stok yang dipegang tiket =
 * qty baris inventori yang `deducted`; delta > 0 kembali ke rak, delta < 0
 * diambil dari rak. Cermin dari RPC update_service_parts (0064).
 */
export function partsStockDelta(
  before: ServiceSparepart[],
  after: ServiceSparepart[],
): { itemId: string; delta: number }[] {
  const held = (parts: ServiceSparepart[]) => {
    const qty = new Map<string, number>();
    for (const sp of parts) {
      if (sp.kind === 'manual' || !sp.itemId || !sp.deducted) continue;
      qty.set(sp.itemId, (qty.get(sp.itemId) ?? 0) + sp.qty);
    }
    return qty;
  };
  const b = held(before);
  const a = held(after);
  return [...new Set([...b.keys(), ...a.keys()])]
    .map((itemId) => ({ itemId, delta: (b.get(itemId) ?? 0) - (a.get(itemId) ?? 0) }))
    .filter((d) => d.delta !== 0);
}

/** Outstanding balance a customer still owes (final cost minus DP). */
export function outstandingBalance(service: Pick<Service, 'finalCost' | 'downPayment'>): number {
  return Math.max(0, service.finalCost - service.downPayment);
}

/**
 * Total modal/cost for a service = sum of every cost line (inventory HPP +
 * ad-hoc "modal dadakan"). Used for the per-unit margin display.
 */
export function serviceModalTotal(spareparts: ServiceSparepart[]): number {
  return sparepartCost(spareparts);
}

/** Total sparepart cost (HPP) for margin calculations. */
export function sparepartCost(spareparts: ServiceSparepart[]): number {
  return spareparts.reduce((sum, sp) => sum + sp.costPrice * sp.qty, 0);
}

/** Estimated profit = final cost − total modal (HPP parts + ad-hoc costs). */
export function serviceProfit(service: Pick<Service, 'finalCost' | 'spareparts'>): number {
  return service.finalCost - sparepartCost(service.spareparts);
}

/**
 * Net wallet balance deltas when editing a manual "modal dadakan" line: refund
 * the old debit (+oldAmount to the old wallet) and apply the new debit
 * (−newAmount to the new wallet), netted per wallet so editing the amount on
 * the SAME wallet yields a single delta (e.g. 100k→150k on W1 = −50k), and a
 * no-op edit yields no entries. Pure → unit-testable; the UI applies the
 * returned map via `applyBalance`.
 */
export function walletDeltasForModalEdit(
  oldWalletId: string | null,
  oldAmount: number,
  newWalletId: string,
  newAmount: number,
): Map<string, number> {
  const delta = new Map<string, number>();
  if (oldWalletId) delta.set(oldWalletId, oldAmount);
  delta.set(newWalletId, (delta.get(newWalletId) ?? 0) - newAmount);
  // Drop zero-net entries so callers can skip no-op writes.
  for (const [wid, d] of delta) {
    if (d === 0) delta.delete(wid);
  }
  return delta;
}

/**
 * Canonical income description builders. Settlement & DP income rows are
 * matched by these exact strings (plus `serviceId`) when correcting the final
 * cost or refunding a cancelled ticket, so they MUST be produced here and
 * nowhere else — ad-hoc string literals would break matching silently.
 */
export function dpIncomeDescription(serviceNo: string): string {
  return `DP servis ${serviceNo}`;
}
export function settlementIncomeDescription(serviceNo: string): string {
  return `Pelunasan servis ${serviceNo}`;
}
/** Selisih Koreksi Biaya (0063): pemasukan bila biaya naik, pengeluaran bila turun. */
export function costCorrectionDescription(serviceNo: string): string {
  return `Koreksi biaya servis ${serviceNo}`;
}
/** Nomor servis dari deskripsi selisih Koreksi Biaya, atau null bila bukan baris koreksi. */
export function serviceNoFromCorrection(description: string): string | null {
  const prefix = costCorrectionDescription('');
  return description.startsWith(prefix) && description.length > prefix.length
    ? description.slice(prefix.length)
    : null;
}

/**
 * Income recorded at settlement ("lunas") = the amount still owed after any
 * down payment. Equivalent to `outstandingBalance` but on primitives, so the
 * settlement path can compute it without building a Service object. When DP
 * already covers the bill this is 0 → NO settlement income (avoids the legacy
 * `|| cost` double-count bug).
 */
export function settlementAmount(finalCost: number, downPayment: number): number {
  return Math.max(0, finalCost - downPayment);
}

/** One leg of a split settlement payment: a wallet and the amount paid into it. */
export interface PaymentSplit {
  walletId: string;
  amount: number;
}

/** Sum of split amounts (ignores falsy amounts). */
export function splitTotal(splits: PaymentSplit[]): number {
  return splits.reduce((sum, p) => sum + (p.amount || 0), 0);
}

/** Keep only legs with a wallet assigned and a positive amount. */
export function normalizeSplits(splits: PaymentSplit[]): PaymentSplit[] {
  return splits.filter((p) => p.walletId && p.amount > 0);
}

/**
 * Validate that split payments exactly cover `target` at settlement. Returns an
 * error key (or null when valid). Pure → unit-testable; the UI maps the key to
 * a toast. A single-wallet payment is just a one-leg split.
 */
export function validateSplit(splits: PaymentSplit[], target: number): 'empty' | 'mismatch' | null {
  const clean = normalizeSplits(splits);
  if (clean.length === 0) return 'empty';
  if (splitTotal(clean) !== target) return 'mismatch';
  return null;
}

/** Whether a status is terminal (no further transitions). */
export function isTerminal(status: ServiceStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}

/** Whether a ticket counts as "in progress" for dashboards. */
export function isActive(status: ServiceStatus): boolean {
  return !['lunas', 'batal'].includes(status);
}

/**
 * Masih dikerjakan: belum Selesai, Lunas, atau Batal. Tiket Selesai menunggu
 * bayar/ambil, bukan antrean kerja — dulu ikut `isActive`, sehingga satu tiket
 * Selesai terhitung "dalam proses" sekaligus "selesai".
 */
export function isUnfinished(status: ServiceStatus): boolean {
  return !['selesai', 'lunas', 'batal'].includes(status);
}

/** Tiket yang tampil di daftar & dashboard: yang diarsipkan disembunyikan. */
export function visibleServices<T extends Pick<Service, 'archived'>>(services: T[]): T[] {
  return services.filter((s) => !s.archived);
}

/** Kelebihan bayar ketika DP melebihi biaya final (0 bila tidak ada). */
export function overpaidAmount(finalCost: number, downPayment: number): number {
  return Math.max(0, downPayment - finalCost);
}

/** Deskripsi baku pengeluaran refund kelebihan DP (dicocokkan RPC 0062). */
export function overpaidRefundDescription(serviceNo: string): string {
  return `Refund kelebihan DP servis ${serviceNo}`;
}

/**
 * Statuses at which a unit is "closed" work-wise and the physical device is
 * waiting for the customer to collect it: finished (`selesai`), paid (`lunas`),
 * or cancelled (`batal`). A still-in-progress ticket is NOT awaiting pickup.
 */
export const AWAITING_PICKUP_STATUSES: ServiceStatus[] = ['selesai', 'lunas', 'batal'];

/**
 * Whether the device is done/closed but NOT yet physically collected. Single
 * source of truth shared by the Services page (filter, stat, indicator) and the
 * dashboard alert, so "menunggu diambil" means the same thing everywhere.
 * Pickup is independent of payment — a unit can be paid but uncollected.
 */
export function isAwaitingPickup(
  service: Pick<Service, 'status' | 'pickedUp'>,
): boolean {
  return !service.pickedUp && AWAITING_PICKUP_STATUSES.includes(service.status);
}

/**
 * Tuntas = lunas atau batal DAN barangnya sudah diambil. Tak ada lagi yang perlu
 * dikerjakan, ditagih, atau diserahkan, jadi tiket ini turun ke dasar daftar
 * Servis di bawah tiket yang masih menunggu sesuatu.
 */
export function isClosedOut(service: Pick<Service, 'status' | 'pickedUp'>): boolean {
  return service.pickedUp && (service.status === 'lunas' || service.status === 'batal');
}

/**
 * Latest warranty expiry across service & parts (null if neither set).
 * Used to decide overall coverage and to display "garansi s/d".
 */
export function warrantyEndDate(
  service: Pick<Service, 'warrantyServiceUntil' | 'warrantyPartsUntil'>,
): string | null {
  const dates = [service.warrantyServiceUntil, service.warrantyPartsUntil].filter(
    (d): d is string => !!d,
  );
  if (!dates.length) return null;
  return dates.reduce((a, b) => (a >= b ? a : b));
}

/**
 * Garansi sudah DITETAPKAN (termasuk "tanpa garansi") setelah tiket melewati
 * Selesai. Sebelum itu tanggal kosong berarti "belum ada", bukan "tanpa".
 */
export function warrantyDecided(service: Pick<Service, 'status'>): boolean {
  return service.status === 'selesai' || service.status === 'lunas';
}

/** Tetapkan garansi tiap part dari jumlah hari (`days[i]` milik part ke-i; 0 = tanpa garansi). */
export function applyPartWarranty(
  spareparts: ServiceSparepart[],
  days: number[],
  finishDate: string,
): ServiceSparepart[] {
  return spareparts.map((sp, i) => {
    const d = Math.max(0, Math.round(days[i] ?? 0));
    return { ...sp, warrantyDays: d, warrantyUntil: d > 0 ? addDays(finishDate, d) : null };
  });
}

/** Garansi part paling akhir, dipakai sebagai `warrantyPartsUntil` tiket (klaim, lacak lama). */
export function latestPartWarranty(spareparts: ServiceSparepart[]): string | null {
  return spareparts.reduce<string | null>(
    (latest, sp) => (sp.warrantyUntil && (!latest || sp.warrantyUntil > latest) ? sp.warrantyUntil : latest),
    null,
  );
}

/** Part yang garansinya sudah ditetapkan: nama + tanggal akhir (null = tanpa garansi). */
export function partWarranties(
  spareparts: ServiceSparepart[],
): { name: string; until: string | null }[] {
  return spareparts
    .filter((sp) => sp.warrantyDays != null)
    .map((sp) => ({ name: sp.name, until: sp.warrantyUntil ?? null }));
}

/** Whether any warranty (service or parts) is still valid on `today` (inclusive). */
export function isUnderWarranty(
  service: Pick<Service, 'warrantyServiceUntil' | 'warrantyPartsUntil'>,
  today: string,
): boolean {
  const end = warrantyEndDate(service);
  return end ? today <= end : false;
}

/**
 * Whether a warranty claim can be opened for this ticket: it must be settled
 * ("lunas"), still under warranty, and not itself a claim ticket.
 */
export function canClaimWarranty(
  service: Pick<
    Service,
    'status' | 'warrantyServiceUntil' | 'warrantyPartsUntil' | 'warrantyClaimOf'
  >,
  today: string,
): boolean {
  return (
    service.status === 'lunas' &&
    !service.warrantyClaimOf &&
    isUnderWarranty(service, today)
  );
}

/**
 * Bagian tiket yang masih bergaransi pada `today` — pilihan saat klaim.
 * Part dengan garansi per part memakai tanggalnya sendiri, part lama memakai
 * garansi part tiket. Cermin dari validasi create_warranty_claim (0065).
 */
export function claimableItems(
  service: Pick<Service, 'warrantyServiceUntil' | 'warrantyPartsUntil' | 'spareparts'>,
  today: string,
): ClaimItem[] {
  const items: ClaimItem[] = [];
  if (service.warrantyServiceUntil && service.warrantyServiceUntil >= today) {
    items.push({ kind: 'service', name: 'Jasa servis', until: service.warrantyServiceUntil });
  }
  for (const sp of service.spareparts) {
    const until = sp.warrantyDays != null ? sp.warrantyUntil : service.warrantyPartsUntil;
    if (!until || until < today) continue;
    if (items.some((i) => i.kind === 'part' && i.name === sp.name)) continue;
    items.push({ kind: 'part', name: sp.name, until });
  }
  return items;
}

/** Klaim garansi yang masih berjalan (belum Lunas/Batal) untuk tiket asli ini. */
export function openClaimFor<T extends Pick<Service, 'warrantyClaimOf' | 'status'>>(
  services: T[],
  originId: string,
): T | undefined {
  return services.find(
    (s) => s.warrantyClaimOf === originId && s.status !== 'lunas' && s.status !== 'batal',
  );
}

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  diterima: 'Diterima',
  diagnosa: 'Diagnosa',
  konfirmasi: 'Konfirmasi Biaya',
  tunggu: 'Tunggu Sparepart',
  pengerjaan: 'Pengerjaan',
  selesai: 'Selesai',
  lunas: 'Lunas',
  batal: 'Dibatalkan',
};

export const STATUS_TONE: Record<ServiceStatus, string> = {
  diterima: 'brand',
  diagnosa: 'info',
  konfirmasi: 'warning',
  tunggu: 'warning',
  pengerjaan: 'info',
  selesai: 'success',
  lunas: 'success',
  batal: 'danger',
};
