import { useState } from 'react';
import { Modal, Input, Select, Button, Icon } from '@/components/ui';
import { repository } from '@/data';
import { useCollection } from '@/hooks/useCollection';
import { isCloudMode } from '@/stores/demo';
import { createPurchaseOrder, updatePurchaseOrder } from '@/data/supabase-client';
import { newId, nextDocNumber } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { poTotal } from '@/lib/business/purchase';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
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
  /** PO yang sedang diperbaiki (hanya boleh selama belum ada barang diterima). */
  editing?: PurchaseOrder | null;
}

export function PurchaseOrderModal({
  open,
  onClose,
  suppliers,
  inventory,
  purchaseOrders,
  editing = null,
}: PurchaseOrderModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const { data: outlets } = useCollection('outlets');
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setSupplierId(editing?.supplierId ?? suppliers[0]?.id ?? '');
    setLines(editing ? editing.lines.map((l) => ({ ...l })) : []);
    setNote(editing?.note ?? '');
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
    // Qty bilangan bulat: kolom stok integer, jadi "2,5 pcs" dulu dibulatkan
    // diam-diam saat barang diterima (server menolaknya sejak 0071).
    if (lines.some((l) => l.qty <= 0 || !Number.isInteger(l.qty)))
      return setError('Qty setiap barang harus bilangan bulat lebih dari 0');
    // PO dicap ke cabang, sama seperti pengeluaran saat barang diterima.
    if (!editing && mustPickOutlet(outlets.length))
      return setError('Pilih cabang dulu di selektor cabang (sidebar) sebelum membuat PO');

    setBusy(true);
    const now = new Date().toISOString();
    try {
      if (isCloudMode()) {
        // Nomor PO ditetapkan server (0071): dua perangkat tidak lagi bentrok,
        // dan daftar yang terpotong 1000 baris tak lagi mengulang nomor lama.
        if (editing) {
          await updatePurchaseOrder({
            orgId,
            poId: editing.id,
            supplierId,
            lines,
            note: note.trim(),
          });
          toast.success(`PO ${editing.poNumber} diperbarui`);
        } else {
          const { poNumber } = await createPurchaseOrder({
            orgId,
            supplierId,
            lines,
            note: note.trim(),
            outletId: resolveCreateOutlet(outlets),
          });
          toast.success(`PO ${poNumber} dibuat`);
        }
        onClose();
        return;
      }

      const poNumber =
        editing?.poNumber ?? nextDocNumber('PO', purchaseOrders.map((p) => p.poNumber));
      const record: PurchaseOrder = {
        id: editing?.id ?? newId(),
        orgId,
        outletId: editing?.outletId ?? resolveCreateOutlet(outlets),
        poNumber,
        supplierId,
        status: editing?.status ?? 'ordered',
        lines,
        orderedAt: editing?.orderedAt ?? localDateStr(),
        receivedAt: editing?.receivedAt ?? null,
        note: note.trim(),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      await repository.put('purchaseOrders', record);
      toast.success(editing ? `PO ${poNumber} diperbarui` : `PO ${poNumber} dibuat`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan PO');
    } finally {
      setBusy(false);
    }
  };

  const availableItems = inventory.filter((i) => !lines.some((l) => l.itemId === i.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Perbaiki ${editing.poNumber}` : 'Purchase Order Baru'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Simpan Perubahan' : 'Buat PO'}
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
                  onChange={(e) =>
                    updateLine(l.itemId, { qty: Math.max(0, Math.round(Number(e.target.value))) })
                  }
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
