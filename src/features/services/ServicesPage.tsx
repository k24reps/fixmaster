import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Card,
  Button,
  Input,
  Badge,
  StatCard,
  EmptyState,
  Icon,
  CategoryChips,
  ViewToggle,
  usePersistedView,
  ConfirmDialog,
} from '@/components/ui';
import { repository } from '@/data';
import { useCollection, useDerivedQuery } from '@/hooks/useCollection';
import { useServiceSummary } from '@/hooks/useServiceSummary';
import { SERVICE_LIST_CAP, useServiceArchive } from '@/hooks/useServiceArchive';
import { useSessionStore } from '@/stores/session';
import { toast } from '@/stores/toast';
import { fmtNumber, fmtRp } from '@/lib/format';
import { addDays, fmtDate, localDateOf, localDateStr, localDayStartISO, monthRange } from '@/lib/time';
import { serviceSummary } from '@/lib/business/dashboard';
import {
  STATUS_LABELS,
  STATUS_TONE,
  visibleServices,
  isAwaitingPickup,
  serviceProfit,
  serviceModalTotal,
  isClosedOut,
  outstandingBalance,
} from '@/lib/business/services';
import { resolveServiceColumns } from '@/lib/business/serviceColumns';
import {
  compareServices,
  createdRange,
  matchesPayment,
  matchesQuery,
  matchesTechnician,
  stalledDays,
  type DateFilter,
  type PaymentFilter,
  type ServiceSort,
} from '@/lib/business/serviceFilters';
import { getCategories } from '@/config/orgConfig';
import { ServiceModal } from './ServiceModal';
import { StatusModal } from './StatusModal';
import { NotifyModal } from './NotifyModal';
import type { Service, ServiceStatus } from '@/data/types';
import styles from './ServicesPage.module.css';

/**
 * Baris yang dirender sekaligus. Sebelumnya halaman ini menggambar SELURUH
 * tiket sejak toko berdiri — untuk bengkel yang sudah lama jalan itu ribuan
 * baris, dan browser-nya tersendat. Pola tombol "Tampilkan lebih banyak" sama
 * dengan Keuangan (FinancePage); potongannya 50, bukan 100, karena satu tiket
 * servis jauh lebih padat daripada satu baris transaksi.
 */
const PAGE_SIZE = 50;

/**
 * Jendela daftar "panas" di cloud: SEMUA tiket yang belum tuntas (berapa pun
 * umurnya, supaya selalu terpantau) plus yang tuntas dalam N hari terakhir.
 * Tiket tuntas adalah riwayat beku yang dulu ditarik ulang utuh di setiap
 * perangkat tiap ada perubahan servis, sehingga ongkosnya tumbuh seiring umur
 * toko. Dengan jendela, ongkosnya mengikuti laju tiket masuk toko itu sendiri,
 * bukan umurnya. Tiket lama tetap ditemukan lewat pencarian, filter tanggal,
 * dan riwayat pelanggan (useServiceArchive).
 */
const SERVICE_WINDOW_DAYS = 31;
const NO_WINDOW: { rows: Service[]; truncated: boolean } = { rows: [], truncated: false };

