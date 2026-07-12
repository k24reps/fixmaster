import { useState } from 'react';
import { Modal, Input, Button, Badge, Select } from '@/components/ui';
import { repository, isSupabaseConfigured } from '@/data';
import { receiveGoodsWithFinance } from '@/data/supabase-client';
import { receiveGoods, receivedValue, PO_STATUS_LABELS } from '@/lib/business/purchase';
import { applyBalance } from '@/lib/business/finance';
import { newId } from '@/lib/id';
import { localDateStr } from '@/lib/time';
import { fmtRp } from '@/lib/format';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import { useCollection } from '@/hooks/useCollection';
import type { PurchaseOrder, Supplier } from '@/data/types';
import styles from './ReceiveModal.module.css';

interface ReceiveModalProps {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrder | null;
  supplier: Supplier | null;
}

export function ReceiveModal({ open, onClose, po, supplier }: ReceiveModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const { data: wallets } = useCollection('wallets');
  const { data: outlets } = useCollection('outlets');
  const [receipts, setReceipts] = useState<Record<string, number>>({});
  // Q1=(c): cash payment is optional. Default ON + primary wallet (sortOrder).
  const [payFromWallet, setPayFromWallet] = useState(true);
  const [walletId, setWalletId] = useState('');
  const [busy, setBusy] = useState(false);

  const sortedWallets = [...wallets].sort((a, b) => a.sortOrder - b.sortOrder);

  const [lastKey, setLastKey] = useState<string | null>(null);
  if (open && po && lastKey !== po.id) {
    setLastKey(po.id);
    // Default each line to its remaining quantity.
    const init: Record<string, number> = {};
    for (const l of po.lines) init[l.itemId] = Math.max(0, l.qty - l.receivedQty);
    setReceipts(init);
    setPayFromWallet(true);
    setWalletId(sortedWallets[0]?.id ?? '');
  }

  if (!po) return null;

  // Value of goods being received in this event (partial-aware).
  const amount = receivedValue(po, receipts);

  const apply = async () => {
    if (payFromWallet && amount > 0 && !walletId) {
      toast.error('Pilih wallet pembayaran');
      return;
    }
    // OQ-C (same guard as PosPage): the stock-purchase expense is stamped to an
    // outlet — a multi-outlet user must pick a branch first, not guess.
    if (mustPickOutlet(outlets.length)) {
      toast.error('Pilih cabang dulu di selektor cabang (sidebar) sebelum menerima barang');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    try {
      const { lines, stockDeltas, status } = receiveGoods(po, receipts);
      if (stockDeltas.length === 0) {
        toast.warning('Tidak ada qty diterima');
        setBusy(false);
        return;
      }
      const txOutletId = resolveCreateOutlet(outlets);
      const payWalletId = payFromWallet && amount > 0 ? walletId : null;

      if (isSupabaseConfigured) {
        // Cloud: one atomic RPC (stock + PO + expense + optional wallet debit).
        await receiveGoodsWithFinance({
          orgId,
          poId: po.id,
          lines,
          deltas: stockDeltas,
          status,
          outletId: txOutletId,
          walletId: payWalletId,
          amount,
        });
      } else {
        // Local/dev: sequential writes (no transaction available offline).
        const inventory = await repository.list('inventory');
        const updates = inventory
          .filter((i) => stockDeltas.some((d) => d.itemId === i.id))
          .map((i) => {
            const d = stockDeltas.find((x) => x.itemId === i.id)!;
            return { ...i, stock: i.stock + d.delta };
          });
        if (updates.length) await repository.putMany('inventory', updates);

        await repository.put('purchaseOrders', {
          ...po,
          lines,
          status,
          receivedAt: status === 'received' ? localDateStr() : po.receivedAt,
          updatedAt: now,
        });

        if (amount > 0) {
          await repository.put('expenses', {
            id: newId(),
            orgId,
            outletId: txOutletId,
            date: localDateStr(),
            category: 'Sparepart',
            amount,
            walletId: payWalletId ?? '',
            description: `Pembelian stok PO ${po.poNumber}`,
            poId: po.id,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          if (payWalletId) {
            const w = sortedWallets.find((x) => x.id === payWalletId);
            if (w) await repository.put('wallets', applyBalance(w, -amount));
          }
        }
      }

      logActivity({
        action: 'expense.create',
        entityType: 'expense',
        entityLabel: `Stok PO ${po.poNumber}`,
        meta: { amount, poId: po.id, status },
      });
      toast.success(
        amount > 0
          ? 'Barang diterima, stok & pengeluaran tercatat'
          : 'Barang diterima & stok diperbarui',
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menerima barang');
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

        {/* Finance: value received now + optional cash payment from a wallet. */}
        <div className={styles.finance}>
          <div className={styles.valueRow}>
            <span>Nilai diterima</span>
            <strong className={styles.value}>{fmtRp(amount)}</strong>
          </div>
          <label className={styles.payToggle}>
            <input
              type="checkbox"
              checked={payFromWallet}
              onChange={(e) => setPayFromWallet(e.target.checked)}
            />
            <span>Potong dari wallet (bayar tunai)</span>
          </label>
          {payFromWallet && (
            <Select
              label="Wallet pembayaran"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              options={sortedWallets.map((w) => ({
                value: w.id,
                label: `${w.name} · ${fmtRp(w.balance)}`,
              }))}
            />
          )}
          {!payFromWallet && (
            <p className={styles.tempoNote}>
              Mode tempo/hutang: pengeluaran dicatat, saldo wallet tak berubah.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
