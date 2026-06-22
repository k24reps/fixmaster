import { useState } from 'react';
import { Modal, Input, Button, FormFields, FormRow, FormError } from '@/components/ui';
import { repository } from '@/data';
import { newId } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type { InventoryItem } from '@/data/types';

interface InventoryModalProps {
  open: boolean;
  onClose: () => void;
  editing: InventoryItem | null;
  categories: string[];
}

export function InventoryModal({ open, onClose, editing, categories }: InventoryModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const currentKey = editing?.id ?? 'new';
  if (open && lastKey !== currentKey) {
    setLastKey(currentKey);
    setName(editing?.name ?? '');
    setCategory(editing?.category ?? '');
    setStock(editing ? String(editing.stock) : '');
    setMinStock(editing ? String(editing.minStock) : '');
    setCostPrice(editing?.costPrice ? fmtRpInput(String(editing.costPrice)) : '');
    setSellPrice(editing?.sellPrice ? fmtRpInput(String(editing.sellPrice)) : '');
    setError('');
  }

  const save = async () => {
    if (!name.trim()) return setError('Nama barang wajib diisi');
    const stockNum = Number(stock) || 0;
    if (stockNum < 0) return setError('Stok tidak boleh negatif');

    setBusy(true);
    const now = new Date().toISOString();
    const record: InventoryItem = {
      id: editing?.id ?? newId(),
      orgId,
      outletId: editing?.outletId ?? null,
      name: name.trim(),
      category: category.trim(),
      sku: editing?.sku ?? '',
      stock: stockNum,
      minStock: Number(minStock) || 0,
      costPrice: parseRpInput(costPrice),
      sellPrice: parseRpInput(sellPrice),
      supplierId: editing?.supplierId ?? null,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    try {
      await repository.put('inventory', record);
      logActivity({
        action: editing ? 'inventory.update' : 'inventory.create',
        entityType: 'inventory',
        entityId: record.id,
        entityLabel: record.name,
        meta: { stock: record.stock, sellPrice: record.sellPrice },
      });
      toast.success(editing ? 'Sparepart diperbarui' : 'Sparepart ditambahkan');
      onClose();
    } catch {
      toast.error('Gagal menyimpan sparepart');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Sparepart' : 'Sparepart Baru'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        <Input label="Nama Sparepart / Produk" value={name} autoCapWords onChange={(e) => setName(e.target.value)} autoFocus />
        <Input
          label="Kategori"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list="inv-categories"
          placeholder="Contoh: RAM, LCD, Baterai"
        />
        <datalist id="inv-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <FormRow>
          <Input label="Stok" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          <Input
            label="Stok Minimum"
            type="number"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            hint="Untuk peringatan stok menipis"
          />
        </FormRow>
        <FormRow>
          <Input label="Harga Modal (HPP)" value={costPrice} onChange={(e) => setCostPrice(fmtRpInput(e.target.value))} placeholder="60.000" />
          <Input label="Harga Jual" value={sellPrice} onChange={(e) => setSellPrice(fmtRpInput(e.target.value))} placeholder="100.000" />
        </FormRow>
      </FormFields>
    </Modal>
  );
}
