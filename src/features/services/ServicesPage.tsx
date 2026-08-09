import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Input, Badge, StatCard, EmptyState, Icon } from '@/components/ui';
import { repository } from '@/data';
import { useCollection } from '@/hooks/useCollection';
import { useSessionStore } from '@/stores/session';
import { toast } from '@/stores/toast';
import { fmtRp } from '@/lib/format';
import { fmtDate, localDateOf } from '@/lib/time';
import {
  STATUS_LABELS,
  STATUS_TONE,
  isActive,
  isAwaitingPickup,
  serviceProfit,
  serviceModalTotal,
} from '@/lib/business/services';
import { getCategories } from '@/config/orgConfig';
import { ServiceModal } from './ServiceModal';
import { StatusModal } from './StatusModal';
import { NotifyModal } from './NotifyModal';
import type { Service, ServiceStatus } from '@/data/types';
import styles from './ServicesPage.module.css';

export function ServicesPage() {
  const { data: services, loading } = useCollection('services');
  const { data: customers } = useCollection('customers');
  const { data: employees } = useCollection('employees');
  const sessionEmployees = useSessionStore((s) => s.employees);
  const techs = employees.length ? employees : sessionEmployees;
  const me = useSessionStore((s) => s.currentEmployee);
  const role = me?.role;
  const isOwner = role === 'owner';
  const isManager = role === 'owner' || role === 'admin';

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pickupFilter, setPickupFilter] = useState<'all' | 'awaiting' | 'collected'>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Service | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState<Service | null>(null);

  // Subscribe to the org slice so the category filter reflects cloud-synced
  // edits (and updates from other devices) without a manual reload.
  const orgCategories = useSessionStore((s) => s.org?.settings?.deviceCategories);
  const categories = orgCategories ?? getCategories();

  const visible = services.filter((s) => !s.archived);

  const stats = useMemo(() => {
    const total = visible.length;
    const inProcess = visible.filter((s) => isActive(s.status) && s.status !== 'diterima').length;
    const done = visible.filter((s) => s.status === 'selesai' || s.status === 'lunas').length;
    const awaitingPickup = visible.filter(isAwaitingPickup).length;
    const revenue = visible
      .filter((s) => s.status === 'lunas')
      .reduce((sum, s) => sum + s.finalCost, 0);
    return { total, inProcess, done, awaitingPickup, revenue };
  }, [visible]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible
      .filter((s) => statusFilter === 'all' || s.status === statusFilter)
      .filter((s) => categoryFilter === 'all' || s.category === categoryFilter)
      .filter((s) =>
        pickupFilter === 'all'
          ? true
          : pickupFilter === 'awaiting'
            ? isAwaitingPickup(s)
            : s.pickedUp,
      )
      .filter(
        (s) =>
          !q ||
          s.serviceNo.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.device.toLowerCase().includes(q),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [visible, query, statusFilter, categoryFilter, pickupFilter]);

  const openNew = () => {
    setEditing(null);
    setEditOpen(true);
  };

  // Toggle physical collection (manager-only). Mirrors ServiceDetailPage so the
  // list and detail stay consistent; pickup is independent of payment status.
  const togglePickup = async (s: Service) => {
    const now = new Date().toISOString();
    const nowPicked = !s.pickedUp;
    try {
      await repository.put('services', {
        ...s,
        pickedUp: nowPicked,
        pickedUpAt: nowPicked ? now : null,
        updatedAt: now,
        history: [
          ...s.history,
          {
            at: now,
            status: 'edit',
            by: me?.id ?? '',
            byName: me?.name ?? '',
            note: nowPicked ? 'Barang diambil pelanggan' : 'Tanda ambil dibatalkan',
            internal: false,
          },
        ],
      });
      toast.success(nowPicked ? 'Ditandai sudah diambil' : 'Tanda ambil dibatalkan');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui tanda ambil');
    }
  };

  // Pickup indicator: prominent "Belum diambil" for closed-but-uncollected
  // units, dim "Diambil" for collected ones, nothing for in-progress tickets.
  const renderPickup = (s: Service) => {
    if (s.pickedUp) {
      return (
        <span className={styles.pickupDone}>
          <Icon name="circle-check" aria-hidden /> Diambil
        </span>
      );
    }
    if (isAwaitingPickup(s)) {
      return (
        <span className={styles.pickupWait}>
          <Icon name="box" aria-hidden /> Belum diambil
        </span>
      );
    }
    return null;
  };

  // Shared action cluster so the desktop table and mobile cards stay in sync.
  const renderActions = (s: Service) => (
    <>
      <Link
        className={styles.iconBtn}
        to={`/services/${s.id}`}
        title="Lihat tiket"
        aria-label="Lihat tiket"
      >
        <Icon name="up-right-from-square" aria-hidden />
      </Link>
      <button
        className={styles.iconBtn}
        onClick={() => {
          setNotifyTarget(s);
          setNotifyOpen(true);
        }}
        title="Notifikasi & nota"
        aria-label="Notifikasi & nota"
      >
        <Icon name="whatsapp" aria-hidden />
      </button>
      <button
        className={styles.iconBtn}
        onClick={() => {
          setEditing(s);
          setEditOpen(true);
        }}
        title="Edit"
        aria-label="Edit"
      >
        <Icon name="pen" aria-hidden />
      </button>
      {isManager && (isAwaitingPickup(s) || s.pickedUp) && (
        <button
          className={[styles.iconBtn, s.pickedUp ? styles.pickedActive : ''].join(' ')}
          onClick={() => void togglePickup(s)}
          title={s.pickedUp ? 'Batalkan tanda ambil' : 'Tandai sudah diambil'}
          aria-label={s.pickedUp ? 'Batalkan tanda ambil' : 'Tandai sudah diambil'}
        >
          <Icon name={s.pickedUp ? 'circle-check' : 'box'} aria-hidden />
        </button>
      )}
    </>
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.stats}>
        <StatCard label="Total Servis" value={stats.total} icon={<Icon name="clipboard-list" aria-hidden />} tone="brand" />
        <StatCard label="Dalam Proses" value={stats.inProcess} icon={<Icon name="spinner" aria-hidden />} tone="warning" />
        <StatCard label="Menunggu Diambil" value={stats.awaitingPickup} icon={<Icon name="box" aria-hidden />} tone="warning" />
        <StatCard label="Selesai / Lunas" value={stats.done} icon={<Icon name="check-double" aria-hidden />} tone="success" />
        <StatCard label="Pendapatan Aktual" value={fmtRp(stats.revenue)} icon={<Icon name="coins" aria-hidden />} tone="accent" />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.search}>
            <Input
              placeholder="Cari no servis, pelanggan, perangkat…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              iconLeft={<Icon name="magnifying-glass" aria-hidden />}
            />
          </div>
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ServiceStatus | 'all')}
          >
            <option value="all">Semua Status</option>
            {(Object.keys(STATUS_LABELS) as ServiceStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Semua Perangkat</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={pickupFilter}
            onChange={(e) => setPickupFilter(e.target.value as 'all' | 'awaiting' | 'collected')}
            title="Filter status pengambilan barang"
          >
            <option value="all">Semua Pengambilan</option>
            <option value="awaiting">Belum diambil</option>
            <option value="collected">Sudah diambil</option>
          </select>
        </div>
        <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
          Servis Baru
        </Button>
      </div>

      <Card glass>
        {loading ? (
          <p className={styles.loading}>
            <Icon name="circle-notch" className="spin" aria-hidden /> Memuat servis…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="screwdriver-wrench" aria-hidden />}
            title={visible.length === 0 ? 'Belum ada servis' : 'Tidak ada hasil'}
            description={
              visible.length === 0
                ? 'Buat tiket servis pertama saat unit masuk.'
                : 'Ubah filter atau kata kunci pencarian.'
            }
            action={
              visible.length === 0 && (
                <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
                  Servis Baru
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>No. Servis</th>
                    <th>Tgl Masuk</th>
                    <th>Pelanggan</th>
                    <th>Perangkat</th>
                    <th>Teknisi</th>
                    <th className={styles.num}>Biaya</th>
                    {isOwner && <th className={styles.num}>Modal</th>}
                    {isOwner && <th className={styles.num}>Profit</th>}
                    <th>Status</th>
                    <th className={styles.actionsCol}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className={styles.mono}>
                        <Link to={`/services/${s.id}`} className={styles.noLink}>
                          {s.serviceNo}
                        </Link>
                      </td>
                      <td>{fmtDate(localDateOf(s.createdAt))}</td>
                      <td>
                        <strong className={styles.customerName}>{s.customerName}</strong>
                        <small className={styles.sub}>{s.customerPhone}</small>
                      </td>
                      <td>
                        {s.device}
                        <small className={styles.sub}>{s.category}</small>
                        {renderPickup(s)}
                      </td>
                      <td>{s.technicianName || <span className={styles.muted}>—</span>}</td>
                      <td className={styles.num}>
                        {s.finalCost > 0 ? (
                          <span className={styles.cost}>{fmtRp(s.finalCost)}</span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      {isOwner && (
                        <td className={styles.num}>
                          {serviceModalTotal(s.spareparts) > 0 ? (
                            <span className={styles.modal}>{fmtRp(serviceModalTotal(s.spareparts))}</span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                      )}
                      {isOwner && (
                        <td className={styles.num}>
                          {s.finalCost > 0 ? (
                            <span data-loss={serviceProfit(s) < 0 ? 'true' : undefined} className={styles.profit}>
                              {fmtRp(serviceProfit(s))}
                            </span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                      )}
                      <td>
                        <button
                          type="button"
                          className={styles.statusBtn}
                          onClick={() => {
                            setStatusTarget(s);
                            setStatusOpen(true);
                          }}
                          title="Klik untuk update status"
                        >
                          <Badge tone={STATUS_TONE[s.status] as 'brand'} dot>
                            {STATUS_LABELS[s.status]}
                          </Badge>
                          <Icon name="pen" aria-hidden />
                        </button>
                      </td>
                      <td className={styles.actionsCol}>{renderActions(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className={styles.cardList}>
              {rows.map((s) => (
                <li key={s.id} className={styles.jobCard} data-tone={STATUS_TONE[s.status]}>
                  <div className={styles.jobTop}>
                    <Link to={`/services/${s.id}`} className={styles.jobNo}>
                      {s.serviceNo}
                    </Link>
                    <button
                      type="button"
                      className={styles.statusBtn}
                      onClick={() => {
                        setStatusTarget(s);
                        setStatusOpen(true);
                      }}
                      title="Klik untuk update status"
                    >
                      <Badge tone={STATUS_TONE[s.status] as 'brand'} dot>
                        {STATUS_LABELS[s.status]}
                      </Badge>
                      <Icon name="pen" aria-hidden />
                    </button>
                  </div>
                  <div className={styles.jobDevice}>
                    <strong>{s.device}</strong>
                    <small>{s.category}</small>
                    {renderPickup(s)}
                  </div>
                  <div className={styles.jobMeta}>
                    <span className={styles.customerName}>
                      <Icon name="user" aria-hidden /> {s.customerName}
                    </span>
                    <span>
                      <Icon name="calendar" aria-hidden /> {fmtDate(localDateOf(s.createdAt))}
                    </span>
                    {s.technicianName && (
                      <span>
                        <Icon name="screwdriver-wrench" aria-hidden /> {s.technicianName}
                      </span>
                    )}
                  </div>
                  <div className={styles.jobFoot}>
                    <span className={styles.jobCost}>
                      {s.finalCost > 0 ? fmtRp(s.finalCost) : <span className={styles.muted}>Belum ada biaya</span>}
                    </span>
                    {isOwner && s.finalCost > 0 && (
                      <span
                        className={styles.jobProfit}
                        data-loss={serviceProfit(s) < 0 ? 'true' : undefined}
                      >
                        Profit {fmtRp(serviceProfit(s))}
                      </span>
                    )}
                    <div className={styles.jobActions}>{renderActions(s)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <ServiceModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={editing}
        services={services}
        customers={customers}
        employees={techs}
        onSaved={() => {}}
      />
      <StatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        service={statusTarget}
        onSaved={() => {}}
      />
      <NotifyModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        service={notifyTarget}
      />
    </div>
  );
}
