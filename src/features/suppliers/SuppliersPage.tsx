import { useMemo, useState } from 'react';
import { Card, Button, Badge, EmptyState, Icon } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { fmtRp } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { poTotal, PO_STATUS_LABELS, PO_STATUS_TONE } from '@/lib/business/purchase';
import { toast } from '@/stores/toast';
import { SupplierModal } from './SupplierModal';
import { PurchaseOrderModal } from './PurchaseOrderModal';
import { ReceiveModal } from './ReceiveModal';
import type { Supplier, PurchaseOrder } from '@/data/types';
import styles from './SuppliersPage.module.css';

export function SuppliersPage() {
  const { data: suppliers } = useCollection('suppliers');
  const { data: purchaseOrders } = useCollection('purchaseOrders');
  const { data: inventory } = useCollection('inventory');

  const [tab, setTab] = useState<'po' | 'suppliers'>('po');
  const [supplierModal, setSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [poModal, setPoModal] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [deleteSupplier, setDeleteSupplier] = useState<Supplier | null>(null);

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
    const openPo = purchaseOrders.filter(
      (p) => p.supplierId === deleteSupplier.id && p.status !== 'received' && p.status !== 'cancelled',
    ).length;
    if (openPo > 0) {
      toast.warning(`Supplier punya ${openPo} PO aktif — periksa dulu.`);
    }
    await repository.remove('suppliers', deleteSupplier.id);
    toast.success('Supplier dihapus');
    setDeleteSupplier(null);
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
            onClick={() => setPoModal(true)}
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

      {tab === 'po' ? (
        sortedPOs.length === 0 ? (
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
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      ) : (
        suppliers.length === 0 ? (
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

      <SupplierModal open={supplierModal} onClose={() => setSupplierModal(false)} editing={editingSupplier} />
      <PurchaseOrderModal
        open={poModal}
        onClose={() => setPoModal(false)}
        suppliers={suppliers}
        inventory={inventory}
        purchaseOrders={purchaseOrders}
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
        message={`"${deleteSupplier?.name}" akan dihapus.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDeleteSupplier}
        onCancel={() => setDeleteSupplier(null)}
      />
    </div>
  );
}
