import { useState } from 'react';
import { Modal, Input, Button, Select, FormFields, FormRow, FormError, Icon } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useFormFault } from '@/hooks/useFormFault';
import { repository } from '@/data';
import { useCollection } from '@/hooks/useCollection';
import { adjustInventoryStock, purchaseInventoryStock } from '@/data/supabase-client';
import { newId } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { averageCost } from '@/lib/business/purchase';
import { applyBalance, walletsForOutlet } from '@/lib/business/finance';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import type { InventoryItem } from '@/data/types';
import { useT } from '@/i18n';
import { interpolate } from '@/lib/business/notify';
import styles from './InventoryModal.module.css';

interface InventoryModalProps {
  open: boolean;
  onClose: () => void;
  editing: InventoryItem | null;
  categories: string[];
  /** Dibuka dari tombol "+ Stok" di kartu: fokus langsung ke kolom stok. */
  restock?: boolean;
  /** Tombol Hapus di footer (mode ubah). Dulu ikon tong sampah di tiap baris. */
  canDelete?: boolean;
}

export function InventoryModal({ open, onClose, editing, categories, restock = false, canDelete = false }: InventoryModalProps) {
  const t = useT();
  // Peringatan "masih dipakai di N servis aktif". Cloud menghitungnya di server
  // saat Hapus diketuk; adapter lokal memakai daftar di memori.
  const serverCount = !!repository.countActiveServicesUsingItem;
  const { data: services } = useCollection('services', { enabled: open && canDelete && !serverCount });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const { data: outlets } = useCollection('outlets');
  const { data: allWallets } = useCollection('wallets');
  const [name, setName] = useState('');
  const [outletId, setOutletId] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [warrantyDays, setWarrantyDays] = useState('');
  const [stockReason, setStockReason] = useState('');
  // Stok yang bertambah harus dijawab asalnya: dibeli sekarang (stok + modal
  // rata-rata + kas sekaligus) atau koreksi/stok yang sudah ada. Dulu hanya
  // koreksi — pembelian lalu dicatat ulang di Keuangan, sering lupa atau dobel.
  const [inSource, setInSource] = useState<'buy' | 'adjust' | null>(null);
  const [unitCost, setUnitCost] = useState('');
  const [payWalletId, setPayWalletId] = useState('');
  const { error, setError, fail, invalid } = useFormFault<'name' | 'stock' | 'unitCost' | 'outlet'>();
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
    setInSource(null);
    setUnitCost(editing?.costPrice ? fmtRpInput(String(editing.costPrice)) : '');
    setPayWalletId('');
    setError('');
  });

  // Stock/minStock are integer counts (inventoryItemSchema requires int); this
  // modal writes straight via repository.put, so round here — a type=number
  // input otherwise lets "2.5" through and corrupts the count.
  const stockNum = Math.round(Number(stock) || 0);
  const stockDelta = editing ? stockNum - editing.stock : 0;
  const added = editing ? stockDelta : stockNum;
  const buying = added > 0 && inSource === 'buy';
  const unit = parseRpInput(unitCost);
  // Wallet cabang pemilik stok (atau cabang aktif) + wallet bersama (0095).
  const payOutlet = outletId || resolveCreateOutlet(outlets);
  const wallets = walletsForOutlet(allWallets, payOutlet);
  const defaultWallet = (wallets.find((w) => w.isCash) ?? wallets[0])?.id ?? '';
  const walletPick = payWalletId === '' ? defaultWallet : payWalletId === 'none' ? '' : payWalletId;
  const previewCost = averageCost(editing?.stock ?? 0, editing?.costPrice ?? 0, added, unit);

  const save = async () => {
    if (!name.trim()) return fail('name', t('inventory.namaBarangWajibDiisi'));
    if (stockNum < 0) return fail('stock', t('inventory.stokTidakBolehNegatif'));
    if (added > 0 && !inSource) return setError(t('inventory.inSourceRequired'));
    if (buying && unit <= 0) return fail('unitCost', t('inventory.unitCostRequired'));
    if (buying && walletPick && !outletId && mustPickOutlet(outlets.length)) {
      return fail('outlet', t('inventory.pickOutletFirst'));
    }

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
        // Pembelian: stok & modal diterapkan RPC (cloud) atau di bawah (lokal).
        stock: buying ? currentStock : editing ? (cloud ? currentStock : currentStock + stockDelta) : stockNum,
        minStock: Math.max(0, Math.round(Number(minStock) || 0)),
        costPrice: buying ? (editing ? (fresh?.costPrice ?? editing.costPrice) : unit) : parseRpInput(costPrice),
        sellPrice: parseRpInput(sellPrice),
        supplierId: editing?.supplierId ?? null,
        warrantyDays: warrantyDays.trim() === '' ? null : Math.max(0, Math.round(Number(warrantyDays) || 0)),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      };
      await repository.put('inventory', record);
      let finalStock = record.stock;
      if (buying) {
        const txOutlet = record.outletId ?? payOutlet;
        if (cloud) {
          finalStock = await purchaseInventoryStock({
            orgId,
            itemId: record.id,
            qty: added,
            unitCost: unit,
            outletId: txOutlet,
            walletId: walletPick || null,
          });
        } else {
          finalStock = currentStock + added;
          await repository.put('inventory', {
            ...record,
            stock: finalStock,
            costPrice: averageCost(currentStock, record.costPrice, added, unit),
          });
          const wallet = allWallets.find((w) => w.id === walletPick);
          if (wallet) {
            await repository.put('expenses', {
              id: newId(),
              orgId,
              outletId: txOutlet,
              date: localDateStr(),
              category: 'Sparepart',
              amount: added * unit,
              walletId: wallet.id,
              description: `Pembelian stok ${record.name} ×${added}`,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            });
            await repository.put('wallets', applyBalance(wallet, -added * unit));
          }
        }
      } else if (editing && stockDelta !== 0 && cloud) {
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
          ...(buying ? { purchased: added, unitCost: unit, paid: walletPick ? added * unit : 0 } : {}),
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

  // Peringatan ini SARAN: dialog konfirmasi tetap dibuka apa pun hasilnya,
  // termasuk bila penghitungan gagal.
  const requestDelete = async () => {
    if (!editing) return;
    let usedIn: number;
    try {
      usedIn = repository.countActiveServicesUsingItem
        ? await repository.countActiveServicesUsingItem(editing.id)
        : services.filter(
            (s) => !['lunas', 'batal'].includes(s.status) && s.spareparts.some((sp) => sp.itemId === editing.id),
          ).length;
    } catch {
      usedIn = 0;
    }
    if (usedIn > 0) {
      toast.warning(interpolate(t('inventory.usedInServices'), { name: editing.name, n: String(usedIn) }));
    }
    setConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    if (!editing) return;
    try {
      await repository.remove('inventory', editing.id);
      toast.success(t('inventory.sparepartDihapus'));
      logActivity({
        action: 'inventory.delete',
        entityType: 'inventory',
        entityId: editing.id,
        entityLabel: editing.name,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('inventory.deleteFailed'));
    } finally {
      setConfirmingDelete(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t(restock ? 'inventory.restockTitle' : 'inventory.editTitle') : t('inventory.newTitle')}
      footer={
        <>
          {editing && canDelete && (
            <Button
              variant="ghost"
              className={styles.deleteBtn}
              iconLeft={<Icon name="trash" aria-hidden />}
              onClick={requestDelete}
              disabled={busy}
            >
              {t('inventory.hapus')}
            </Button>
          )}
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
        <Input invalid={invalid('name')} label={t('inventory.namaSparepartProduk')} value={name} autoCapWords onChange={(e) => setName(e.target.value)} autoFocus={!restock} />
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
            invalid={invalid('outlet')}
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
            invalid={invalid('stock')}
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            hint={editing ? t('inventory.deltaHint') : undefined}
            autoFocus={restock}
            // Angka lama terpilih: ketik stok baru langsung menimpanya.
            onFocus={restock ? (e) => e.currentTarget.select() : undefined}
          />
          <Input
            label={t('inventory.stokMinimum')}
            type="number"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            hint={t('inventory.untukPeringatanStokMenipis')}
          />
        </FormRow>
        {added > 0 && (
          <fieldset className={styles.stockIn}>
            <legend>{interpolate(t('inventory.inTitle'), { qty: String(added) })}</legend>
            <div className={styles.inChoices}>
              {(['buy', 'adjust'] as const).map((k) => (
                <label key={k} className={[styles.inChoice, inSource === k ? styles.inChoiceOn : ''].join(' ')}>
                  <input
                    type="radio"
                    name="inventory-in-source"
                    checked={inSource === k}
                    onChange={() => {
                      setInSource(k);
                      setError('');
                    }}
                  />
                  <span>
                    <strong>{t(k === 'buy' ? 'inventory.inBuy' : editing ? 'inventory.inAdjust' : 'inventory.inExisting')}</strong>
                    <small>{t(k === 'buy' ? 'inventory.inBuyHint' : editing ? 'inventory.inAdjustHint' : 'inventory.inExistingHint')}</small>
                  </span>
                </label>
              ))}
            </div>
            {buying && (
              <>
                <FormRow>
                  <Input
                    label={t('inventory.unitCost')}
                    invalid={invalid('unitCost')}
                    inputMode="numeric"
                    value={unitCost}
                    onChange={(e) => setUnitCost(fmtRpInput(e.target.value))}
                    placeholder="60.000"
                    hint={t('inventory.unitCostHint')}
                  />
                  <Select
                    label={t('inventory.payFrom')}
                    value={walletPick || 'none'}
                    onChange={(e) => setPayWalletId(e.target.value)}
                    options={[
                      ...wallets.map((w) => ({ value: w.id, label: `${w.name} · ${fmtRp(w.balance)}` })),
                      { value: 'none', label: t('inventory.payNone') },
                    ]}
                  />
                </FormRow>
                <p className={styles.inReadout}>
                  {interpolate(t('inventory.inReadout'), {
                    stock: String((editing?.stock ?? 0) + added),
                    cost: fmtRp(previewCost),
                  })}
                  {walletPick
                    ? ` · ${interpolate(t('inventory.inCash'), { amount: fmtRp(added * unit) })}`
                    : ` · ${t('inventory.inNoCash')}`}
                </p>
              </>
            )}
            {editing && inSource === 'adjust' && (
              <Input
                label={interpolate(t('inventory.deltaReason'), { delta: `+${stockDelta}` })}
                value={stockReason}
                onChange={(e) => setStockReason(e.target.value)}
                placeholder={t('inventory.contohHasilStokOpname')}
              />
            )}
          </fieldset>
        )}
        {editing && stockDelta < 0 && (
          <Input
            label={interpolate(t('inventory.deltaReason'), { delta: String(stockDelta) })}
            value={stockReason}
            onChange={(e) => setStockReason(e.target.value)}
            placeholder={t('inventory.contohHasilStokOpname')}
          />
        )}
        <FormRow>
          <Input
            label={t('inventory.hargaModalHpp')}
            value={buying ? fmtRpInput(String(Math.round(previewCost))) : costPrice}
            onChange={(e) => setCostPrice(fmtRpInput(e.target.value))}
            placeholder="60.000"
            disabled={buying}
            hint={buying ? t('inventory.costFromPurchase') : undefined}
          />
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
    <ConfirmDialog
      open={confirmingDelete}
      title={t('inventory.hapusSparepart')}
      message={interpolate(t('inventory.deleteConfirm'), { name: editing?.name ?? '' })}
      confirmLabel={t('inventory.hapus')}
      danger
      onConfirm={confirmDelete}
      onCancel={() => setConfirmingDelete(false)}
    />
    </>
  );
}