export function ServicesPage() {
  const [searchParams] = useSearchParams();
  // Cloud: daftar berjendela. Batasnya awal hari lokal, jadi kuncinya hanya
  // berganti sekali sehari. Lokal/demo: daftar lengkap — tidak ada ongkos
  // egress di sana. Kunci di bawah ['collection','services',…] supaya realtime
  // tetap meng-invalidasi.
  // Dua kueri, bukan satu `or`: tiap kueri mentok max_rows PostgREST (1.000).
  // Dengan satu kueri berurut created_at, toko yang ramai akan kehilangan
  // tiket BELUM tuntas yang paling tua lebih dulu — justru yang harus terpantau.
  const windowed = !!repository.queryServices;
  const activeOutlet = useSessionStore((s) => s.activeOutletId);
  const windowStart = localDayStartISO(addDays(localDateStr(), -SERVICE_WINDOW_DAYS));
  const { data: windowData, loading } = useDerivedQuery(
    ['collection', 'services', 'window', activeOutlet, windowStart],
    async () => {
      if (!repository.queryServices) return { rows: await repository.list('services'), truncated: false };
      const [open, closed] = await Promise.all([
        repository.queryServices({ openOnly: true, limit: SERVICE_LIST_CAP }),
        repository.queryServices({ closedSince: windowStart, limit: SERVICE_LIST_CAP }),
      ]);
      return {
        rows: [...open, ...closed],
        truncated: open.length >= SERVICE_LIST_CAP || closed.length >= SERVICE_LIST_CAP,
      };
    },
    NO_WINDOW,
  );
  const services = windowData.rows;
  const truncated = windowData.truncated;
  const { data: employees } = useCollection('employees');
  const sessionEmployees = useSessionStore((s) => s.employees);
  const techs = employees.length ? employees : sessionEmployees;
  const me = useSessionStore((s) => s.currentEmployee);
  const role = me?.role;
  const isOwner = role === 'owner';
  const isManager = role === 'owner' || role === 'admin';

  const [query, setQuery] = useState('');
  const requestedStatus = searchParams.get('status');
  const initialStatus = (Object.keys(STATUS_LABELS) as ServiceStatus[]).includes(
    requestedStatus as ServiceStatus,
  )
    ? (requestedStatus as ServiceStatus)
    : 'all';
  // Tidak ada lagi select Pengambilan; `?pickup=awaiting` tetap dihormati karena
  // alert "unit menunggu diambil" di Dashboard menaut ke sana (lihat dashboard.ts).
  const initialPickup = searchParams.get('pickup') === 'awaiting' ? 'awaiting' : 'all';
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'all'>(initialStatus);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pickupFilter, setPickupFilter] = useState<'all' | 'awaiting'>(initialPickup);
  const [moreOpen, setMoreOpen] = useState(false);
  // Daftar = tabel (tetap jatuh ke kartu bila tak muat), Kartu, atau Ringkas.
  const [view, chooseView] = usePersistedView('fixmaster-services-view', 'list');
  const [techFilter, setTechFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [stalledOnly, setStalledOnly] = useState(false);
  const [sort, setSort] = useState<ServiceSort>('newest');
  // Tiket tuntas (lunas/batal DAN sudah diambil) ikut tampil menurut urutan
  // tanggal; "Sembunyikan tuntas" menyaringnya saat daftar dipakai sebagai antrean kerja.
  const [hideClosed, setHideClosed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Service | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState<Service | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pickupConfirm, setPickupConfirm] = useState<Service | null>(null);

  // Subscribe to the org slice so the category filter reflects cloud-synced
  // edits (and updates from other devices) without a manual reload.
  const orgCategories = useSessionStore((s) => s.org?.settings?.deviceCategories);
  const categories = orgCategories ?? getCategories();
  // Kolom yang dipilih toko di Pengaturan > Operasional (tersinkron antar perangkat).
  const savedColumns = useSessionStore((s) => s.org?.settings?.serviceColumns);
  const cols = useMemo(() => new Set(resolveServiceColumns(savedColumns)), [savedColumns]);

  const today = localDateStr();
  // Tiket di luar daftar yang dimuat ditanyakan ke server saat dicari (≥3 huruf)
  // atau saat rentang tanggal menjangkau sebelum batasnya, lalu digabung.
  // SETIAP tiket yang DIBUAT dalam jendela pasti termuat, karena updated_at tak
  // mungkin lebih tua dari created_at — jadi batasnya adalah awal jendela. Kalau
  // salah satu kueri terpotong, jaminan itu gugur: setiap rentang tanggal
  // ditanyakan ke server.
  const dateRange = createdRange(dateFilter, today, { from: customFrom, to: customTo });
  const oldestLoaded = truncated ? Infinity : Date.parse(windowStart);
  const archive = useServiceArchive({
    enabled: windowed,
    term: query,
    range: dateRange && Date.parse(localDayStartISO(dateRange.from)) < oldestLoaded ? dateRange : null,
  });
  const allServices = useMemo(() => {
    if (archive.length === 0) return services;
    const loaded = new Set(services.map((s) => s.id));
    return [...services, ...archive.filter((s) => !loaded.has(s.id))];
  }, [services, archive]);
  const visible = useMemo(() => visibleServices(allServices), [allServices]);

  // Hitungan dari SEMUA tiket — daftar cloud maks 1000 tiket terbaru, jadi
  // dihitung server (service_summary, 0063). Selama dimuat, pakai daftar yang ada.
  const { from: monthFrom, to: monthTo } = monthRange();
  const summaryQuery = useServiceSummary(monthFrom, monthTo);
  const stats = useMemo(
    () => summaryQuery.data ?? serviceSummary(services, monthFrom, monthTo),
    [summaryQuery.data, services, monthFrom, monthTo],
  );

  const closedCount = useMemo(() => visible.filter(isClosedOut).length, [visible]);
  const stalledCount = useMemo(
    () => visible.filter((s) => !isClosedOut(s) && stalledDays(s, today) !== null).length,
    [visible, today],
  );

  // Semua filter KECUALI status — dasar hitungan chip status, supaya angka di
  // chip selalu berarti "yang akan tampil kalau chip ini dipilih".
  const filteredExceptStatus = useMemo(() => {
    const range = createdRange(dateFilter, today, { from: customFrom, to: customTo });
    return visible
      .filter((s) => !hideClosed || !isClosedOut(s))
      .filter((s) => categoryFilter === 'all' || s.category === categoryFilter)
      .filter((s) => pickupFilter === 'all' || isAwaitingPickup(s))
      .filter((s) => matchesTechnician(s, techFilter, techs, me))
      .filter((s) => matchesPayment(s, paymentFilter))
      .filter((s) => {
        if (!range) return true;
        const created = localDateOf(s.createdAt);
        return created >= range.from && created <= range.to;
      })
      .filter((s) => !stalledOnly || stalledDays(s, today) !== null)
      .filter((s) => matchesQuery(s, query));
  }, [
    visible,
    hideClosed,
    pickupFilter,
    categoryFilter,
    techFilter,
    techs,
    me,
    paymentFilter,
    dateFilter,
    customFrom,
    customTo,
    today,
    stalledOnly,
    query,
  ]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of filteredExceptStatus) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
    return (Object.keys(STATUS_LABELS) as ServiceStatus[])
      .filter((st) => counts.has(st))
      .map((st): [string, number] => [st, counts.get(st) ?? 0]);
  }, [filteredExceptStatus]);
  const activeStatus = statusCounts.some(([st]) => st === statusFilter) ? statusFilter : 'all';

  const rows = useMemo(
    () =>
      filteredExceptStatus
        .filter((s) => activeStatus === 'all' || s.status === activeStatus)
        .sort((a, b) => compareServices(a, b, sort)),
    [filteredExceptStatus, activeStatus, sort],
  );

  const filtersActive =
    query !== '' ||
    activeStatus !== 'all' ||
    categoryFilter !== 'all' ||
    pickupFilter !== 'all' ||
    techFilter !== 'all' ||
    paymentFilter !== 'all' ||
    dateFilter !== 'all' ||
    stalledOnly;

  // Filter yang jarang dipakai tinggal di panel "Filter lainnya"; jumlah yang
  // aktif tampil di tombolnya supaya daftar yang tersaring tak pernah tanpa sebab.
  const moreActive = [categoryFilter !== 'all', paymentFilter !== 'all', dateFilter !== 'all'].filter(
    Boolean,
  ).length;
  // Toko satu orang (mis. paket Solo) tidak butuh filter teknisi.
  const activeTechs = techs.filter((e) => e.active !== false);
  const showTechFilter = activeTechs.length > 1;

  // Setiap perubahan filter kembali ke potongan pertama daftar.
  const change = (apply: () => void) => {
    apply();
    setLimit(PAGE_SIZE);
  };
  const resetFilters = () =>
    change(() => {
      setQuery('');
      setStatusFilter('all');
      setCategoryFilter('all');
      setPickupFilter('all');
      setTechFilter('all');
      setPaymentFilter('all');
      setDateFilter('all');
      setCustomFrom('');
      setCustomTo('');
      setStalledOnly(false);
    });

  // Hanya potongan ini yang dirender. `stats` di atas SENGAJA tetap dihitung
  // dari seluruh tiket, bukan dari sini — kalau tidak, angka
  // "Total Servis"/"Nilai Tiket Lunas" akan berubah mengikuti seberapa banyak
  // baris yang kebetulan sudah dimuat, dan itu laporan yang menyesatkan.
  // Daftar berjendela dirender UTUH (±105 tiket). Potongan 50 baris dibuat untuk
  // ribuan tiket sejak toko berdiri; kini itu hanya terjadi saat hasil arsip ikut
  // digabung (pencarian/rentang lama, maks 1000), jadi potongannya hanya berlaku
  // saat itu.
  const shownRows = useMemo(
    () => (archive.length > 0 ? rows.slice(0, limit) : rows),
    [rows, limit, archive.length],
  );

  // Lajur segmen Daftar dari kolom yang diaktifkan toko, supaya segmen antar
  // baris sejajar tanpa kepala tabel. Urutan = urutan segmen di JSX (nomor dulu).
  const rowTracks = [
    '6.5rem',
    // Penanganan paling lebar (tiga baris ringkasan kerja); nama pelanggan &
    // teknisi pendek dan boleh dua baris, jadi lajurnya lebih sempit.
    cols.has('customer') && 'minmax(0, 0.9fr)',
    cols.has('device') && 'minmax(0, 1fr)',
    cols.has('complaint') && 'minmax(0, 0.9fr)',
    cols.has('completionNote') && 'minmax(0, 1.6fr)',
    cols.has('technician') && 'minmax(0, 0.7fr)',
  ]
    .filter(Boolean)
    .join(' ');

  const openNew = () => {
    setEditing(null);
    setEditOpen(true);
  };

  // Toggle physical collection (manager-only). Mirrors ServiceDetailPage so the
  // list and detail stay consistent; pickup is independent of payment status.
  const togglePickup = async (s: Service, confirmed = false) => {
    // Unit keluar sebelum lunas boleh, tapi harus disengaja.
    if (!s.pickedUp && !confirmed && s.status === 'selesai' && outstandingBalance(s) > 0) {
      setPickupConfirm(s);
      return;
    }
    const now = new Date().toISOString();
    const nowPicked = !s.pickedUp;
    try {
      await repository.patch('services', s.id, {
        pickedUp: nowPicked,
        pickedUpAt: nowPicked ? now : null,
        updatedAt: now,
        history: [
          ...(s.history ?? []),
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
  // Manajer mengklik labelnya untuk menandai/membatalkan pengambilan (dulu tombol
  // ikon terpisah di kolom aksi).
  const renderPickup = (s: Service) => {
    if (!s.pickedUp && !isAwaitingPickup(s)) return null;
    const cls = s.pickedUp ? styles.pickupDone : styles.pickupWait;
    const content = s.pickedUp ? (
      <>
        <Icon name="circle-check" aria-hidden /> Diambil
      </>
    ) : (
      <>
        <Icon name="box" aria-hidden /> Belum diambil
      </>
    );
    if (!isManager) return <span className={cls}>{content}</span>;
    const action = s.pickedUp ? 'Klik untuk membatalkan tanda ambil' : 'Klik untuk menandai sudah diambil';
    return (
      <button
        type="button"
        className={[cls, styles.pickupBtn].join(' ')}
        onClick={() => void togglePickup(s)}
        title={action}
      >
        {content}
      </button>
    );
  };

  // Tiket tuntas tidak pernah ditandai tertahan: tak ada lagi yang ditunggu.
  const renderStall = (s: Service) => {
    const days = isClosedOut(s) ? null : stalledDays(s, today);
    if (days === null) return null;
    return (
      <span className={styles.stallTag} title="Tidak ada aktivitas pada tiket ini">
        Tertahan {days} hari
      </span>
    );
  };

  // Lencana status yang bisa diklik untuk mengubah status; sama di ketiga tampilan.
  const renderStatus = (s: Service) => (
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
  );

  // Biaya, sama di ketiga tampilan: biaya final (plus modal/profit untuk pemilik
  // bila ada modal), atau estimasi berlabel selama biaya final belum ditetapkan.
  const renderCost = (s: Service) => {
    if (s.finalCost <= 0) {
      return s.estimateCost > 0 ? (
        <span className={styles.estimate} title="Estimasi, biaya final belum ditetapkan">
          Est. {fmtRp(s.estimateCost)}
        </span>
      ) : (
        <span className={styles.muted}>—</span>
      );
    }
    const modal = serviceModalTotal(s.spareparts);
    const profit = serviceProfit(s);
    return (
      <>
        <span className={styles.cost}>{fmtRp(s.finalCost)}</span>
        {/* Hanya kalau ada modal. Tanpa sparepart, profit SAMA DENGAN biaya, dan
            sub-baris cuma mengulang angka di atasnya. */}
        {isOwner && modal > 0 && (
          <span className={styles.breakdown}>
            <span className={styles.modal} aria-label={`Modal ${fmtRp(modal)}`}>
              -{fmtNumber(modal)}
            </span>
            <span
              className={styles.profit}
              data-loss={profit < 0 ? 'true' : undefined}
              aria-label={`Profit ${fmtRp(profit)}`}
            >
              {profit >= 0 && '+'}
              {fmtNumber(profit)}
            </span>
          </span>
        )}
      </>
    );
  };

  // Shared action cluster so the list, cards, and tiles stay in sync. Tiga aksi
  // tetap untuk semua tiket; tanda ambil ada di label status ambil (renderPickup).
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
    </>
  );

  return (
    <div className={styles.wrap}>
      <ConfirmDialog
        open={!!pickupConfirm}
        title="Unit belum lunas"
        message={
          pickupConfirm
            ? `${pickupConfirm.serviceNo} masih ada tagihan ${fmtRp(outstandingBalance(pickupConfirm))}. Tandai sudah diambil pelanggan?`
            : ''
        }
        confirmLabel="Ya, sudah diambil"
        onCancel={() => setPickupConfirm(null)}
        onConfirm={() => {
          const s = pickupConfirm;
          setPickupConfirm(null);
          if (s) void togglePickup(s, true);
        }}
      />
      <div className={styles.stats}>
        <StatCard label="Total Servis" value={stats.total} icon={<Icon name="clipboard-list" aria-hidden />} />
        <StatCard label="Dalam Proses" value={stats.inProcess} icon={<Icon name="spinner" aria-hidden />} />
        <StatCard label="Menunggu Diambil" value={stats.awaitingPickup} icon={<Icon name="box" aria-hidden />} />
        <StatCard label="Selesai / Lunas" value={stats.done} icon={<Icon name="check-double" aria-hidden />} />
        {/* Jumlah biaya final tiket Lunas — bukan "pendapatan" (itu kas masuk per bulan di Dashboard/Keuangan). */}
        <StatCard label="Nilai Tiket Lunas" value={fmtRp(stats.lunasValue)} icon={<Icon name="coins" aria-hidden />} />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input
            placeholder="Cari no. servis, pelanggan, no. HP, perangkat, keluhan…"
            value={query}
            onChange={(e) => change(() => setQuery(e.target.value))}
            iconLeft={<Icon name="magnifying-glass" aria-hidden />}
            aria-label="Cari servis"
          />
        </div>
        <div className={styles.toolbarActions}>
          <ViewToggle value={view} onChange={chooseView} label="Tampilan servis" />
          <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
            Servis Baru
          </Button>
        </div>
      </div>

      <div className={styles.filterBar} role="group" aria-label="Filter servis">
        {showTechFilter && (
          <select
            className={styles.select}
            value={techFilter}
            onChange={(e) => change(() => setTechFilter(e.target.value))}
            aria-label="Filter teknisi"
          >
            <option value="all">Semua Teknisi</option>
            {me && <option value="me">Tiket saya</option>}
            {activeTechs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
            <option value="none">Belum ditugaskan</option>
          </select>
        )}
        <select
          className={styles.select}
          value={sort}
          onChange={(e) => change(() => setSort(e.target.value as ServiceSort))}
          aria-label="Urutkan servis"
        >
          <option value="newest">Terbaru</option>
          <option value="oldest">Terlama dulu</option>
        </select>
        <button
          type="button"
          className={[styles.toggle, stalledOnly ? styles.toggleOn : ''].join(' ')}
          aria-pressed={stalledOnly}
          onClick={() => change(() => setStalledOnly((v) => !v))}
          title="Konfirmasi biaya ≥ 2 hari, dikerjakan ≥ 3 hari, atau belum diambil ≥ 7 hari tanpa aktivitas"
        >
          <span className={styles.toggleLed} aria-hidden />
          Tertahan <span className={styles.toggleCount}>{stalledCount}</span>
        </button>
        <button
          type="button"
          className={[styles.toggle, hideClosed ? styles.toggleOn : ''].join(' ')}
          aria-pressed={hideClosed}
          onClick={() => change(() => setHideClosed((v) => !v))}
          title="Sembunyikan tiket lunas atau batal yang barangnya sudah diambil"
        >
          Sembunyikan tuntas <span className={styles.toggleCount}>{closedCount}</span>
        </button>
        <button
          type="button"
          className={[styles.toggle, moreOpen ? styles.toggleOn : ''].join(' ')}
          aria-expanded={moreOpen}
          aria-controls="servis-filter-lainnya"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <Icon name="sliders" aria-hidden />
          Filter lainnya
          {moreActive > 0 && <span className={styles.toggleCount}>{moreActive}</span>}
        </button>
        {/* Hanya muncul dari tautan Dashboard "unit menunggu diambil". */}
        {pickupFilter === 'awaiting' && (
          <button
            type="button"
            className={[styles.toggle, styles.toggleOn].join(' ')}
            onClick={() => change(() => setPickupFilter('all'))}
            aria-label="Lepas filter menunggu diambil"
            title="Filter dari Dashboard — klik untuk melepas"
          >
            Menunggu diambil <Icon name="times" aria-hidden />
          </button>
        )}
        {filtersActive && (
          <button type="button" className={styles.resetBtn} onClick={resetFilters}>
            Reset filter
          </button>
        )}
      </div>

      {moreOpen && (
        <div
          id="servis-filter-lainnya"
          className={styles.morePanel}
          role="group"
          aria-label="Filter lainnya"
        >
          <select
            className={styles.select}
            value={categoryFilter}
            onChange={(e) => change(() => setCategoryFilter(e.target.value))}
            aria-label="Filter perangkat"
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
            value={dateFilter}
            onChange={(e) => change(() => setDateFilter(e.target.value as DateFilter))}
            aria-label="Filter tanggal masuk"
          >
            <option value="all">Semua Tanggal</option>
            <option value="last7">7 hari terakhir</option>
            <option value="thisMonth">Bulan ini</option>
            <option value="custom">Pilih tanggal…</option>
          </select>
          {dateFilter === 'custom' && (
            <span className={styles.dateRange}>
              <input
                type="date"
                className={styles.dateInput}
                value={customFrom}
                onChange={(e) => change(() => setCustomFrom(e.target.value))}
                aria-label="Tanggal masuk dari"
              />
              <span aria-hidden>–</span>
              <input
                type="date"
                className={styles.dateInput}
                value={customTo}
                onChange={(e) => change(() => setCustomTo(e.target.value))}
                aria-label="Tanggal masuk sampai"
              />
            </span>
          )}
          {/* Terakhir: di ponsel ia mengambil satu baris penuh (lihat .wideSelect). */}
          <select
            className={[styles.select, styles.wideSelect].join(' ')}
            value={paymentFilter}
            onChange={(e) => change(() => setPaymentFilter(e.target.value as PaymentFilter))}
            aria-label="Filter pembayaran"
          >
            <option value="all">Semua Pembayaran</option>
            <option value="unpaid">Belum lunas</option>
            <option value="dp">Sudah DP, belum lunas</option>
          </select>
        </div>
      )}

      <CategoryChips
        categories={statusCounts}
        total={filteredExceptStatus.length}
        value={activeStatus}
        onChange={(v) => change(() => setStatusFilter(v as ServiceStatus | 'all'))}
        label="Status servis"
        labelOf={(id) => STATUS_LABELS[id as ServiceStatus] ?? id}
      />

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
                : !filtersActive && hideClosed && closedCount > 0
                  ? 'Semua tiket sudah tuntas dan disembunyikan.'
                  : 'Ubah filter atau kata kunci pencarian.'
            }
            action={
              visible.length === 0 ? (
                <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
                  Servis Baru
                </Button>
              ) : filtersActive ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Reset filter
                </Button>
              ) : hideClosed && closedCount > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => setHideClosed(false)}>
                  Tampilkan tiket tuntas
                </Button>
              ) : null
            }
          />
        ) : (
          <div>
            {/* Daftar: satu baris per tiket, konsep sama dengan Inventori & Kasir. */}
            {view === 'list' && (
              <div
                className={styles.rowList}
                style={{ '--row-cols': rowTracks } as CSSProperties}
              >
              {/* Judul kolom: hanya di tata letak lebar, saat segmen berbaris dalam lajur. */}
              <div className={[styles.row, styles.rowHead, cols.has('cost') ? '' : styles.rowNoCost].join(' ')}>
                <div className={styles.rowMain}>
                  <span>No. Servis</span>
                  {cols.has('customer') && <span>Pelanggan</span>}
                  {cols.has('device') && <span>Perangkat</span>}
                  {cols.has('complaint') && <span>Keluhan</span>}
                  {cols.has('completionNote') && <span>Penanganan</span>}
                  {cols.has('technician') && <span>Teknisi</span>}
                </div>
                <span className={styles.rowStatus}>Status</span>
                {cols.has('cost') && <span className={styles.rowCost}>Biaya</span>}
                <span className={styles.rowActions}>Aksi</span>
              </div>
              <ul className={styles.rows}>
                {shownRows.map((s) => (
                  <li
                    key={s.id}
                    className={[styles.row, cols.has('cost') ? '' : styles.rowNoCost].join(' ')}
                  >
                    <div className={styles.rowMain}>
                      {/* Nomor + tanggal masuk: satu identitas tiket, satu segmen. */}
                      <div className={[styles.rowCell, styles.mono].join(' ')} data-seg="id">
                        <Link to={`/services/${s.id}`} className={styles.noLink}>
                          {s.serviceNo}
                        </Link>
                        <small className={styles.sub}>{fmtDate(localDateOf(s.createdAt))}</small>
                      </div>
                      {cols.has('customer') && (
                        <div className={styles.rowCell} data-seg="customer">
                          <strong className={styles.customerName}>{s.customerName}</strong>
                          <small className={styles.sub}>{s.customerPhone}</small>
                        </div>
                      )}
                      {cols.has('device') && (
                        <div className={styles.rowCell} data-seg="device">
                          <span className={styles.rowTitle} title={s.device || undefined}>
                            {s.device}
                          </span>
                          <small className={styles.sub}>{s.category}</small>
                          {renderPickup(s)}
                        </div>
                      )}
                      {cols.has('complaint') && (
                        <div className={styles.rowCell} data-seg="complaint">
                          <span className={styles.clamp} title={s.complaint || undefined}>
                            <b>Keluhan</b> {s.complaint || '—'}
                          </span>
                        </div>
                      )}
                      {cols.has('completionNote') && (
                        <div className={styles.rowCell} data-seg="completionNote">
                          <span
                            className={[styles.clamp, styles.clamp3].join(' ')}
                            title={s.completionNote || undefined}
                          >
                            <b>Penanganan</b> {s.completionNote || '—'}
                          </span>
                        </div>
                      )}
                      {cols.has('technician') && (
                        <div className={styles.rowCell} data-seg="technician">
                          <span className={styles.rowTech} title="Teknisi">
                            <Icon name="screwdriver-wrench" aria-hidden />
                            <span>{s.technicianName || '—'}</span>
                          </span>
                        </div>
                      )}
                    </div>
                    <div className={styles.rowStatus}>
                      {renderStatus(s)}
                      {renderStall(s)}
                    </div>
                    {cols.has('cost') && (
                      <div className={styles.rowCost}>{renderCost(s)}</div>
                    )}
                    <div className={styles.rowActions}>{renderActions(s)}</div>
                  </li>
                ))}
              </ul>
              </div>
            )}

            {view === 'cards' && (
            <ul className={styles.cardList}>
              {shownRows.map((s) => (
                <li key={s.id} className={styles.jobCard} data-tone={STATUS_TONE[s.status]}>
                  <div className={styles.jobTop}>
                    <Link to={`/services/${s.id}`} className={styles.jobNo}>
                      {s.serviceNo}
                    </Link>
                    {renderStatus(s)}
                  </div>
                  <div className={styles.jobDevice}>
                    <strong title={s.device || undefined}>{s.device}</strong>
                    <small>{s.category}</small>
                    {renderPickup(s)}
                    {cols.has('complaint') && s.complaint && (
                      <small className={styles.jobNote}>
                        <b>Keluhan</b> {s.complaint}
                      </small>
                    )}
                    {cols.has('completionNote') && s.completionNote && (
                      <small className={styles.jobNote}>
                        <b>Penanganan</b> {s.completionNote}
                      </small>
                    )}
                    {renderStall(s)}
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
                    <div className={styles.jobCost}>{renderCost(s)}</div>
                    <div className={styles.jobActions}>{renderActions(s)}</div>
                  </div>
                </li>
              ))}
            </ul>
            )}

            {/* Ringkas: nomor, status, perangkat, pelanggan, biaya. Keluhan dan
                penanganan sengaja tidak ikut; rinciannya ada di tiket. */}
            {view === 'tiles' && (
              <ul className={styles.tileGrid}>
                {shownRows.map((s) => (
                  <li
                    key={s.id}
                    className={[styles.jobCard, styles.tile].join(' ')}
                    data-tone={STATUS_TONE[s.status]}
                  >
                    <div className={styles.jobTop}>
                      <Link to={`/services/${s.id}`} className={styles.jobNo}>
                        {s.serviceNo}
                      </Link>
                      {renderStatus(s)}
                    </div>
                    <strong className={styles.tileDevice} title={s.device}>
                      {s.device}
                    </strong>
                    <small className={styles.tileSub}>
                      {s.customerName} · {fmtDate(localDateOf(s.createdAt))}
                    </small>
                    {renderPickup(s)}
                    {renderStall(s)}
                    <div className={styles.jobFoot}>
                      <div className={styles.tileCost}>{renderCost(s)}</div>
                      <div className={styles.jobActions}>{renderActions(s)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Satu footer untuk semua tampilan, karena semuanya memakai
                `shownRows` yang sama. */}
            <div className={styles.loadMore}>
              {rows.length > shownRows.length && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  iconLeft={<Icon name="arrow-down" aria-hidden />}
                >
                  Tampilkan lebih banyak
                </Button>
              )}
              <span className={styles.loadMoreHint}>
                {shownRows.length} dari {rows.length} tiket
                {rows.length !== stats.total && ` · ${stats.total} total`}
                {hideClosed && closedCount > 0 && ` · ${closedCount} tuntas disembunyikan`}
                {windowed &&
                  archive.length === 0 &&
                  (truncated
                    ? ' · daftar terpotong 1.000 tiket: cari nomor/nama atau pilih tanggal'
                    : ' · tiket lebih lama: cari nomor/nama atau pilih tanggal')}
              </span>
            </div>
          </div>
        )}
      </Card>

      <ServiceModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={editing}
        services={services}
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
