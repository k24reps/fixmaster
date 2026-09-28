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
import { useT } from '@/i18n';
import { interpolate } from '@/lib/business/notify';

interface InventoryModalProps {
  open: boolean;
  onClose: () => void;
  editing: InventoryItem | null;
  categories: string[];
}

export function InventoryModal({ open, onClose, editing, categories }: InventoryModalProps) {
  const t = useT();
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
    if (!name.trim()) return setError(t('inventory.namaBarangWajibDiisi'));
    if (stockNum < 0) return setError(t('inventory.stokTidakBolehNegatif'));

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
        throw new Error(interpolate(t('inventory.negativeStock'), { stock: String(currentStock), delta: String(stockDelta) }));
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
      toast.success(editing ? t('inventory.updated') : t('inventory.added'));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('inventory.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('inventory.editTitle') : t('inventory.newTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('inventory.batal')}
          </Button>
          <Button onClick={save} loading={busy}>
            {t('inventory.simpan')}
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        <Input label={t('inventory.namaSparepartProduk')} value={name} autoCapWords onChange={(e) => setName(e.target.value)} autoFocus />
        <Input
          label={t('inventory.kategori')}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list="inv-categories"
          placeholder={t('inventory.contohRamLcdBaterai')}
        />
        <datalist id="inv-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {outlets.length > 1 && (
          <Select
            label={t('inventory.cabangPemilikStok')}
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            options={[
              { value: '', label: 'Semua cabang (stok bersama)' },
              ...outlets.map((o) => ({ value: o.id, label: o.name })),
            ]}
            hint={t('inventory.dipilihSalahSatuCabang')}
          />
        )}
        <FormRow>
          <Input
            label={t('inventory.stok')}
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            hint={editing ? t('inventory.deltaHint') : undefined}
          />
          <Input
            label={t('inventory.stokMinimum')}
            type="number"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            hint={t('inventory.untukPeringatanStokMenipis')}
          />
        </FormRow>
        {editing && stockDelta !== 0 && (
          <Input
            label={interpolate(t('inventory.deltaReason'), { delta: `${stockDelta > 0 ? '+' : ''}${stockDelta}` })}
            value={stockReason}
            onChange={(e) => setStockReason(e.target.value)}
            placeholder={t('inventory.contohHasilStokOpname')}
          />
        )}
        <FormRow>
          <Input label={t('inventory.hargaModalHpp')} value={costPrice} onChange={(e) => setCostPrice(fmtRpInput(e.target.value))} placeholder="60.000" />
          <Input label={t('inventory.hargaJual')} value={sellPrice} onChange={(e) => setSellPrice(fmtRpInput(e.target.value))} placeholder="100.000" />
        </FormRow>
        <Input
          label={t('inventory.garansiBawaanHari')}
          type="number"
          inputMode="numeric"
          min={0}
          value={warrantyDays}
          onChange={(e) => setWarrantyDays(e.target.value)}
          placeholder={t('inventory.kosongkanGaransiPartToko')}
          hint={t('inventory.isianAwalGaransiSaat')}
        />
      </FormFields>
    </Modal>
  );
}
