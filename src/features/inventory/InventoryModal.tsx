import { useState } from 'react';
import { Modal, Input, Button, Select, FormFields, FormRow, FormError } from '@/components/ui';
import { repository } from '@/data';
import { useCollection } from '@/hooks/useCollection';
import { adjustInventoryStock } from '@/data/supabase-client';
import { newId } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
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
  const { data: outlets } = useCollection('outlets');
  const [name, setName] = useState('');
  const [outletId, setOutletId] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [warrantyDays, setWarrantyDays] = useState('');
  const [stockReason, setStockReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Barang baru selalu mulai kosong; mode edit mencerminkan recordnya.
  useResetOnOpen(open, editing?.id ?? 'new', () => {
    setName(editing?.name ?? '');
    setOutletId(editing?.outletId ?? '');
    setCategory(editing?.category ?? '');
    setStock(editing ? String(editing.stock) : '');
    setMinStock(editing ? String(editing.minStock) : '');
    setCostPrice(editing?.costPrice ? fmtRpInput(String(editing.costPrice)) : '');
    setSellPrice(editing?.sellPrice ? fmtRpInput(String(editing.sellPrice)) : '');
    setWarrantyDays(editing?.warrantyDays != null ? String(editing.warrantyDays) : '');
    setStockReason('');
    setError('');
  });

  // Stock/minStock are integer counts (inventoryItemSchema requires int); this
  // modal writes straight via repository.put, so round here — a type=number
  // input otherwise lets "2.5" through and corrupts the count.
  const stockNum = Math.round(Number(stock) || 0);
  const stockDelta = editing ? stockNum - editing.stock : 0;

  const save = async () => {
    if (!name.trim()) return setError('Nama barang wajib diisi');
    if (stockNum < 0) return setError('Stok tidak boleh negatif');

    setBusy(true);
    const now = new Date().toISOString();
    try {
      // Edit: stok TIDAK ditulis ulang dari angka saat form dibuka — penjualan di
      // sela-sela akan tertimpa. Yang diterapkan hanya selisih yang diketik, di
      // atas stok terkini (cloud: RPC atomik, 0069).
      const cloud = isCloudMode();
      const fresh = editing ? await repository.get('inventory', editing.id) : null;
      const currentStock = fresh?.stock ?? editing?.stock ?? 0;
      if (editing && currentStock + stockDelta < 0) {
        throw new Error(`Stok terkini ${currentStock}; perubahan ${stockDelta} membuatnya negatif`);
      }
      const record: InventoryItem = {
        id: editing?.id ?? newId(),
        orgId,
        // Kosong = stok dipakai bersama semua cabang (bawaan). Diisi = stok milik
        // cabang itu: hanya terlihat & terjual di sana (0070).
        outletId: outletId || null,
        name: name.trim(),
        category: category.trim(),
        sku: editing?.sku ?? '',
        stock: editing ? (cloud ? currentStock : currentStock + stockDelta) : stockNum,
        minStock: Math.max(0, Math.round(Number(minStock) || 0)),
        costPrice: parseRpInput(costPrice),
        sellPrice: parseRpInput(sellPrice),
        supplierId: editing?.supplierId ?? null,
        warrantyDays: warrantyDays.trim() === '' ? null : Math.max(0, Math.round(Number(warrantyDays) || 0)),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      await repository.put('inventory', record);
      let finalStock = record.stock;
      if (editing && stockDelta !== 0 && cloud) {
        finalStock = await adjustInventoryStock({ orgId, itemId: editing.id, delta: stockDelta });
      }
      logActivity({
        action: editing ? 'inventory.update' : 'inventory.create',
        entityType: 'inventory',
        entityId: record.id,
        entityLabel: record.name,
        meta: {
          stock: finalStock,
          sellPrice: record.sellPrice,
          ...(stockDelta !== 0 ? { stockDelta, reason: stockReason.trim() } : {}),
        },
      });
      toast.success(editing ? 'Sparepart diperbarui' : 'Sparepart ditambahkan');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan sparepart');
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
        {outlets.length > 1 && (
          <Select
            label="Cabang Pemilik Stok"
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            options={[
              { value: '', label: 'Semua cabang (stok bersama)' },
              ...outlets.map((o) => ({ value: o.id, label: o.name })),
            ]}
            hint="Dipilih salah satu cabang: barang ini hanya muncul & terjual di cabang itu"
          />
        )}
        <FormRow>
          <Input
            label="Stok"
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            hint={editing ? 'Perubahan diterapkan sebagai selisih dari stok terkini' : undefined}
          />
          <Input
            label="Stok Minimum"
            type="number"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            hint="Untuk peringatan stok menipis"
          />
        </FormRow>
        {editing && stockDelta !== 0 && (
          <Input
            label={`Alasan perubahan stok (${stockDelta > 0 ? '+' : ''}${stockDelta})`}
            value={stockReason}
            onChange={(e) => setStockReason(e.target.value)}
            placeholder="Contoh: hasil stok opname, barang rusak"
          />
        )}
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
