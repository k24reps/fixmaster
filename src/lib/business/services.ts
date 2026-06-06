/**
 * Pure business logic for the service ticket lifecycle.
 * No DOM/repository dependencies → fully unit-testable. The UI layer
 * calls these to compute next states, then persists via the repository.
 */
import type {
  Service,
  ServiceStatus,
  ServiceSparepart,
  Role,
} from '@/data/types';

/** Allowed status transitions (state machine). */
const TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  diterima: ['diagnosa', 'batal'],
  diagnosa: ['konfirmasi', 'batal'],
  konfirmasi: ['tunggu', 'pengerjaan', 'batal'],
  tunggu: ['pengerjaan', 'batal'],
  pengerjaan: ['selesai', 'batal'],
  selesai: ['lunas'],
  lunas: [],
  batal: [],
};

export function canTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: ServiceStatus): ServiceStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Statuses an employee (non owner/admin) is NOT allowed to set. */
const RESTRICTED_FOR_STAFF: ServiceStatus[] = ['konfirmasi', 'lunas', 'batal'];

/** Whether a role may move a ticket into a given status. */
export function canSetStatus(role: Role, status: ServiceStatus): boolean {
  if (role === 'owner' || role === 'admin') return true;
  return !RESTRICTED_FOR_STAFF.includes(status);
}

/** Whether spareparts should be deducted from stock when entering a status. */
export function shouldDeductStock(status: ServiceStatus): boolean {
  // Deferred deduction: only when work actually begins.
  return status === 'pengerjaan';
}

/**
 * Compute which spareparts still need deduction when a ticket reaches a
 * stock-affecting status. Returns the items to deduct (qty by itemId) and
 * the updated sparepart list with `deducted` flags set.
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
    if (!sp.deducted) {
      deductions.push({ itemId: sp.itemId, qty: sp.qty });
      return { ...sp, deducted: true };
    }
    return sp;
  });
  return { deductions, updated };
}

/** Outstanding balance a customer still owes (final cost minus DP). */
export function outstandingBalance(service: Pick<Service, 'finalCost' | 'downPayment'>): number {
  return Math.max(0, service.finalCost - service.downPayment);
}

/** Total sparepart cost (HPP) for margin calculations. */
export function sparepartCost(spareparts: ServiceSparepart[]): number {
  return spareparts.reduce((sum, sp) => sum + sp.costPrice * sp.qty, 0);
}

/** Estimated profit = final cost − sparepart HPP. */
export function serviceProfit(service: Pick<Service, 'finalCost' | 'spareparts'>): number {
  return service.finalCost - sparepartCost(service.spareparts);
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
