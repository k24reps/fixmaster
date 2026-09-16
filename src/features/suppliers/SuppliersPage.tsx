import { useMemo, useState } from 'react';
import { Card, Button, Badge, EmptyState, Icon, LoadState, loadPending } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { isCloudMode } from '@/stores/demo';
import { voidPurchaseOrder } from '@/data/supabase-client';
import { fmtRp } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { poTotal, poReceivedQty, PO_STATUS_LABELS, PO_STATUS_TONE } from '@/lib/business/purchase';
import { applyBalance } from '@/lib/business/finance';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import { SupplierModal } from './SupplierModal';
import { PurchaseOrderModal } from './PurchaseOrderModal';
import { ReceiveModal } from './ReceiveModal';
import type { Supplier, PurchaseOrder } from '@/data/types';
import styles from './SuppliersPage.module.css';

export function SuppliersPage() {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const { data: suppliers, ...suppliersLoad } = useCollection('suppliers');
  const { data: purchaseOrders, ...poLoad } = useCollection('purchaseOrders');
  const { data: inventory } = useCollection('inventory');
  const { data: wallets } = useCollection('wallets');
  const { data: outlets } = useCollection('outlets');
  const { data: expenses } = useCollection('expenses');

  const [tab, setTab] = useState<'po' | 'suppliers'>('po');
  const [supplierModal, setSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [poModal, setPoModal] = useState(false);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [deleteSupplier, setDeleteSupplier] = useState<Supplier | null>(null);
  const [voidTarget, setVoidTarget] = useState<PurchaseOrder | null>(null);
  const [voiding, setVoiding] = useState(false);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const sortedPOs = useMemo(
    () => [...purchaseOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [purchaseOrders],
  );

  // Per-supplier purchasing readout: PO count + total spend.
  const vendorStats = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const po of purchaseOrders) {
      const cur = map.get(po.supplierId) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += poTotal(po.lines);
      map.set(po.supplierId, cur);
    }
    return map;
  }, [purchaseOrders]);

  const confirmDeleteSupplier = async () => {
    if (!deleteSupplier) return;
    // Bukan hanya PO aktif: PO yang sudah selesai pun kehilangan nama
    // suppliernya (tampil "—") kalau suppliernya dihapus. Server menolak juga (0072).
    const linkedPo = purchaseOrders.filter((p) => p.supplierId === deleteSupplier.id).length;
    if (linkedPo > 0) {
      toast.error(
        `Supplier punya ${linkedPo} PO — riwayatnya akan kehilangan nama supplier. Perbarui datanya saja.`,
      );
      setDeleteSupplier(null);
      return;
    }
    try {
      await repository.remove('suppliers', deleteSupplier.id);
      toast.success('Supplier dihapus');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus supplier');
    } finally {
      setDeleteSupplier(null);
    }
  };

  // Automatic void: reverse received stock, refund wallets for linked expenses,
  // delete those expenses, and set the PO to 'cancelled'. Atomic via RPC in
  // cloud; sequential reversal in local/dev mode.
  const confirmVoid = async () => {
    if (!voidTarget) return;
    // OQ-C (same guard as PosPage): the refund expense reversal is stamped to
    // an outlet — a multi-outlet user must pick a branch first, not guess.
    if (mustPickOutlet(outlets.length)) {
      toast.error('Pilih cabang dulu di selektor cabang (sidebar) sebelum membatalkan PO');
      return;
    }
    setVoiding(true);
    const now = new Date().toISOString();
    try {
      const txOutletId = resolveCreateOutlet(outlets);
      if (isCloudMode()) {
        await voidPurchaseOrder({ orgId, poId: voidTarget.id, outletId: txOutletId });
      } else {
        // Reverse received stock.
        const stockUpdates = inventory
          .filter((i) => voidTarget.lines.some((l) => l.itemId === i.id && l.receivedQty > 0))
          .map((i) => {
            const l = voidTarget.lines.find((x) => x.itemId === i.id)!;
            return { ...i, stock: i.stock - l.receivedQty, updatedAt: now };
          });
        if (stockUpdates.length) await repository.putMany('inventory', stockUpdates);

        // Refund wallets for linked expenses, then delete those expenses.
        const linked = expenses.filter((e) => e.poId === voidTarget.id);
        for (const exp of linked) {
          if (exp.walletId) {
            const w = wallets.find((x) => x.id === exp.walletId);
            if (w) await repository.put('wallets', applyBalance(w, exp.amount));
          }
          await repository.remove('expenses', exp.id);
        }

        // Reset receivedQty to 0 and cancel.
        await repository.put('purchaseOrders', {
          ...voidTarget,
          lines: voidTarget.lines.map((l) => ({ ...l, receivedQty: 0 })),
          status: 'cancelled',
          updatedAt: now,
        });
      }
      // Cloud: dicatat database sendiri (0073), termasuk bila PO dibatalkan
      // lewat jalur lain. Lokal/demo tidak punya trigger, jadi tetap dicatat di sini.
      if (!isCloudMode()) {
        logActivity({
          action: 'po.void',
          entityType: 'purchaseOrder',
          entityId: voidTarget.id,
          entityLabel: voidTarget.poNumber,
          meta: { poId: voidTarget.id, total: poTotal(voidTarget.lines) },
        });
      }
      toast.success('PO dibatalkan, stok & keuangan dikembalikan');
      setVoidTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membatalkan PO');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        <button className={[styles.tab, tab === 'po' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('po')}>
          Purchase Order ({purchaseOrders.length})
        </button>
        <button className={[styles.tab, tab === 'suppliers' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('suppliers')}>
          Supplier ({suppliers.length})
        </button>
        <div className={styles.spacer} />
        {tab === 'po' ? (
          <Button
            onClick={() => {
              setEditingPo(null);
              setPoModal(true);
            }}
            disabled={suppliers.length === 0 || inventory.length === 0}
            iconLeft={<Icon name="plus" aria-hidden />}
          >
            PO Baru
          </Button>
        ) : (
          <Button
            onClick={() => {
              setEditingSupplier(null);
              setSupplierModal(true);
            }}
            iconLeft={<Icon name="plus" aria-hidden />}
          >
            Supplier Baru
          </Button>
        )}
      </div>

      {tab === 'po' && (
        <div className={styles.poSummary} aria-label="Ringkasan purchase order">
          <span><small>TOTAL PO</small><strong>{purchaseOrders.length}</strong></span>
          <span><small>PO AKTIF</small><strong>{purchaseOrders.filter((po) => po.status === 'ordered' || po.status === 'partial').length}</strong></span>
          <span><small>SUPPLIER</small><strong>{suppliers.length}</strong></span>
        </div>
      )}

      {tab === 'po' ? (
        loadPending(poLoad) ? (
          <Card glass>
            <LoadState queries={[poLoad]} />
          </Card>
        ) : sortedPOs.length === 0 ? (
          <Card glass>
            <EmptyState
              icon={<Icon name="file-invoice" aria-hidden />}
              title="Belum ada Purchase Order"
              description={
                suppliers.length === 0
                  ? 'Tambahkan supplier terlebih dahulu.'
                  : 'Buat PO untuk memesan stok dari supplier.'
              }
            />
          </Card>
        ) : (
          <Card glass padding={false}>
            <div className={styles.docketList}>
              {sortedPOs.map((po) => (
                <div key={po.id} className={[styles.docket, styles[po.status]].join(' ')}>
                  <span className={styles.poChip}>{po.poNumber}</span>
                  <div className={styles.docketInfo}>
                    <strong>{supplierName(po.supplierId)}</strong>
                    <small>{po.orderedAt ? fmtDate(po.orderedAt) : 'belum dipesan'}</small>
                  </div>
                  <span className={styles.docketTotal}>{fmtRp(poTotal(po.lines))}</span>
                  <div className={styles.docketRight}>
                    <Badge tone={PO_STATUS_TONE[po.status] as 'brand'} dot>
                      {PO_STATUS_LABELS[po.status]}
                    </Badge>
                    {(po.status === 'ordered' || po.status === 'partial') && (
                      <button className={styles.receiveBtn} onClick={() => setReceiveTarget(po)}>
                        <Icon name="box-open" aria-hidden /> Terima
                      </button>
                    )}
                    {/* Salah ketik qty/harga tak lagi memaksa batal + buat ulang —
                        selama belum ada barang masuk, PO-nya masih bisa diperbaiki. */}
                    {po.status !== 'cancelled' && poReceivedQty(po.lines) === 0 && (
                      <button
                        className={styles.voidBtn}
                        onClick={() => {
                          setEditingPo(po);
                          setPoModal(true);
                        }}
                        aria-label={`Perbaiki ${po.poNumber}`}
                        title="Perbaiki PO (belum ada barang diterima)"
                      >
                        <Icon name="pen" aria-hidden />
                      </button>
                    )}
                    {po.status !== 'cancelled' && po.status !== 'draft' && (
                      <button
                        className={styles.voidBtn}
                        onClick={() => setVoidTarget(po)}
                        aria-label="Batalkan PO"
                        title="Batalkan PO (kembalikan stok & keuangan)"
                      >
                        <Icon name="circle-xmark" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      ) : (
        loadPending(suppliersLoad) ? (
          <Card glass>
            <LoadState queries={[suppliersLoad]} />
          </Card>
        ) : suppliers.length === 0 ? (
          <Card glass>
            <EmptyState
              icon={<Icon name="truck-field" aria-hidden />}
              title="Belum ada supplier"
              description="Tambahkan supplier untuk mulai membuat purchase order."
              action={
                <Button onClick={() => { setEditingSupplier(null); setSupplierModal(true); }} iconLeft={<Icon name="plus" aria-hidden />}>
                  Supplier Baru
                </Button>
              }
            />
          </Card>
        ) : (
          <div className={styles.vendorGrid}>
            {suppliers.map((s) => {
              const vs = vendorStats.get(s.id) ?? { count: 0, total: 0 };
              return (
                <div key={s.id} className={styles.vendor}>
                  <div className={styles.vendorHead}>
                    <span className={styles.vendorPlate}>
                      <Icon name="truck-field" aria-hidden />
                    </span>
                    <div className={styles.vendorIdent}>
                      <div className={styles.vendorName}>{s.name}</div>
                      <div className={styles.vendorId}>VND-{s.id.slice(0, 6).toUpperCase()}</div>
                    </div>
                  </div>
                  <div className={styles.vendorContacts}>
                    <div className={styles.contactRow}>
                      <Icon name="phone" aria-hidden />
                      <span>{s.phone || <em className={styles.contactMuted}>tanpa nomor</em>}</span>
                    </div>
                    <div className={styles.contactRow}>
                      <Icon name="envelope" aria-hidden />
                      <span>{s.email || <em className={styles.contactMuted}>tanpa email</em>}</span>
                    </div>
                  </div>
                  <div className={styles.vendorFoot}>
                    <div className={styles.vendorStat}>
                      <span className={styles.vendorStatLabel}>Total PO</span>
                      <span className={styles.vendorStatValue}>{vs.count}</span>
                    </div>
                    <div className={styles.vendorStat}>
                      <span className={styles.vendorStatLabel}>Total Belanja</span>
                      <span className={styles.vendorStatValue}>{fmtRp(vs.total)}</span>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={styles.iconBtn} onClick={() => { setEditingSupplier(s); setSupplierModal(true); }} aria-label="Edit">
                        <Icon name="pen" aria-hidden />
                      </button>
                      <button className={[styles.iconBtn, styles.danger].join(' ')} onClick={() => setDeleteSupplier(s)} aria-label="Hapus">
                        <Icon name="trash" aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <SupplierModal
        open={supplierModal}
        onClose={() => setSupplierModal(false)}
        editing={editingSupplier}
        suppliers={suppliers}
      />
      <PurchaseOrderModal
        open={poModal}
        onClose={() => {
          setPoModal(false);
          setEditingPo(null);
        }}
        suppliers={suppliers}
        inventory={inventory}
        purchaseOrders={purchaseOrders}
        editing={editingPo}
      />
      <ReceiveModal
        open={!!receiveTarget}
        onClose={() => setReceiveTarget(null)}
        po={receiveTarget}
        supplier={receiveTarget ? suppliers.find((s) => s.id === receiveTarget.supplierId) ?? null : null}
      />
      <ConfirmDialog
        open={!!deleteSupplier}
        title="Hapus Supplier?"
        message={`"${deleteSupplier?.name}" akan dihapus permanen. Hanya bisa dihapus bila belum pernah dipakai di purchase order.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDeleteSupplier}
        onCancel={() => setDeleteSupplier(null)}
      />
      <ConfirmDialog
        open={!!voidTarget}
        title="Batalkan PO?"
        message={`PO ${voidTarget?.poNumber ?? ''} akan dibatalkan. Stok yang sudah diterima dikembalikan, pengeluaran terkait dihapus, dan saldo wallet dikembalikan. HPP rata-rata TIDAK ikut kembali ke nilai sebelumnya — periksa harga modal barangnya setelah ini. Hanya bisa dibatalkan bila stoknya masih utuh dan pengeluarannya masih bulan ini.`}
        confirmLabel={voiding ? 'Membatalkan…' : 'Batalkan PO'}
        danger
        onConfirm={confirmVoid}
        onCancel={() => setVoidTarget(null)}
      />
    </div>
  );
}
