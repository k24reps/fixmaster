import { useMemo, useState } from 'react';
import { Modal, Input, Button, Icon } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { fmtRp } from '@/lib/format';
import { toast } from '@/stores/toast';
import type { ServiceSparepart } from '@/data/types';
import styles from './SparepartPickerModal.module.css';

interface SparepartPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Item ids already on the ticket (to mark as added / avoid confusion). */
  existingItemIds: string[];
  /** Called with a fully-formed inventory cost line to append. */
  onPick: (line: ServiceSparepart) => void;
}

/**
 * Picks an inventory item to add to a service as a sparepart cost line.
 * Bench idiom: mono SKU readout, LED stock state, screw-plate rows. Pulls
 * costPrice (HPP) and sellPrice from the item. The qty<=stock check here is a
 * cached-state UX guard; the caller (addSparepartLine) re-reads the item and
 * deducts stock immediately on add (authoritative), so this only builds the line.
 */
export function SparepartPickerModal({
  open,
  onClose,
  existingItemIds,
  onPick,
}: SparepartPickerModalProps) {
  const { data: inventory } = useCollection('inventory');
  const [query, setQuery] = useState('');
  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory
      .filter((i) => !i.deletedAt)
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory, query]);

  const add = (itemId: string) => {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    const qty = Math.max(1, Math.round(Number(qtyById[itemId]) || 1));
    if (qty > item.stock) {
      toast.warning(`Stok ${item.name} hanya ${item.stock}`);
      return;
    }
    const line: ServiceSparepart = {
      itemId: item.id,
      name: item.name,
      qty,
      costPrice: item.costPrice,
      sellPrice: item.sellPrice,
      deducted: false,
      kind: 'inventory',
      defaultWarrantyDays: item.warrantyDays ?? null,
    };
    onPick(line);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Ambil Sparepart dari Inventory" size="lg">
      <div className={styles.body}>
        <Input
          placeholder="Cari nama, SKU, atau kategori…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          iconLeft={<Icon name="magnifying-glass" aria-hidden />}
          autoFocus
        />
        {rows.length === 0 ? (
          <p className={styles.empty}>
            {inventory.length === 0
              ? 'Belum ada item inventory. Tambahkan di menu Inventory dulu.'
              : 'Tidak ada item yang cocok.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {rows.map((item) => {
              const out = item.stock <= 0;
              const added = existingItemIds.includes(item.id);
              return (
                <li key={item.id} className={styles.row} data-out={out}>
                  <span className={[styles.led, out ? styles.ledOut : styles.ledOk].join(' ')} />
                  <div className={styles.info}>
                    <span className={styles.name}>{item.name}</span>
                    <span className={styles.meta}>
                      <span className={styles.sku}>{item.sku || '—'}</span>
                      <span className={styles.dot} />
                      Stok {item.stock}
                      <span className={styles.dot} />
                      HPP {fmtRp(item.costPrice)}
                    </span>
                  </div>
                  <input
                    className={styles.qty}
                    type="number"
                    min={1}
                    max={item.stock}
                    value={qtyById[item.id] ?? '1'}
                    onChange={(e) =>
                      setQtyById((m) => ({ ...m, [item.id]: e.target.value }))
                    }
                    disabled={out}
                    aria-label={`Qty ${item.name}`}
                  />
                  <Button
                    size="sm"
                    variant={added ? 'secondary' : 'primary'}
                    onClick={() => add(item.id)}
                    disabled={out}
                    iconLeft={<Icon name="plus" aria-hidden />}
                  >
                    {added ? 'Tambah lagi' : 'Tambah'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
