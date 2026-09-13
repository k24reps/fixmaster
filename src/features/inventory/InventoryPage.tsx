import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Button, Input, EmptyState, Icon, LoadState, loadPending } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { useSessionStore } from '@/stores/session';
import { isManager } from '@/config/plans';
import { fmtRp } from '@/lib/format';
import { toast } from '@/stores/toast';
import { logActivity } from '@/lib/activity';
import { InventoryModal } from './InventoryModal';
import type { InventoryItem } from '@/data/types';
import styles from './InventoryPage.module.css';

type SortKey = 'low_first' | 'name_asc' | 'stock_desc';
type StockFilter = 'all' | 'low' | 'out';

function stockState(item: InventoryItem): 'out' | 'low' | 'ok' {
  if (item.stock <= 0) return 'out';
  if (item.stock <= item.minStock) return 'low';
  return 'ok';
}

export function InventoryPage() {
  const [searchParams] = useSearchParams();
  const { data: inventory, ...inventoryLoad } = useCollection('inventory');
  const { data: services } = useCollection('services');
  const me = useSessionStore((s) => s.currentEmployee);
  const isMgr = me ? isManager(me.role) : false;
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const requestedStock = searchParams.get('stock');
  const [stockFilter, setStockFilter] = useState<StockFilter>(
    requestedStock === 'low' || requestedStock === 'out' ? requestedStock : 'all',
  );
  const [sort, setSort] = useState<SortKey>('low_first');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [toDelete, setToDelete] = useState<InventoryItem | null>(null);

  const categories = useMemo(
    () => [...new Set(inventory.map((i) => i.category).filter(Boolean))].sort(),
    [inventory],
  );

  const stats = useMemo(() => {
    const total = inventory.length;
    const low = inventory.filter((i) => stockState(i) === 'low').length;
    const out = inventory.filter((i) => stockState(i) === 'out').length;
    const value = inventory.reduce((sum, i) => sum + i.costPrice * i.stock, 0);
    return { total, low, out, value };
  }, [inventory]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = { out: 0, low: 1, ok: 2 };
    return inventory
      .filter((i) => categoryFilter === 'all' || i.category === categoryFilter)
      .filter((i) => stockFilter === 'all' || stockState(i) === stockFilter)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === 'name_asc') return a.name.localeCompare(b.name);
        if (sort === 'stock_desc') return b.stock - a.stock;
        return order[stockState(a)] - order[stockState(b)] || a.stock - b.stock;
      });
  }, [inventory, query, categoryFilter, stockFilter, sort]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await repository.remove('inventory', toDelete.id);
      toast.success('Sparepart dihapus');
      logActivity({
        action: 'inventory.delete',
        entityType: 'inventory',
        entityId: toDelete.id,
        entityLabel: toDelete.name,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus sparepart');
    } finally {
      setToDelete(null);
    }
  };

  const requestDelete = (item: InventoryItem) => {
    // Dependency warning: used in an active service?
    const usedIn = services.filter(
      (s) => !['lunas', 'batal'].includes(s.status) && s.spareparts.some((sp) => sp.itemId === item.id),
    ).length;
    if (usedIn > 0) {
      toast.warning(`"${item.name}" dipakai di ${usedIn} servis aktif — periksa dulu.`);
    }
    setToDelete(item);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.statsBar}>
        <span><strong>{stats.total}</strong> item</span>
        <span className={styles.low}><strong>{stats.low}</strong> menipis</span>
        <span className={styles.out}><strong>{stats.out}</strong> habis</span>
        <span><strong>{fmtRp(stats.value)}</strong> nilai stok</span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input
            placeholder="Cari sparepart atau kategori…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            iconLeft={<Icon name="magnifying-glass" aria-hidden />}
          />
        </div>
        <div className={styles.actions}>
          <select className={styles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className={styles.select}
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as StockFilter)}
            aria-label="Filter kondisi stok"
          >
            <option value="all">Semua Kondisi</option>
            <option value="out">Stok Habis</option>
            <option value="low">Stok Menipis</option>
          </select>
          <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="low_first">Stok Rendah Dulu</option>
            <option value="name_asc">Nama A-Z</option>
            <option value="stock_desc">Stok Terbanyak</option>
          </select>
          <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />} hidden={!isMgr} style={isMgr ? undefined : { display: 'none' }}>
            Tambah Sparepart
          </Button>
        </div>
      </div>

      {loadPending(inventoryLoad) ? (
        <Card glass>
          <LoadState queries={[inventoryLoad]} />
        </Card>
      ) : rows.length === 0 ? (
        <Card glass>
          <EmptyState
            icon={<Icon name="boxes-stacked" aria-hidden />}
            title={inventory.length === 0 ? 'Belum ada sparepart' : 'Tidak ada hasil'}
            description={inventory.length === 0 ? 'Tambahkan stok pertama Anda.' : 'Ubah filter atau pencarian.'}
            action={
              inventory.length === 0 && (
                <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
                  Tambah Sparepart
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className={styles.binGrid}>
          {rows.map((i) => {
            const st = stockState(i);
            const full = Math.max(i.minStock * 3, 1);
            const pct = Math.max(0, Math.min(100, (i.stock / full) * 100));
            const ledLabel = st === 'out' ? 'HABIS' : st === 'low' ? 'MENIPIS' : 'AMAN';
            return (
              <div key={i.id} className={[styles.bin, styles[st]].join(' ')}>
                <div className={styles.binHead}>
                  <span className={styles.binCat}>{i.category || 'UMUM'}</span>
                  <span className={styles.led}>
                    <span className={styles.ledDot} aria-hidden />
                    {ledLabel}
                  </span>
                </div>
                <div className={styles.binName}>{i.name}</div>
                <div>
                  <div className={styles.stockRow}>
                    <span className={styles.stockNum}>{i.stock}</span>
                    <span className={styles.stockUnit}>min {i.minStock}</span>
                  </div>
                  <div className={styles.gauge}>
                    <div className={styles.gaugeFill} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={styles.gaugeMeta}>
                    <span>STOK</span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                </div>
                <div className={styles.binFooter}>
                  <div className={styles.prices}>
                    <span className={styles.priceSell}>{fmtRp(i.sellPrice)}</span>
                    <span className={styles.priceCost}>HPP {fmtRp(i.costPrice)}</span>
                  </div>
                  <div className={styles.binActions}>
                    {isMgr && (
                      <>
                        <button className={styles.iconBtn} onClick={() => { setEditing(i); setModalOpen(true); }} aria-label="Edit">
                          <Icon name="pen" aria-hidden />
                        </button>
                        <button className={[styles.iconBtn, styles.danger].join(' ')} onClick={() => requestDelete(i)} aria-label="Hapus">
                          <Icon name="trash" aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <InventoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        categories={categories}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Hapus Sparepart?"
        message={`"${toDelete?.name}" akan dihapus dari inventori.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
