import { useState } from 'react';
import { Modal, Input, Button, FormFields, FormRow, FormError } from '@/components/ui';
import { repository } from '@/data';
import { newId } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
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
  const [warrantyDays, setWarrantyDays] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Barang baru selalu mulai kosong; mode edit mencerminkan recordnya.
  useResetOnOpen(open, editing?.id ?? 'new', () => {
    setName(editing?.name ?? '');
    setCategory(editing?.category ?? '');
    setStock(editing ? String(editing.stock) : '');
    setMinStock(editing ? String(editing.minStock) : '');
    setCostPrice(editing?.costPrice ? fmtRpInput(String(editing.costPrice)) : '');
    setSellPrice(editing?.sellPrice ? fmtRpInput(String(editing.sellPrice)) : '');
    setWarrantyDays(editing?.warrantyDays != null ? String(editing.warrantyDays) : '');
    setError('');
  });

  const save = async () => {
    if (!name.trim()) return setError('Nama barang wajib diisi');
    // Stock/minStock are integer counts (inventoryItemSchema requires int); this
    // modal writes straight via repository.put, so round here — a type=number
    // input otherwise lets "2.5" through and corrupts the count.
    const stockNum = Math.round(Number(stock) || 0);
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
      minStock: Math.max(0, Math.round(Number(minStock) || 0)),
      costPrice: parseRpInput(costPrice),
      sellPrice: parseRpInput(sellPrice),
      supplierId: editing?.supplierId ?? null,
      warrantyDays: warrantyDays.trim() === '' ? null : Math.max(0, Math.round(Number(warrantyDays) || 0)),
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
        <Input
          label="Garansi Bawaan (hari)"
          type="number"
          inputMode="numeric"
          min={0}
          value={warrantyDays}
          onChange={(e) => setWarrantyDays(e.target.value)}
          placeholder="Kosongkan = garansi part toko"
          hint="Isian awal garansi saat part ini dipasang di tiket; tetap bisa diubah saat Selesai"
        />
      </FormFields>
    </Modal>
  );
}
