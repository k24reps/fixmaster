import { useState } from 'react';
import { Modal, Input, Button, Badge } from '@/components/ui';
import { repository } from '@/data';
import { receiveGoods, PO_STATUS_LABELS } from '@/lib/business/purchase';
import { localDateStr } from '@/lib/time';
import { toast } from '@/stores/toast';
import type { PurchaseOrder, Supplier } from '@/data/types';
import styles from './ReceiveModal.module.css';

interface ReceiveModalProps {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrder | null;
  supplier: Supplier | null;
}

export function ReceiveModal({ open, onClose, po, supplier }: ReceiveModalProps) {
  const [receipts, setReceipts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const [lastKey, setLastKey] = useState<string | null>(null);
  if (open && po && lastKey !== po.id) {
    setLastKey(po.id);
    // Default each line to its remaining quantity.
    const init: Record<string, number> = {};
    for (const l of po.lines) init[l.itemId] = Math.max(0, l.qty - l.receivedQty);
    setReceipts(init);
  }

  if (!po) return null;

  const apply = async () => {
    setBusy(true);
    const now = new Date().toISOString();
    try {
      const { lines, stockDeltas, status } = receiveGoods(po, receipts);

      // Apply stock increments to inventory.
      if (stockDeltas.length) {
        const inventory = await repository.list('inventory');
        const updates = inventory
          .filter((i) => stockDeltas.some((d) => d.itemId === i.id))
          .map((i) => {
            const d = stockDeltas.find((x) => x.itemId === i.id)!;
            return { ...i, stock: i.stock + d.delta };
          });
        if (updates.length) await repository.putMany('inventory', updates);
      }

      await repository.put('purchaseOrders', {
        ...po,
        lines,
        status,
        receivedAt: status === 'received' ? localDateStr() : po.receivedAt,
        updatedAt: now,
      });
      toast.success('Barang diterima & stok diperbarui');
      onClose();
    } catch {
      toast.error('Gagal menerima barang');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Terima Barang — ${po.poNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={apply} loading={busy}>
            Terima & Update Stok
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.meta}>
          <span>{supplier?.name ?? 'Supplier'}</span>
          <Badge tone="info">{PO_STATUS_LABELS[po.status]}</Badge>
        </div>
        <div className={styles.lines}>
          <div className={[styles.lineRow, styles.head].join(' ')}>
            <span>Barang</span>
            <span className={styles.center}>Dipesan</span>
            <span className={styles.center}>Sudah</span>
            <span className={styles.center}>Terima</span>
          </div>
          {po.lines.map((l) => {
            const remaining = Math.max(0, l.qty - l.receivedQty);
            return (
              <div key={l.itemId} className={styles.lineRow}>
                <span className={styles.name}>{l.name}</span>
                <span className={styles.center}>{l.qty}</span>
                <span className={styles.center}>{l.receivedQty}</span>
                <Input
                  type="number"
                  className={styles.input}
                  value={String(receipts[l.itemId] ?? 0)}
                  onChange={(e) =>
                    setReceipts((prev) => ({
                      ...prev,
                      [l.itemId]: Math.max(0, Math.min(Number(e.target.value), remaining)),
                    }))
                  }
                  disabled={remaining === 0}
                />
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
