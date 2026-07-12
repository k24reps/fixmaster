import { useState } from 'react';
import { Modal, Input, Select, Button, Icon } from '@/components/ui';
import { repository } from '@/data';
import { newId, nextDocNumber } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { poTotal } from '@/lib/business/purchase';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  Supplier,
  InventoryItem,
} from '@/data/types';
import styles from './PurchaseOrderModal.module.css';

interface PurchaseOrderModalProps {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
}

export function PurchaseOrderModal({
  open,
  onClose,
  suppliers,
  inventory,
  purchaseOrders,
}: PurchaseOrderModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setSupplierId(suppliers[0]?.id ?? '');
    setLines([]);
    setNote('');
    setError('');
  }
  if (!open && lastOpen) setLastOpen(false);

  const addLine = (itemId: string) => {
    const item = inventory.find((i) => i.id === itemId);
    if (!item || lines.some((l) => l.itemId === itemId)) return;
    setLines((prev) => [
      ...prev,
      { itemId: item.id, name: item.name, qty: 1, costPrice: item.costPrice, receivedQty: 0 },
    ]);
  };

  const updateLine = (itemId: string, patch: Partial<PurchaseOrderLine>) => {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
  };

  const removeLine = (itemId: string) => {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  };

  const save = async () => {
    if (!supplierId) return setError('Pilih supplier');
    if (lines.length === 0) return setError('Tambahkan minimal 1 barang');
    if (lines.some((l) => l.qty <= 0)) return setError('Qty setiap barang harus lebih dari 0');

    setBusy(true);
    const now = new Date().toISOString();
    const poNumber = nextDocNumber('PO', purchaseOrders.map((p) => p.poNumber));
    const record: PurchaseOrder = {
      id: newId(),
      orgId,
      outletId: null,
      poNumber,
      supplierId,
      status: 'ordered',
      lines,
      orderedAt: localDateStr(),
      receivedAt: null,
      note: note.trim(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    try {
      await repository.put('purchaseOrders', record);
      toast.success(`PO ${poNumber} dibuat`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat PO');
    } finally {
      setBusy(false);
    }
  };

  const availableItems = inventory.filter((i) => !lines.some((l) => l.itemId === i.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Purchase Order Baru"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Buat PO
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {error && <p className={styles.error}>{error}</p>}
        <Select
          label="Supplier"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          placeholder={suppliers.length ? undefined : 'Belum ada supplier'}
        />

        <div>
          <label className={styles.label}>Tambah Barang</label>
          <Select
            value=""
            onChange={(e) => e.target.value && addLine(e.target.value)}
            options={availableItems.map((i) => ({ value: i.id, label: `${i.name} (stok ${i.stock})` }))}
            placeholder="Pilih sparepart…"
          />
        </div>

        {lines.length > 0 && (
          <div className={styles.lines}>
            {lines.map((l) => (
              <div key={l.itemId} className={styles.lineRow}>
                <span className={styles.lineName}>{l.name}</span>
                <Input
                  type="number"
                  value={String(l.qty)}
                  onChange={(e) => updateLine(l.itemId, { qty: Math.max(0, Number(e.target.value)) })}
                  className={styles.qtyInput}
                />
                <Input
                  value={fmtRpInput(String(l.costPrice))}
                  onChange={(e) => updateLine(l.itemId, { costPrice: parseRpInput(e.target.value) })}
                  className={styles.costInput}
                />
                <span className={styles.lineTotal}>{fmtRp(l.qty * l.costPrice)}</span>
                <button className={styles.removeBtn} onClick={() => removeLine(l.itemId)} aria-label="Hapus">
                  <Icon name="trash" aria-hidden />
                </button>
              </div>
            ))}
            <div className={styles.totalRow}>
              <span>Total PO</span>
              <strong>{fmtRp(poTotal(lines))}</strong>
            </div>
          </div>
        )}

        <Input label="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
