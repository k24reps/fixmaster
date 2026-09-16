import { useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  EmptyState,
  Icon,
  LoadState,
  loadPending,
  ViewToggle,
  CategoryChips,
  usePersistedView,
} from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { useCustomerServices, useCustomerStats } from '@/hooks/useCustomerStats';
import { EMPTY_CUSTOMER_STAT, matchesCustomer } from '@/lib/business/customers';
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

export function CustomersPage() {
  const { data: customers, ...customersLoad } = useCollection('customers');
  // Hitungan per pelanggan dari SEMUA tiket (server; daftar servis dipotong 1000).
  // Selama belum termuat / gagal, "0x · Rp 0 · Belum servis" adalah angka palsu, jadi tampil "—".
  const statsQuery = useCustomerStats();
  const servicesPending = loadPending(statsQuery);
  const me = useSessionStore((s) => s.currentEmployee);
  const org = useSessionStore((s) => s.org);
  const isMgr = me ? isManager(me.role) : false;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('svc_desc');
  const [view, chooseView] = usePersistedView('fixmaster-customers-view');
  const [category, setCategory] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  // Riwayat diambil per pelanggan dari server — pelanggan lama punya tiket di luar 1000 terbaru.
  const historyQuery = useCustomerServices(historyCustomer?.id ?? null);

  // Per pelanggan: jumlah tiket (tanpa batal), nilai tiket Lunas, kategori perangkat.
  const stats = statsQuery.data;
  const custCategories = useMemo(
    () => new Map([...stats].map(([id, stat]) => [id, new Set(stat.categories)] as const)),
    [stats],
  );

  // Chip perangkat seperti di Kasir & Inventori. Jumlahnya = pelanggan (yang
  // masih ada) yang pernah membawa kategori itu; satu pelanggan bisa di beberapa.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of customers) {
      for (const cat of custCategories.get(c.id) ?? []) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [customers, custCategories]);
  const activeCategory = categoryCounts.some(([c]) => c === category) ? category : 'all';

  const rows = useMemo(() => {
    let list = customers.filter((c) => {
      if (!matchesCustomer(c, query)) return false;
      if (activeCategory !== 'all' && !custCategories.get(c.id)?.has(activeCategory)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name);
      const sa = stats.get(a.id) ?? EMPTY_CUSTOMER_STAT;
      const sb = stats.get(b.id) ?? EMPTY_CUSTOMER_STAT;
      if (sort === 'trx_desc') return sb.paidTotal - sa.paidTotal;
      return sb.count - sa.count;
    });
    return list;
  }, [customers, query, sort, stats, activeCategory, custCategories]);
  const filtered = Boolean(query) || activeCategory !== 'all';

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

  // Pelanggan yang punya tiket tidak dihapus: tiketnya kehilangan pemilik dan
  // riwayat + statistiknya ikut hilang. Server menolaknya juga (0070) — cek di
  // sini supaya alasannya terbaca sebelum dialog konfirmasi muncul.
  const requestDelete = (c: Customer) => {
    const used = stats.get(c.id)?.count ?? 0;
    if (used > 0) {
      toast.warning(`"${c.name}" punya ${used} tiket servis — perbarui datanya saja, jangan dihapus.`);
      return;
    }
    setToDelete(c);
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

  // Seluruh kartu/ubin membuka riwayat servis; tombol di dalamnya tidak.
  const openOnKey = (c: Customer) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setHistoryCustomer(c);
    }
  };

  // Aksi yang sama di ketiga tampilan.
  const renderActions = (c: Customer) => (
    <>
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
            requestDelete(c);
          }}
          aria-label="Hapus"
        >
          <Icon name="trash" aria-hidden />
        </button>
      )}
    </>
  );

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
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Urutkan pelanggan"
          >
            <option value="svc_desc">Servis Terbanyak</option>
            <option value="trx_desc">Nilai Servis Tertinggi</option>
            <option value="name_asc">Nama A-Z</option>
          </select>
          <ViewToggle value={view} onChange={chooseView} label="Tampilan pelanggan" />
          <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
            Pelanggan Baru
          </Button>
        </div>
      </div>

      <CategoryChips
        categories={categoryCounts}
        total={customers.length}
        value={activeCategory}
        onChange={setCategory}
        label="Kategori perangkat"
      />

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
            title={filtered ? 'Tidak ada hasil' : 'Belum ada pelanggan'}
            description={
              filtered ? 'Coba kata kunci atau kategori lain.' : 'Tambahkan pelanggan pertama Anda.'
            }
            action={
              !filtered && (
                <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
                  Pelanggan Baru
                </Button>
              )
            }
          />
        </Card>
      ) : view === 'tiles' ? (
        <div className={styles.tileGrid}>
          {rows.map((c) => {
            const st = stats.get(c.id) ?? EMPTY_CUSTOMER_STAT;
            return (
              <div
                key={c.id}
                className={styles.tile}
                role="button"
                tabIndex={0}
                onClick={() => setHistoryCustomer(c)}
                onKeyDown={openOnKey(c)}
                title="Lihat riwayat servis"
              >
                <div className={styles.tileHead}>
                  <span className={[styles.plate, styles.tilePlate].join(' ')}>
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className={styles.ident}>
                    <div className={styles.tileName}>{c.name}</div>
                    <div className={styles.idTag}>{c.phone || 'tanpa nomor'}</div>
                  </div>
                </div>
                <div className={styles.tileFoot}>
                  <span className={styles.tileStat}>
                    {servicesPending ? '—' : `${st.count}x · ${fmtRp(st.paidTotal)}`}
                  </span>
                  <div className={styles.cardActions}>{renderActions(c)}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={[styles.grid, view === 'list' ? styles.listView : ''].join(' ')}>
          {rows.map((c) => {
            const st = stats.get(c.id) ?? EMPTY_CUSTOMER_STAT;
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
                    <span className={styles.activityLabel}>Servis Lunas</span>
                    <span className={styles.activityValue}>{servicesPending ? '—' : fmtRp(st.paidTotal)}</span>
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
                  <div className={styles.cardActions}>{renderActions(c)}</div>
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
        services={historyQuery.data}
        servicesLoad={historyQuery}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Hapus Pelanggan?"
        message={`"${toDelete?.name}" belum punya tiket servis dan akan dihapus permanen.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
