import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody, Badge, Button, EmptyState, Icon, Mascot } from '@/components/ui';
import { useCollection, useDerivedQuery } from '@/hooks/useCollection';
import { repository } from '@/data';
import { useCollectionRange } from '@/hooks/useCollectionRange';
import { useServiceSummary } from '@/hooks/useServiceSummary';
import { useCategoryProfit } from '@/hooks/useReportData';
import { useNavSignals } from '@/hooks/useNavSignals';
import { fmtRp } from '@/lib/format';
import { localDateStr, localDateOf, fmtDate, monthRange } from '@/lib/time';
import {
  computeKpis,
  computeAlerts,
  serviceMargin,
  monthPace,
  dailyRevenueTarget,
  targetState,
  alertAges,
  type Alert,
} from '@/lib/business/dashboard';
import {
  STATUS_LABELS,
  STATUS_TONE,
  visibleServices,
  isClosedOut,
} from '@/lib/business/services';
import { matchesTechnician } from '@/lib/business/serviceFilters';
import { getTarget } from '@/config/orgConfig';
import { interpolate } from '@/lib/business/notify';
import { useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { isManager } from '@/config/plans';
import { useT, type TranslationKey } from '@/i18n';
import type { Service, ServiceStatus } from '@/data/types';
import styles from './DashboardPage.module.css';

const ALERT_COPY: Record<
  Alert['kind'],
  { message: TranslationKey; action: TranslationKey }
> = {
  confirmation: {
    message: 'dashboard.alert.confirmation',
    action: 'dashboard.alert.openServices',
  },
  'out-of-stock': {
    message: 'dashboard.alert.outOfStock',
    action: 'dashboard.alert.openInventory',
  },
  'low-stock': {
    message: 'dashboard.alert.lowStock',
    action: 'dashboard.alert.openInventory',
  },
  'awaiting-pickup': {
    message: 'dashboard.alert.awaitingPickup',
    action: 'dashboard.alert.openServices',
  },
};

const RECENT_SERVICES = 6;
// Tiket terbuka untuk umur peringatan & "Tiket saya". Kolom daftar (tanpa
// history) saja, jadi ±1 KB per baris.
// ponytail: batas 60 — toko dengan >60 tiket terbuka bisa melewatkan tiket
// tertua; ganti dengan kolom `oldest_*` di service_summary bila itu terjadi.
const OPEN_LIMIT = 60;
const NO_SERVICES: Service[] = [];

type Period = 'today' | 'month';

function fmtRpInline(value: number): string {
  return fmtRp(value).replace(' ', ' ');
}

export function DashboardPage() {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const me = useSessionStore((s) => s.currentEmployee);
  const isMgr = me ? isManager(me.role) : false;
  // Laba = angka Laporan, dan Laporan khusus owner. Admin tetap melihat arus kas.
  const isOwner = me?.role === 'owner';
  const { from, to } = monthRange();
  const today = localDateStr();
  // Pilihan periode diingat per perangkat (dulu kembali ke Hari ini tiap pindah menu).
  const [period, setPeriodState] = useState<Period>(() => {
    try {
      return localStorage.getItem('fixmaster-dash-period') === 'month' ? 'month' : 'today';
    } catch {
      return 'today';
    }
  });
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    try {
      localStorage.setItem('fixmaster-dash-period', p);
    } catch {
      /* penyimpanan diblokir — pilihan tetap berlaku untuk kunjungan ini */
    }
  };

  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  // Dashboard hanya MENAMPILKAN 6 tiket terbaru; hitungan & papan teknisinya
  // datang dari RPC (useServiceSummary di bawah). Dulu halaman ini menarik
  // SELURUH tabel servis untuk 6 baris itu — 338 KB di replika produksi (334
  // tiket), tumbuh ±100 tiket/bulan, dan ditarik ulang di setiap perangkat tiap
  // ada perubahan servis. Dashboard juga halaman pertama setiap kali masuk.
  // Kunci di bawah ['collection','services',…] supaya realtime tetap
  // meng-invalidasi; yang ditarik ulang kini hanya 6 baris.
  const servicesQuery = useDerivedQuery(
    ['collection', 'services', 'dashboardRecent', activeOutletId],
    async () =>
      repository.queryServices
        ? repository.queryServices({ limit: RECENT_SERVICES, visibleOnly: true })
        : visibleServices(await repository.list('services'))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, RECENT_SERVICES),
    NO_SERVICES,
  );
  const openQuery = useDerivedQuery(
    ['collection', 'services', 'dashboardOpen', activeOutletId],
    async () =>
      repository.queryServices
        ? repository.queryServices({ openOnly: true, visibleOnly: true, limit: OPEN_LIMIT })
        : visibleServices(await repository.list('services')).filter((s) => !isClosedOut(s)),
    NO_SERVICES,
  );
  // Hitungan & papan teknisi dari SEMUA tiket; versi hari ini untuk readout konsol.
  const summaryQuery = useServiceSummary(from, to);
  const todaySummaryQuery = useServiceSummary(today, today);
  // Laba servis dari himpunan yang sama dengan Laporan (tiket SELESAI dalam periode).
  const profitMonthQuery = useCategoryProfit(from, to);
  const profitTodayQuery = useCategoryProfit(today, today);
  const incomesQuery = useCollectionRange('incomes', 'date', from, to);
  const expensesQuery = useCollectionRange('expenses', 'date', from, to);
  const walletsQuery = useCollection('wallets');
  const inventoryQuery = useCollection('inventory');
  const { data: outlets } = useCollection('outlets');
  // Hanya baris hari ini yang dipakai (activeStaff) — kunci query-nya sama
  // dengan rail navigasi, jadi keduanya berbagi satu tarikan kecil.
  const attendanceQuery = useCollectionRange('attendance', 'date', today, today);
  // Rel navigasi sudah menghitung tugas tertunda dengan aturan halaman Tugas.
  const signals = useNavSignals();
  const incomes = incomesQuery.data;
  const expenses = expensesQuery.data;
  const wallets = walletsQuery.data;
  const inventory = inventoryQuery.data;
  const attendance = attendanceQuery.data;

  const queryStates = [
    servicesQuery,
    openQuery,
    summaryQuery,
    todaySummaryQuery,
    profitMonthQuery,
    profitTodayQuery,
    incomesQuery,
    expensesQuery,
    walletsQuery,
    inventoryQuery,
    attendanceQuery,
  ];
  const initialLoading = queryStates.some((query) => query.loading);
  const refreshing = queryStates.some((query) => query.refreshing);
  const criticalError = queryStates.find((query) => query.error)?.error ?? null;
  const dataUnavailable = queryStates.some((query) => query.error && query.updatedAt === 0);
  const updateTimes = queryStates.map((query) => query.updatedAt).filter((value) => value > 0);
  const oldestUpdatedAt = updateTimes.length ? Math.min(...updateTimes) : 0;

  const retryDashboard = async () => {
    await Promise.allSettled(queryStates.map((query) => query.refetch()));
  };

  const target = getTarget();
  const range = period === 'today' ? { from: today, to: today } : { from, to };
  const kpis = useMemo(
    () => computeKpis(incomes, expenses, wallets, range.from, range.to),
    [incomes, expenses, wallets, range.from, range.to],
  );
  const monthRevenue = useMemo(
    () => computeKpis(incomes, expenses, wallets, from, to).revenue,
    [incomes, expenses, wallets, from, to],
  );
  const margin = serviceMargin(period === 'today' ? profitTodayQuery.data : profitMonthQuery.data);
  const doneToday = serviceMargin(profitTodayQuery.data).units;
  // Target servis = unit SELESAI bulan ini (yang menghasilkan uang), bukan unit masuk.
  const doneMonth = serviceMargin(profitMonthQuery.data).units;
  const summary = summaryQuery.data;
  const unitsIn = summary?.unitsIn ?? 0;
  const leaderboard = summary?.leaderboard ?? [];
  const open = openQuery.data;
  const ages = useMemo(() => alertAges(open), [open]);
  const alerts = useMemo(
    () => computeAlerts(summary ?? { confirmation: 0, awaitingPickup: 0 }, inventory),
    [summary, inventory],
  );
  // Sama dengan daftar yang ditautnya (/services?tech=me&open=1): tiket saya yang
  // belum tuntas. Dulu hanya "belum selesai" sementara tautannya membuka semua tiket saya.
  const myOpen = me ? open.filter((s) => matchesTechnician(s, 'me', [], me)).length : 0;
  const myAttendance = me ? attendance.find((a) => a.date === today && a.employeeId === me.id) : undefined;
  const taskSignal = signals['/tasks'];
  // Tiket arsip sudah disaring di sumbernya (visibleOnly / visibleServices),
  // supaya yang tampil sama dengan menu Servis saat tautannya diklik.
  const recent = servicesQuery.data;
  // Target berlaku untuk SELURUH usaha: membandingkannya dengan pemasukan satu
  // cabang dulu menghasilkan 2–5% yang tampak seperti toko gagal.
  const branchScoped = !!activeOutletId && outlets.length > 1;
  const activeOutlet = outlets.find((o) => o.id === activeOutletId) ?? null;
  const pace = monthPace();
  const todayRevenue = useMemo(
    () => computeKpis(incomes, expenses, wallets, today, today).revenue,
    [incomes, expenses, wallets, today],
  );
  const dailyNeed = dailyRevenueTarget(target.revenue, monthRevenue - todayRevenue);
  const revenuePct = target.revenue > 0 ? Math.min(100, (monthRevenue / target.revenue) * 100) : 0;
  const servicePct = target.serviceCount > 0
    ? Math.min(100, (doneMonth / target.serviceCount) * 100)
    : 0;
  const empty = recent.length === 0;
  const maxRev = Math.max(1, ...leaderboard.map((tech) => tech.revenue));
  const maxDone = Math.max(1, ...leaderboard.map((tech) => tech.completed));

  const activeStaff = attendance.filter(
    (entry) => entry.date === today && !!entry.checkIn && !entry.checkOut,
  ).length;
  const updatedTime = oldestUpdatedAt
    ? new Date(oldestUpdatedAt).toLocaleTimeString(language === 'en' ? 'en-US' : 'id-ID', { hour: '2-digit', minute: '2-digit' })
    : null;
  const dataStatus = criticalError
    ? t('dashboard.dataStale')
    : initialLoading
      ? t('dashboard.loading')
      : refreshing
        ? t('dashboard.refreshing')
        : updatedTime
          ? `${t('dashboard.updated')} ${updatedTime}`
          : t('dashboard.ready');
  const profitState = kpis.netCashFlow > 0 ? 'ok' : kpis.netCashFlow < 0 ? 'crit' : 'warn';
  const hasTarget = !branchScoped && ((isMgr && target.revenue > 0) || target.serviceCount > 0);
  const dash = initialLoading ? '—' : null;

  return (
    <div className={styles.wrap} aria-busy={initialLoading || refreshing}>
      {/* Konsol: cabang yang sedang dilihat + denyut HARI INI. Dulu berisi tanggal
          dan jam (mengulang jam ponsel) sementara tak satu angka pun milik hari ini. */}
      <section className={styles.console} aria-label={t('dashboard.consoleAria')}>
        <div className={styles.consoleBrand}>
          <div className={styles.consoleMascot}>
            <Mascot variant="face" size={30} animated={false} className={styles.consoleMascotImg} />
          </div>
          <div className={styles.consoleItem}>
            <span className={styles.consoleKey}>{t('dashboard.branch')}</span>
            <span className={styles.consoleVal}>
              {activeOutlet?.name ?? (outlets.length > 1 ? t('dashboard.allBranches') : outlets[0]?.name ?? '—')}
            </span>
          </div>
        </div>
        <span className={styles.consoleToday}>
          <span className={styles.consoleLed} aria-hidden /> {t('dashboard.today')}
        </span>
        <dl className={styles.consoleReadouts}>
          <div className={styles.consoleItem}>
            <dt className={styles.consoleKey}>{t('dashboard.todayIn')}</dt>
            <dd className={styles.consoleNum}>{dash ?? todaySummaryQuery.data?.unitsIn ?? 0}</dd>
          </div>
          <div className={styles.consoleItem}>
            <dt className={styles.consoleKey}>{t('dashboard.todayDone')}</dt>
            <dd className={styles.consoleNum}>{dash ?? doneToday}</dd>
          </div>
          <div className={styles.consoleItem}>
            <dt className={styles.consoleKey}>{t('dashboard.staffPresent')}</dt>
            <dd className={styles.consoleNum}>{dash ?? activeStaff}</dd>
          </div>
        </dl>
        <div className={[styles.consoleItem, styles.consoleData].join(' ')} role="status" aria-live="polite">
          <span className={styles.consoleKey}>{t('dashboard.data')}</span>
          <span className={[styles.consoleVal, criticalError ? styles.consoleFault : ''].join(' ')}>
            {dataStatus}
          </span>
        </div>
        <div className={styles.quick} role="group" aria-label={t('dashboard.quickActions')}>
          <Link className={styles.quickPrimary} to="/services?new=1">
            <Icon name="plus" aria-hidden /> {t('dashboard.newService')}
          </Link>
          <Link className={styles.quickSecondary} to="/pos">
            <Icon name="cart-shopping" aria-hidden /> {t('dashboard.openPos')}
          </Link>
        </div>
      </section>

      {criticalError && (
        <section className={styles.fault} role="alert">
          <span className={styles.faultIcon}>
            <Icon name="triangle-exclamation" aria-hidden />
          </span>
          <div className={styles.faultCopy}>
            <strong>{t('dashboard.errorTitle')}</strong>
            <span>
              {dataUnavailable ? t('dashboard.errorUnavailable') : t('dashboard.errorStale')}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void retryDashboard()}
            loading={initialLoading || refreshing}
            iconLeft={<Icon name="repeat" aria-hidden />}
          >
            {t('dashboard.retry')}
          </Button>
        </section>
      )}

      {initialLoading ? (
        <DashboardLoading label={t('dashboard.loading')} />
      ) : dataUnavailable ? null : (
        <>
          {/* Karyawan: mejanya dulu. Semua: yang perlu ditangani sebelum angka uang. */}
          {!isMgr && (
            <section className={styles.desk} aria-label={t('dashboard.myDesk')}>
              <h2 className={styles.deskTitle}>{t('dashboard.myDesk')}</h2>
              <div className={styles.strip}>
                <DeskCell
                  to="/services?tech=me&open=1"
                  label={t('dashboard.myTickets')}
                  value={String(myOpen)}
                  unit={t('dashboard.myTicketsUnit')}
                  tone={myOpen > 0 ? 'info' : undefined}
                />
                <DeskCell
                  to="/tasks"
                  label={t('dashboard.myTasks')}
                  value={String(taskSignal?.count ?? 0)}
                  unit={t('dashboard.myTasksUnit')}
                  tone={taskSignal?.tone === 'crit' ? 'danger' : taskSignal?.count ? 'warning' : undefined}
                />
                <DeskCell
                  to="/attendance"
                  label={t('dashboard.myAttendance')}
                  value={
                    myAttendance?.checkOut
                      ? t('dashboard.clockedOut').replace('{time}', myAttendance.checkOut)
                      : myAttendance?.checkIn
                        ? t('dashboard.clockedIn').replace('{time}', myAttendance.checkIn)
                        : t('dashboard.notClockedIn')
                  }
                  tone={myAttendance?.checkIn ? 'success' : 'warning'}
                  small
                />
              </div>
            </section>
          )}

          <Card glass>
            <CardHeader icon={<Icon name="list-check" aria-hidden />} title={t('dashboard.actionsTitle')} />
            <CardBody className={styles.noPad}>
              {alerts.length === 0 ? (
                <div className={styles.allClear}>
                  <span className={styles.alertLed} data-tone="success" aria-hidden />
                  <span>
                    <strong>{t('dashboard.allClear')}</strong>
                    <small>{t('dashboard.allClearDescription')}</small>
                  </span>
                </div>
              ) : (
                <ul className={styles.alertList}>
                  {alerts.map((alert) => {
                    const copy = ALERT_COPY[alert.kind];
                    const age = ages[alert.kind];
                    const ageText =
                      age === undefined
                        ? null
                        : age === 0
                          ? t('dashboard.ageToday')
                          : t('dashboard.ageDays').replace('{days}', String(age));
                    const message = t(copy.message);
                    const action = t(copy.action);
                    return (
                      <li key={alert.kind}>
                        <Link
                          className={styles.alertItem}
                          to={alert.href}
                          aria-label={`${alert.count} ${message}${ageText ? `, ${ageText}` : ''}. ${action}`}
                        >
                          <span className={styles.alertLed} data-tone={alert.tone} aria-hidden />
                          <span className={styles.alertCount} data-tone={alert.tone}>{alert.count}</span>
                          <span className={styles.alertCopy}>
                            <strong>{message}</strong>
                            <small>{ageText ? `${ageText} · ${action}` : action}</small>
                          </span>
                          <Icon name="arrow-right" className={styles.alertArrow} aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {isMgr && (
            <section className={[styles.hero, styles[profitState]].join(' ')} aria-label={t('dashboard.netProfitAria')}>
              <div className={styles.heroScreen}>
                <span className={styles.heroScan} aria-hidden />
                <div className={styles.heroMain}>
                  <div className={styles.heroHead}>
                    <span className={styles.heroLabel}>
                      <span className={styles.heroLed} aria-hidden />
                      {t('dashboard.netProfit')}
                    </span>
                    <div className={styles.period} role="group" aria-label={t('dashboard.periodAria')}>
                      {(['today', 'month'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={period === p}
                          className={styles.periodBtn}
                          onClick={() => setPeriod(p)}
                        >
                          {t(p === 'today' ? 'dashboard.today' : 'dashboard.month')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className={styles.heroValue}>{fmtRpInline(kpis.netCashFlow)}</span>
                  <span className={styles.heroTag}>
                    {kpis.netCashFlow > 0
                      ? t('dashboard.surplus')
                      : kpis.netCashFlow < 0
                        ? t('dashboard.deficit')
                        : t('dashboard.even')}
                  </span>
                </div>
                <div className={styles.heroAside}>
                  <Link className={styles.heroStat} to="/finance">
                    <span className={styles.heroStatKey}>{t('dashboard.revenue')}</span>
                    <span className={[styles.heroStatVal, styles.statIn].join(' ')}>{fmtRpInline(kpis.revenue)}</span>
                  </Link>
                  <Link className={styles.heroStat} to="/finance">
                    <span className={styles.heroStatKey}>{t('dashboard.expense')}</span>
                    <span className={[styles.heroStatVal, styles.statOut].join(' ')}>{fmtRpInline(kpis.expense)}</span>
                  </Link>
                  {isOwner && (
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatKey}>{t('dashboard.serviceProfit')}</span>
                    <span className={styles.heroStatVal}>{fmtRpInline(margin.profit)}</span>
                    <span className={styles.heroStatSub}>
                      {margin.pct === null
                        ? t('dashboard.noServiceDone')
                        : t('dashboard.serviceMarginDetail')
                            .replace('{pct}', `${Math.round(margin.pct)}%`)
                            .replace('{units}', String(margin.units))}
                    </span>
                  </div>
                  )}
                </div>
                <p className={styles.heroNote}>{t('dashboard.cashNote')}</p>
              </div>
            </section>
          )}

          {/* Strip readout (Design System), bukan deretan StatCard: tiap angka
              menaut ke daftar yang menjelaskannya. "Dalam proses" memakai definisi
              yang sama dengan readout halaman Servis. */}
          <div className={styles.strip} aria-label={t('dashboard.metricsAria')}>
            <DeskCell to="/services?date=month" label={t('dashboard.unitsIn')} value={String(unitsIn)} unit={t('dashboard.thisMonth')} />
            <DeskCell
              to="/services"
              label={t('dashboard.inProcess')}
              value={String(summary?.inProcess ?? 0)}
              unit={t('dashboard.inProcessUnit')}
              tone={(summary?.inProcess ?? 0) > 0 ? 'info' : undefined}
            />
            {isMgr && (
              <DeskCell
                to="/finance"
                label={t('dashboard.totalBalance')}
                value={fmtRpInline(kpis.totalWallet)}
                unit={activeOutletId ? t('dashboard.orgWide') : t('dashboard.allWallets')}
              />
            )}
          </div>

          <div className={[styles.grid, !hasTarget ? styles.gridSingle : ''].join(' ')}>
            <Card glass>
              <CardHeader
                icon={<Icon name="clock" aria-hidden />}
                title={t('dashboard.recentServices')}
                action={
                  <Link className={styles.viewAll} to="/services">
                    {t('dashboard.viewAll')}
                  </Link>
                }
              />
              <CardBody className={styles.noPad}>
                {empty ? (
                  <EmptyState
                    icon={<Icon name="inbox" aria-hidden />}
                    title={t('dashboard.noServices')}
                    description={t('dashboard.noServicesDescription')}
                    action={
                      <Link className={styles.quickPrimary} to="/services?new=1">
                        <Icon name="plus" aria-hidden /> {t('dashboard.newService')}
                      </Link>
                    }
                  />
                ) : (
                  <ul className={styles.recentList}>
                    {recent.map((service) => (
                      <li key={service.id} className={styles.recentRow}>
                        <Link
                          className={styles.recentItem}
                          to={`/services/${service.id}`}
                          aria-label={`${service.serviceNo}, ${service.device}, ${service.customerName}, ${STATUS_LABELS[service.status as ServiceStatus]}`}
                        >
                          <span className={styles.recentNo}>{service.serviceNo}</span>
                          <span className={styles.recentDetail}>
                            <strong>{service.device}</strong>
                            <small>{service.customerName} · {fmtDate(localDateOf(service.createdAt))}</small>
                          </span>
                          <Badge tone={STATUS_TONE[service.status] as 'brand'} dot>
                            {STATUS_LABELS[service.status as ServiceStatus]}
                          </Badge>
                          <Icon name="arrow-right" className={styles.recentArrow} aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {hasTarget && (
              <Card glass>
                <CardHeader
                  icon={<Icon name="bullseye" aria-hidden />}
                  title={t('dashboard.monthlyTarget')}
                  action={
                    me?.role === 'owner' ? (
                      <Link className={styles.viewAll} to="/settings?tab=usaha">
                        {t('dashboard.editTarget')}
                      </Link>
                    ) : undefined
                  }
                />
                <CardBody>
                  <div className={styles.targets}>
                    {isMgr && target.revenue > 0 && (
                      <Target
                        label={t('dashboard.revenueTarget')}
                        pct={revenuePct}
                        pace={pace}
                        detail={`${fmtRpInline(monthRevenue)} / ${fmtRpInline(target.revenue)}`}
                      />
                    )}
                    {isMgr && target.revenue > 0 && dailyNeed > 0 && (
                      <Target
                        label={t('dashboard.todayNeed')}
                        pct={Math.min(100, (todayRevenue / dailyNeed) * 100)}
                        detail={`${fmtRpInline(todayRevenue)} / ${fmtRpInline(dailyNeed)} · ${
                          todayRevenue >= dailyNeed
                            ? t('dashboard.todayReached')
                            : interpolate(t('dashboard.todayShort'), { amount: fmtRpInline(dailyNeed - todayRevenue) })
                        }`}
                      />
                    )}
                    {target.serviceCount > 0 && (
                      <Target
                        label={t('dashboard.serviceTarget')}
                        pct={servicePct}
                        pace={pace}
                        detail={`${doneMonth} / ${target.serviceCount} ${t('dashboard.unitsDone')}`}
                      />
                    )}
                  </div>
                </CardBody>
              </Card>
            )}
          </div>

          <Card glass>
            <CardHeader
              icon={<Icon name="trophy" aria-hidden />}
              title={`${t('dashboard.technicianPerformance')} · ${t('dashboard.month').toLowerCase()}`}
            />
            <CardBody className={styles.noPad}>
              {leaderboard.length === 0 ? (
                <EmptyState icon={<Icon name="users" aria-hidden />} title={t('dashboard.noPerformance')} description={t('dashboard.noPerformanceDescription')} />
              ) : (
                <ul className={styles.leaderboard}>
                  {leaderboard.map((tech, index) => {
                    const rank = index + 1;
                    // Karyawan tak melihat keuangan, termasuk pendapatan rekan kerja:
                    // meternya mengikuti jumlah unit selesai.
                    const pct = Math.max(8, isMgr ? (tech.revenue / maxRev) * 100 : (tech.completed / maxDone) * 100);
                    return (
                      <li key={tech.key} className={styles.leaderItem}>
                        <span className={styles.chan} data-rank={rank}>{rank}</span>
                        <div className={styles.leaderMain}>
                          <div className={styles.leaderTop}>
                            <span className={styles.leaderName}>{tech.name}</span>
                            <span className={styles.leaderStats}>
                              <strong>{tech.completed}</strong> {t('dashboard.completed')}
                              {isMgr && <> · {fmtRpInline(tech.revenue)}</>}
                            </span>
                          </div>
                          <div className={styles.meter}>
                            <div className={styles.meterFill} data-rank={rank} style={{ transform: `scaleX(${pct / 100})` }} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function DashboardLoading({ label }: { label: string }) {
  return (
    <section className={styles.loadingPanel} role="status" aria-live="polite">
      <div className={styles.loadingHead}>
        <Icon name="circle-notch" className="spin" aria-hidden />
        <span>{label}</span>
      </div>
      <div className={styles.loadingReadout} aria-hidden><span /><span /><span /></div>
      <div className={styles.loadingMetrics} aria-hidden><span /><span /><span /></div>
    </section>
  );
}

/**
 * Gauge target dengan penanda LAJU bulan: warnanya menyatakan jarak ke laju.
 * Tanpa `pace` (target harian) tak ada laju yang dikejar — hanya tercapai/belum.
 */
function Target({ label, pct, pace, detail }: { label: string; pct: number; pace?: number; detail: string }) {
  const t = useT();
  const state = pace === undefined ? (pct >= 100 ? 'ok' : 'on') : targetState(pct, pace);
  const pacePct = `${Math.round((pace ?? 0) * 100)}%`;
  return (
    <div className={styles.targetItem}>
      <div className={styles.targetLabel}>
        <span>{label}</span>
        <span className={[styles.targetPct, styles[state]].join(' ')}>{Math.round(pct)}%</span>
      </div>
      <div className={[styles.gauge, styles[state]].join(' ')}>
        <div className={styles.gaugeFill} style={{ transform: `scaleX(${pct / 100})` }} />
        {pace !== undefined && <span className={styles.paceTick} style={{ left: `${pace * 100}%` }} aria-hidden />}
      </div>
      <small className={styles.targetDetail}>
        {detail}
        {pace !== undefined && (
          <>
            {' · '}
            <span className={state === 'behind' ? styles.paceBehind : undefined}>
              {t(state === 'behind' ? 'dashboard.targetBehind' : 'dashboard.targetOn').replace('{pace}', pacePct)}
            </span>
          </>
        )}
      </small>
    </div>
  );
}

function DeskCell({ to, label, value, unit, tone, small }: {
  to: string;
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  small?: boolean;
}) {
  return (
    <Link className={styles.cell} to={to}>
      <span className={styles.cellLabel}>
        {tone && <span className={styles.alertLed} data-tone={tone} aria-hidden />}
        {label}
      </span>
      <span className={[styles.cellValue, small ? styles.cellValueSm : ''].join(' ')}>{value}</span>
      {unit && <span className={styles.cellUnit}>{unit}</span>}
    </Link>
  );
}
