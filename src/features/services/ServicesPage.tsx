import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Card,
  Button,
  Input,
  Badge,
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
import { TicketDoneModal } from './TicketDoneModal';
import type { Service, ServiceStatus } from '@/data/types';
import styles from './ServicesPage.module.css';
import { useT } from '@/i18n';
import { interpolate } from '@/lib/business/notify';

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
  const t = useT();
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
  // `?tech=me` = "Tiket saya" dari panel Meja Saya di Dashboard.
  const [techFilter, setTechFilter] = useState(() => (searchParams.get('tech') === 'me' ? 'me' : 'all'));
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  // `?date=month` = "Unit masuk bulan ini" dari Dashboard.
  const [dateFilter, setDateFilter] = useState<DateFilter>(() =>
    searchParams.get('date') === 'month' ? 'thisMonth' : 'all',
  );
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [stalledOnly, setStalledOnly] = useState(false);
  const [sort, setSort] = useState<ServiceSort>('newest');
  // Tiket tuntas (lunas/batal DAN sudah diambil) ikut tampil menurut urutan
  // tanggal; "Sembunyikan tuntas" menyaringnya saat daftar dipakai sebagai antrean kerja.
  // `?open=1` = "Tiket saya belum tuntas" dari Dashboard.
  const [hideClosed, setHideClosed] = useState(() => searchParams.get('open') === '1');
  // `?new=1` membuka Servis Baru langsung (tombol cepat Dashboard).
  const [editOpen, setEditOpen] = useState(() => searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Service | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Service | null>(null);
  // Panel setelah tiket dibuat / unit diserahkan. Baris daftar dicari lagi saat
  // render supaya nota memakai data terbaru (lunas, garansi).
  const [done, setDone] = useState<{ service: Service; variant: 'intake' | 'handover' } | null>(null);
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
  // Di ponsel teknisi & urutan dilipat ke "Filter lainnya" (CSS); yang aktif ikut dihitung.
  const foldedOnMobile = [showTechFilter && techFilter !== 'all', sort !== 'newest'].filter(Boolean).length;

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
      toast.success(t(nowPicked ? 'services.pickedToast' : 'services.unpickedToast'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('services.pickupFailed'));
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
        <Icon name="circle-check" aria-hidden /> {t('services.pickedUp')}
      </>
    ) : (
      <>
        <Icon name="box" aria-hidden /> {t('services.notPickedUp')}
      </>
    );
    if (!isManager) return <span className={cls}>{content}</span>;
    const action = t(s.pickedUp ? 'services.unpickHint' : 'services.pickHint');
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
      <span className={styles.stallTag} title={t('services.stallHint')}>
        {interpolate(t('services.stalledDays'), { n: String(days) })}
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
      title={t('services.statusHint')}
    >
      <Badge tone={STATUS_TONE[s.status] as 'brand'} dot>
        {t(`statusLabel.${s.status}`)}
      </Badge>
      <Icon name="pen" aria-hidden />
    </button>
  );

  // Biaya, sama di ketiga tampilan: biaya final (plus modal/profit untuk pemilik
  // bila ada modal), atau estimasi berlabel selama biaya final belum ditetapkan.
  const renderCost = (s: Service) => {
    if (s.finalCost <= 0) {
      return s.estimateCost > 0 ? (
        <span className={styles.estimate} title={t('services.estimateHint')}>
          {interpolate(t('services.estimateShort'), { amount: fmtRp(s.estimateCost) })}
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
            <span className={styles.modal} aria-label={interpolate(t('services.modalAria'), { amount: fmtRp(modal) })}>
              -{fmtNumber(modal)}
            </span>
            <span
              className={styles.profit}
              data-loss={profit < 0 ? 'true' : undefined}
              aria-label={interpolate(t('services.profitAria'), { amount: fmtRp(profit) })}
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
        title={t('services.viewTicket')}
        aria-label={t('services.viewTicket')}
      >
        <Icon name="up-right-from-square" aria-hidden />
      </Link>
      <button
        className={styles.iconBtn}
        onClick={() => {
          setNotifyTarget(s);
          setNotifyOpen(true);
        }}
        title={t('services.notifyReceipt')}
        aria-label={t('services.notifyReceipt')}
      >
        <Icon name="whatsapp" aria-hidden />
      </button>
      <button
        className={styles.iconBtn}
        onClick={() => {
          setEditing(s);
          setEditOpen(true);
        }}
        title={t('common.edit')}
        aria-label={t('common.edit')}
      >
        <Icon name="pen" aria-hidden />
      </button>
    </>
  );

  return (
    <div className={styles.wrap}>
      <ConfirmDialog
        open={!!pickupConfirm}
        title={t('services.unpaidTitle')}
        message={
          pickupConfirm
            ? interpolate(t('services.unpaidMsg'), {
                no: pickupConfirm.serviceNo,
                amount: fmtRp(outstandingBalance(pickupConfirm)),
              })
            : ''
        }
        confirmLabel={t('services.unpaidConfirm')}
        onCancel={() => setPickupConfirm(null)}
        onConfirm={() => {
          const s = pickupConfirm;
          setPickupConfirm(null);
          if (s) void togglePickup(s, true);
        }}
      />
      {/* Satu strip readout, bukan lima kartu: di ponsel lima kartu bertumpuk
          mendorong tiket pertama ke bawah navigasi bawah (nol tiket terlihat). */}
      <dl className={styles.readouts}>
        {[
          { label: t('services.statTotal'), value: String(stats.total) },
          { label: t('services.statInProcess'), value: String(stats.inProcess), tone: stats.inProcess > 0 ? 'info' : undefined },
          {
            label: t('services.statAwaiting'),
            value: String(stats.awaitingPickup),
            tone: stats.awaitingPickup > 0 ? 'warning' : undefined,
          },
          { label: t('services.statDone'), value: String(stats.done) },
          // Jumlah biaya final tiket Lunas — bukan "pendapatan" (itu kas masuk per bulan di Dashboard/Keuangan).
          { label: t('services.statPaidValue'), value: fmtRp(stats.lunasValue) },
        ].map((r) => (
          <div key={r.label} className={styles.readout}>
            <dt className={styles.readoutLabel}>
              {r.tone && <span className={styles.readoutLed} data-tone={r.tone} aria-hidden />}
              {r.label}
            </dt>
            <dd className={styles.readoutValue}>{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input
            placeholder={t('services.searchPh')}
            value={query}
            onChange={(e) => change(() => setQuery(e.target.value))}
            iconLeft={<Icon name="magnifying-glass" aria-hidden />}
            aria-label={t('services.searchAria')}
          />
        </div>
        <div className={styles.toolbarActions}>
          <ViewToggle value={view} onChange={chooseView} label={t('services.viewLabel')} />
          <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
            {t('services.new')}
          </Button>
        </div>
      </div>

      <div className={styles.filterBar} role="group" aria-label={t('services.filterAria')} data-more={moreOpen}>
        {showTechFilter && (
          <select
            className={styles.select}
            value={techFilter}
            onChange={(e) => change(() => setTechFilter(e.target.value))}
            aria-label={t('services.filterTech')}
          >
            <option value="all">{t('services.allTechs')}</option>
            {me && <option value="me">{t('services.myTickets')}</option>}
            {activeTechs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
            <option value="none">{t('services.unassigned')}</option>
          </select>
        )}
        <select
          className={styles.select}
          value={sort}
          onChange={(e) => change(() => setSort(e.target.value as ServiceSort))}
          aria-label={t('services.sortAria')}
        >
          <option value="newest">{t('services.sortNewest')}</option>
          <option value="oldest">{t('services.sortOldest')}</option>
        </select>
        <button
          type="button"
          className={[styles.toggle, stalledOnly ? styles.toggleOn : ''].join(' ')}
          aria-pressed={stalledOnly}
          onClick={() => change(() => setStalledOnly((v) => !v))}
          title={t('services.stalledHint')}
        >
          <span className={styles.toggleLed} aria-hidden />
          {t('services.stalled')} <span className={styles.toggleCount}>{stalledCount}</span>
        </button>
        <button
          type="button"
          className={[styles.toggle, hideClosed ? styles.toggleOn : ''].join(' ')}
          aria-pressed={hideClosed}
          onClick={() => change(() => setHideClosed((v) => !v))}
          title={t('services.hideClosedHint')}
        >
          {t('services.hideClosed')} <span className={styles.toggleCount}>{closedCount}</span>
        </button>
        <button
          type="button"
          className={[styles.toggle, moreOpen ? styles.toggleOn : ''].join(' ')}
          aria-expanded={moreOpen}
          aria-controls="servis-filter-lainnya"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <Icon name="sliders" aria-hidden />
          {t('services.moreFilters')}
          {moreActive > 0 && (
            <span className={[styles.toggleCount, styles.desktopCount].join(' ')}>{moreActive}</span>
          )}
          {moreActive + foldedOnMobile > 0 && (
            <span className={[styles.toggleCount, styles.mobileCount].join(' ')}>{moreActive + foldedOnMobile}</span>
          )}
        </button>
        {/* Hanya muncul dari tautan Dashboard "unit menunggu diambil". */}
        {pickupFilter === 'awaiting' && (
          <button
            type="button"
            className={[styles.toggle, styles.toggleOn].join(' ')}
            onClick={() => change(() => setPickupFilter('all'))}
            aria-label={t('services.awaitingOffAria')}
            title={t('services.awaitingOffHint')}
          >
            {t('services.awaiting')} <Icon name="times" aria-hidden />
          </button>
        )}
        {filtersActive && (
          <button type="button" className={styles.resetBtn} onClick={resetFilters}>
            {t('services.resetFilters')}
          </button>
        )}
      </div>

      {moreOpen && (
        <div
          id="servis-filter-lainnya"
          className={styles.morePanel}
          role="group"
          aria-label={t('services.moreFilters')}
        >
          <select
            className={styles.select}
            value={categoryFilter}
            onChange={(e) => change(() => setCategoryFilter(e.target.value))}
            aria-label={t('services.filterDevice')}
          >
            <option value="all">{t('services.allDevices')}</option>
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
            aria-label={t('services.filterDate')}
          >
            <option value="all">{t('services.allDates')}</option>
            <option value="last7">{t('services.last7')}</option>
            <option value="thisMonth">{t('services.thisMonth')}</option>
            <option value="custom">{t('services.pickDates')}</option>
          </select>
          {dateFilter === 'custom' && (
            <span className={styles.dateRange}>
              <input
                type="date"
                className={styles.dateInput}
                value={customFrom}
                onChange={(e) => change(() => setCustomFrom(e.target.value))}
                aria-label={t('services.dateFrom')}
              />
              <span aria-hidden>–</span>
              <input
                type="date"
                className={styles.dateInput}
                value={customTo}
                onChange={(e) => change(() => setCustomTo(e.target.value))}
                aria-label={t('services.dateTo')}
              />
            </span>
          )}
          {/* Terakhir: di ponsel ia mengambil satu baris penuh (lihat .wideSelect). */}
          <select
            className={[styles.select, styles.wideSelect].join(' ')}
            value={paymentFilter}
            onChange={(e) => change(() => setPaymentFilter(e.target.value as PaymentFilter))}
            aria-label={t('services.filterPayment')}
          >
            <option value="all">{t('services.allPayments')}</option>
            <option value="unpaid">{t('services.unpaid')}</option>
            <option value="dp">{t('services.dpUnpaid')}</option>
          </select>
        </div>
      )}

      <CategoryChips
        categories={statusCounts}
        total={filteredExceptStatus.length}
        value={activeStatus}
        onChange={(v) => change(() => setStatusFilter(v as ServiceStatus | 'all'))}
        label={t('services.statusAria')}
        labelOf={(id) => t(`statusLabel.${id as ServiceStatus}`) ?? id}
      />

      <Card glass>
        {loading ? (
          <p className={styles.loading}>
            <Icon name="circle-notch" className="spin" aria-hidden /> {t('services.loading')}
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="screwdriver-wrench" aria-hidden />}
            title={t(visible.length === 0 ? 'services.emptyTitle' : 'services.noResults')}
            description={
              visible.length === 0
                ? t('services.emptyFirst')
                : !filtersActive && hideClosed && closedCount > 0
                  ? t('services.emptyAllClosed')
                  : t('services.emptyFiltered')
            }
            action={
              visible.length === 0 ? (
                <Button onClick={openNew} iconLeft={<Icon name="plus" aria-hidden />}>
                  {t('services.new')}
                </Button>
              ) : filtersActive ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  {t('services.resetFilters')}
                </Button>
              ) : hideClosed && closedCount > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => setHideClosed(false)}>
                  {t('services.showClosed')}
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
                  <span>{t('services.colNo')}</span>
                  {cols.has('customer') && <span>{t('services.colCustomer')}</span>}
                  {cols.has('device') && <span>{t('services.colDevice')}</span>}
                  {cols.has('complaint') && <span>{t('services.colComplaint')}</span>}
                  {cols.has('completionNote') && <span>{t('services.colFix')}</span>}
                  {cols.has('technician') && <span>{t('services.colTech')}</span>}
                </div>
                <span className={styles.rowStatus}>{t('common.status')}</span>
                {cols.has('cost') && <span className={styles.rowCost}>{t('services.colCost')}</span>}
                <span className={styles.rowActions}>{t('common.actions')}</span>
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
                            <b>{t('services.colComplaint')}</b> {s.complaint || '—'}
                          </span>
                        </div>
                      )}
                      {cols.has('completionNote') && (
                        <div className={styles.rowCell} data-seg="completionNote">
                          <span
                            className={[styles.clamp, styles.clamp3].join(' ')}
                            title={s.completionNote || undefined}
                          >
                            <b>{t('services.colFix')}</b> {s.completionNote || '—'}
                          </span>
                        </div>
                      )}
                      {cols.has('technician') && (
                        <div className={styles.rowCell} data-seg="technician">
                          <span className={styles.rowTech} title={t('services.colTech')}>
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
                        <b>{t('services.colComplaint')}</b> {s.complaint}
                      </small>
                    )}
                    {cols.has('completionNote') && s.completionNote && (
                      <small className={styles.jobNote}>
                        <b>{t('services.colFix')}</b> {s.completionNote}
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
                  {t('services.showMore')}
                </Button>
              )}
              <span className={styles.loadMoreHint}>
                {interpolate(t('services.shownOf'), { shown: String(shownRows.length), total: String(rows.length) })}
                {rows.length !== stats.total && interpolate(t('services.totalTail'), { n: String(stats.total) })}
                {hideClosed && closedCount > 0 && interpolate(t('services.closedHiddenTail'), { n: String(closedCount) })}
                {windowed && archive.length === 0 && t(truncated ? 'services.truncatedTail' : 'services.olderTail')}
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
        onSaved={(created) => created && setDone({ service: created, variant: 'intake' })}
      />
      <StatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        service={statusTarget}
        onSaved={() => {}}
        onHandedOver={() => statusTarget && setDone({ service: statusTarget, variant: 'handover' })}
      />
      <TicketDoneModal
        open={!!done}
        onClose={() => setDone(null)}
        service={done ? (services.find((s) => s.id === done.service.id) ?? done.service) : null}
        variant={done?.variant ?? 'intake'}
      />
      <NotifyModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        service={notifyTarget}
      />
    </div>
  );
}
