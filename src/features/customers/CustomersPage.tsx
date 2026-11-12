import { EmptyValue } from '@/components/ui/EmptyValue';
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
  PageSummary,
} from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { useCustomerServices, useCustomerStats } from '@/hooks/useCustomerStats';
import { EMPTY_CUSTOMER_STAT, matchesCustomer } from '@/lib/business/customers';
import { repository } from '@/data';
import { useSessionStore } from '@/stores/session';
import { isManager } from '@/config/plans';
import { fmtRp, EMPTY_VALUE } from '@/lib/format';
import { toast } from '@/stores/toast';
import { logActivity } from '@/lib/activity';
import { waLink, interpolate } from '@/lib/business/notify';
import { useT } from '@/i18n';
import { demoGuard } from '@/stores/demo';
import { CustomerModal } from './CustomerModal';
import { CustomerHistoryDrawer } from './CustomerHistoryDrawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Customer } from '@/data/types';
import styles from './CustomersPage.module.css';

type SortKey = 'svc_desc' | 'name_asc' | 'trx_desc';

export function CustomersPage() {
  const t = useT();
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

  // Chip perangkat seperti di Kasir & Inventori. Jumlahnya = pelanggan (yang
  // masih ada) yang pernah membawa kategori itu; satu pelanggan bisa di beberapa.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of customers) {
      for (const cat of stats.get(c.id)?.categories ?? []) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [customers, stats]);
  const activeCategory = categoryCounts.some(([c]) => c === category) ? category : 'all';

  const rows = useMemo(() => {
    let list = customers.filter((c) => {
      if (!matchesCustomer(c, query)) return false;
      if (activeCategory !== 'all' && !stats.get(c.id)?.categories.includes(activeCategory)) {
        return false;
      }
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
  }, [customers, query, sort, stats, activeCategory]);
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
    if (demoGuard('demo.whatsapp')) return;
    const toko = org?.name?.trim();
    const greeting = toko ? `Halo ${c.name}, ${toko} di sini. ` : `Halo ${c.name}, `;
    window.open(waLink(c.phone, greeting), '_blank');
    toast.success(t('customers.waOpening'));
  };

  // Pelanggan yang punya tiket tidak dihapus: tiketnya kehilangan pemilik dan
  // riwayat + statistiknya ikut hilang. Server menolaknya juga (0070) — cek di
  // sini supaya alasannya terbaca sebelum dialog konfirmasi muncul.
  const requestDelete = (c: Customer) => {
    // Statistik belum termuat = setiap pelanggan terbaca "0 tiket", dan dialog
    // konfirmasi menyatakan hal yang belum tentu benar sebagai fakta.
    if (statsQuery.loading) {
      toast.warning(t('customers.statsLoading'));
      return;
    }
    const used = stats.get(c.id)?.count ?? 0;
    if (used > 0) {
      toast.warning(interpolate(t('customers.hasTickets'), { name: c.name, count: String(used) }));
      return;
    }
    setToDelete(c);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await repository.remove('customers', toDelete.id);
      toast.success(t('customers.deleted'));
      logActivity({
        action: 'customer.delete',
        entityType: 'customer',
        entityId: toDelete.id,
        entityLabel: toDelete.name,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('customers.deleteFailed'));
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
          aria-label={t('customers.sendWa')}
          title={t('customers.sendWa')}
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
        aria-label={t('customers.edit')}
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
          aria-label={t('common.delete')}
        >
          <Icon name="trash" aria-hidden />
        </button>
      )}
    </>
  );

  return (
    <div className={styles.wrap}>
      {/* Ringkasan membuka halaman, seperti Servis dan Inventori. Dulu ia di
          bawah chip kategori, jadi di ponsel tertutup isi lain. */}
      <PageSummary
        label={t('customers.summaryAria')}
        items={[
          { label: t('customers.statTotal'), short: t('customers.statTotalShort'), value: customers.length },
          {
            label: t('customers.statRepeat'),
            short: t('customers.statRepeatShort'),
            value: servicesPending ? EMPTY_VALUE : repeatCount,
          },
          { label: t('customers.statShown'), short: t('customers.statShownShort'), value: rows.length },
        ]}
      />
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input
            placeholder={t('customers.searchPh')}
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
            aria-label={t('customers.sortLabel')}
          >
            <option value="svc_desc">{t('customers.sortServices')}</option>
            <option value="trx_desc">{t('customers.sortValue')}</option>
            <option value="name_asc">{t('customers.sortName')}</option>
          </select>
          <ViewToggle value={view} onChange={chooseView} label={t('customers.viewLabel')} />
          <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
            {t('customers.new')}
          </Button>
        </div>
      </div>

      <CategoryChips
        categories={categoryCounts}
        total={customers.length}
        value={activeCategory}
        onChange={setCategory}
        label={t('customers.categoryLabel')}
      />

      {loadPending(customersLoad) ? (
        <Card>
          <LoadState queries={[customersLoad]} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="users" aria-hidden />}
            title={filtered ? t('customers.noResults') : t('customers.emptyTitle')}
            description={
              filtered ? t('customers.noResultsHint') : t('customers.emptyHint')
            }
            action={
              !filtered && (
                <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
                  {t('customers.new')}
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
                title={t('customers.viewHistory')}
              >
                <div className={styles.tileHead}>
                  <span className={[styles.plate, styles.tilePlate].join(' ')}>
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className={styles.ident}>
                    <div className={styles.tileName}>{c.name}</div>
                    <div className={styles.idTag}>{c.phone || t('customers.noPhone')}</div>
                  </div>
                </div>
                <div className={styles.tileFoot}>
                  <span className={styles.tileStat}>
                    {servicesPending ? EMPTY_VALUE : `${st.count}x · ${fmtRp(st.paidTotal)}`}
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
                title={t('customers.viewHistory')}
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
                    <span>{c.phone || <em className={styles.contactMuted}>{t('customers.noPhone')}</em>}</span>
                  </div>
                </div>

                <div className={styles.activity}>
                  <div className={styles.activityBlock}>
                    <span className={styles.activityLabel}>{t('customers.services')}</span>
                    <span className={[styles.activityValue, !servicesPending && st.count > 0 ? styles.brand : styles.idle].join(' ')}>
                      {servicesPending ? EMPTY_VALUE : `${st.count}x`}
                    </span>
                  </div>
                  <div className={styles.activityBlock}>
                    <span className={styles.activityLabel}>{t('customers.paidServices')}</span>
                    <span className={styles.activityValue}>{servicesPending ? EMPTY_VALUE : fmtRp(st.paidTotal)}</span>
                  </div>
                </div>

                <div className={styles.foot}>
                  {servicesPending ? (
                    <span className={styles.newcomer}><EmptyValue /></span>
                  ) : st.count > 1 ? (
                    <span className={styles.repeat}>{t('customers.loyal')}</span>
                  ) : (
                    <span className={styles.newcomer}>{st.count === 1 ? t('customers.servedOnce') : t('customers.neverServed')}</span>
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
        title={t('customers.deleteTitle')}
        message={interpolate(t('customers.deleteMessage'), { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
