/**
 * Pure Purchase Order business logic: line totals, receiving math, and
 * status derivation. No DOM/repository deps → fully unit-testable.
 * Suppliers + PO is a NEW module not present in FixNova.
 */
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '@/data/types';

/** Total value of a PO (sum of qty × cost across lines). */
export function poTotal(lines: PurchaseOrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty * l.costPrice, 0);
}

/** Total quantity ordered across all lines. */
export function poOrderedQty(lines: PurchaseOrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/** Total quantity already received across all lines. */
export function poReceivedQty(lines: PurchaseOrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.receivedQty, 0);
}

/**
 * Derive PO status from line receipts:
 * - all received → 'received'
 * - some received → 'partial'
 * - none received → keep the current non-terminal status
 */
export function deriveStatus(
  lines: PurchaseOrderLine[],
  current: PurchaseOrderStatus,
): PurchaseOrderStatus {
  if (current === 'cancelled' || current === 'draft') return current;
  const ordered = poOrderedQty(lines);
  const received = poReceivedQty(lines);
  if (ordered > 0 && received >= ordered) return 'received';
  if (received > 0) return 'partial';
  return current === 'ordered' ? 'ordered' : current;
}

export interface ReceiveResult {
  lines: PurchaseOrderLine[];
  /** Stock increments to apply per item for this receiving event. */
  stockDeltas: { itemId: string; delta: number }[];
  status: PurchaseOrderStatus;
}

/**
 * Receive quantities against a PO. `receipts` maps itemId → qty received now.
 * Clamps each line so receivedQty never exceeds the ordered qty. Returns the
 * updated lines, the stock deltas to apply, and the derived status.
 */
export function receiveGoods(
  po: PurchaseOrder,
  receipts: Record<string, number>,
): ReceiveResult {
  const stockDeltas: { itemId: string; delta: number }[] = [];
  const lines = po.lines.map((line) => {
    const incoming = Math.max(0, receipts[line.itemId] ?? 0);
    if (incoming === 0) return line;
    const remaining = Math.max(0, line.qty - line.receivedQty);
    const applied = Math.min(incoming, remaining);
    if (applied > 0) stockDeltas.push({ itemId: line.itemId, delta: applied });
    return { ...line, receivedQty: line.receivedQty + applied };
  });
  return { lines, stockDeltas, status: deriveStatus(lines, po.status) };
}

/**
 * Rupiah value of the goods received in THIS event (Σ qty diterima sekarang ×
 * costPrice per baris). Clamps each line to its remaining qty so over-entry
 * never inflates the expense. Used to record a partial-aware Expense.
 */
export function receivedValue(
  po: PurchaseOrder,
  receipts: Record<string, number>,
): number {
  return po.lines.reduce((sum, line) => {
    const incoming = Math.max(0, receipts[line.itemId] ?? 0);
    const remaining = Math.max(0, line.qty - line.receivedQty);
    const applied = Math.min(incoming, remaining);
    return sum + applied * line.costPrice;
  }, 0);
}

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  ordered: 'Dipesan',
  partial: 'Sebagian Diterima',
  received: 'Diterima Lengkap',
  cancelled: 'Dibatalkan',
};

export const PO_STATUS_TONE: Record<PurchaseOrderStatus, string> = {
  draft: 'neutral',
  ordered: 'info',
  partial: 'warning',
  received: 'success',
  cancelled: 'danger',
};
