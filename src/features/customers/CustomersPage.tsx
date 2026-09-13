import { useMemo, useState } from 'react';
import { Card, Button, Input, EmptyState, Icon, LoadState, loadPending } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { useSessionStore } from '@/stores/session';
import { isManager } from '@/config/plans';
import { fmtRp } from '@/lib/format';
import { toast } from '@/stores/toast';
import { logActivity } from '@/lib/activity';
import { waLink } from '@/lib/business/notify';
import { demoGuard } from '@/stores/demo';
import { CustomerModal } from './CustomerModal';
import { CustomerHistoryDrawer } from './CustomerHistoryDrawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Customer } from '@/data/types';
import styles from './CustomersPage.module.css';

type SortKey = 'svc_desc' | 'name_asc' | 'trx_desc';
type ViewMode = 'grid' | 'list';

export function CustomersPage() {
  const { data: customers, ...customersLoad } = useCollection('customers');
  const { data: services, ...servicesLoad } = useCollection('services');
  // Hitungan per pelanggan berasal dari servis. Selama servis belum termuat /
  // gagal, "0x · Rp 0 · Belum servis" adalah angka palsu, jadi tampil "—".
  const servicesPending = loadPending(servicesLoad);
  const me = useSessionStore((s) => s.currentEmployee);
  const org = useSessionStore((s) => s.org);
  const isMgr = me ? isManager(me.role) : false;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('svc_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [category, setCategory] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  // Per-customer service count + total transaction value.
  const stats = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const s of services) {
      const cur = map.get(s.customerId) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += s.finalCost;
      map.set(s.customerId, cur);
    }
    return map;
  }, [services]);

  // Device categories each customer has ever brought in (derived from their
  // service history), plus the full set of categories for the filter dropdown.
  const custCategories = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of services) {
      const cat = (s.category || '').trim();
      if (!cat) continue;
      const set = map.get(s.customerId) ?? new Set<string>();
      set.add(cat);
      map.set(s.customerId, set);
    }
    return map;
  }, [services]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      const cat = (s.category || '').trim();
      if (cat) set.add(cat);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [services]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = customers.filter((c) => {
      if (q && !(c.name.toLowerCase().includes(q) || c.phone.includes(q))) return false;
      if (category !== 'all' && !custCategories.get(c.id)?.has(category)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name);
      const sa = stats.get(a.id) ?? { count: 0, total: 0 };
      const sb = stats.get(b.id) ?? { count: 0, total: 0 };
      if (sort === 'trx_desc') return sb.total - sa.total;
      return sb.count - sa.count;
    });
    return list;
  }, [customers, query, sort, stats, category, custCategories]);

  const repeatCount = useMemo(
    () => customers.filter((c) => (stats.get(c.id)?.count ?? 0) > 1).length,
    [customers, stats],
  );

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setModalOpen(true);
  };

  // Open WhatsApp with a pre-filled, shop-branded greeting the user can edit
  // before sending. Mirrors NotifyModal: wa.me deep link, demo-guarded.
  const sendWa = (c: Customer) => {
    if (demoGuard('Kirim WhatsApp aktif di FixMaster versi penuh — daftar gratis.')) return;
    const toko = org?.name?.trim();
    const greeting = toko ? `Halo ${c.name}, ${toko} di sini. ` : `Halo ${c.name}, `;
    window.open(waLink(c.phone, greeting), '_blank');
    toast.success('Membuka WhatsApp…');
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await repository.remove('customers', toDelete.id);
      toast.success('Pelanggan dihapus');
      logActivity({
        action: 'customer.delete',
        entityType: 'customer',
        entityId: toDelete.id,
        entityLabel: toDelete.name,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus pelanggan');
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input
            placeholder="Cari nama atau no. HP…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            iconLeft={<Icon name="magnifying-glass" aria-hidden />}
          />
        </div>
        <div className={styles.actions}>
          {allCategories.length > 0 && (
            <select
              className={styles.sortSelect}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter kategori perangkat"
            >
              <option value="all">Semua Perangkat</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="svc_desc">Servis Terbanyak</option>
            <option value="trx_desc">Transaksi Tertinggi</option>
            <option value="name_asc">Nama A-Z</option>
          </select>
          <div className={styles.viewToggle} role="group" aria-label="Ubah tampilan">
            <button
              type="button"
              className={[styles.viewBtn, viewMode === 'grid' ? styles.viewActive : ''].join(' ')}
              onClick={() => setViewMode('grid')}
              aria-label="Tampilan kartu"
              aria-pressed={viewMode === 'grid'}
              title="Tampilan kartu"
            >
              <Icon name="boxes-stacked" aria-hidden />
            </button>
            <button
              type="button"
              className={[styles.viewBtn, viewMode === 'list' ? styles.viewActive : ''].join(' ')}
              onClick={() => setViewMode('list')}
              aria-label="Tampilan daftar"
              aria-pressed={viewMode === 'list'}
              title="Tampilan daftar"
            >
              <Icon name="list-check" aria-hidden />
            </button>
          </div>
          <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
            Pelanggan Baru
          </Button>
        </div>
      </div>

      <div className={styles.summary}>
        <span><strong>{customers.length}</strong> pelanggan</span>
        <span><strong>{servicesPending ? '—' : repeatCount}</strong> pelanggan berulang</span>
        <span><strong>{rows.length}</strong> ditampilkan</span>
      </div>

      {loadPending(customersLoad) ? (
        <Card glass>
          <LoadState queries={[customersLoad]} />
        </Card>
      ) : rows.length === 0 ? (
        <Card glass>
          <EmptyState
            icon={<Icon name="users" aria-hidden />}
            title={query ? 'Tidak ada hasil' : 'Belum ada pelanggan'}
            description={
              query ? 'Coba kata kunci lain.' : 'Tambahkan pelanggan pertama Anda.'
            }
            action={
              !query && (
                <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
                  Pelanggan Baru
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className={[styles.grid, viewMode === 'list' ? styles.listView : ''].join(' ')}>
          {rows.map((c) => {
            const st = stats.get(c.id) ?? { count: 0, total: 0 };
            return (
              <div
                key={c.id}
                className={styles.record}
                role="button"
                tabIndex={0}
                onClick={() => setHistoryCustomer(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setHistoryCustomer(c);
                  }
                }}
                title="Lihat riwayat servis"
              >
                <div className={styles.head}>
                  <span className={styles.plate}>{c.name.charAt(0).toUpperCase()}</span>
                  <div className={styles.ident}>
                    <div className={styles.name}>{c.name}</div>
                    <div className={styles.idTag}>ID-{c.id.slice(0, 6).toUpperCase()}</div>
                  </div>
                </div>

                <div className={styles.contacts}>
                  <div className={styles.contactRow}>
                    <Icon name="phone" aria-hidden />
                    <span>{c.phone || <em className={styles.contactMuted}>tanpa nomor</em>}</span>
                  </div>
                </div>

                <div className={styles.activity}>
                  <div className={styles.activityBlock}>
                    <span className={styles.activityLabel}>Servis</span>
                    <span className={[styles.activityValue, !servicesPending && st.count > 0 ? styles.brand : styles.idle].join(' ')}>
                      {servicesPending ? '—' : `${st.count}x`}
                    </span>
                  </div>
                  <div className={styles.activityBlock}>
                    <span className={styles.activityLabel}>Total Transaksi</span>
                    <span className={styles.activityValue}>{servicesPending ? '—' : fmtRp(st.total)}</span>
                  </div>
                </div>

                <div className={styles.foot}>
                  {servicesPending ? (
                    <span className={styles.newcomer}>—</span>
                  ) : st.count > 1 ? (
                    <span className={styles.repeat}>Pelanggan Setia</span>
                  ) : (
                    <span className={styles.newcomer}>{st.count === 1 ? 'Pernah servis' : 'Belum servis'}</span>
                  )}
                  <div className={styles.cardActions}>
                    {c.phone && (
                      <button
                        className={[styles.iconBtn, styles.wa].join(' ')}
                        onClick={(e) => {
                          e.stopPropagation();
                          sendWa(c);
                        }}
                        aria-label="Kirim WhatsApp"
                        title="Kirim WhatsApp"
                      >
                        <Icon name="whatsapp" aria-hidden />
                      </button>
                    )}
                    <button
                      className={styles.iconBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(c);
                      }}
                      aria-label="Edit"
                    >
                      <Icon name="pen" aria-hidden />
                    </button>
                    {isMgr && (
                      <button
                        className={[styles.iconBtn, styles.danger].join(' ')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setToDelete(c);
                        }}
                        aria-label="Hapus"
                      >
                        <Icon name="trash" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CustomerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        customers={customers}
        onSaved={() => {}}
      />
      <CustomerHistoryDrawer
        open={historyCustomer !== null}
        onClose={() => setHistoryCustomer(null)}
        customer={historyCustomer}
        services={services}
        servicesLoad={servicesLoad}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Hapus Pelanggan?"
        message={`"${toDelete?.name}" akan dihapus. Tindakan ini tidak menghapus riwayat servis terkait.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
