import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardBody, Badge, Button, EmptyState, Icon, Mascot } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionRange } from '@/hooks/useCollectionRange';
import { fmtRp } from '@/lib/format';
import { localDateStr, localDateOf, fmtDate } from '@/lib/time';
import {
  computeKpis,
  technicianLeaderboard,
  computeAlerts,
  type Alert,
} from '@/lib/business/dashboard';
import { STATUS_LABELS, STATUS_TONE } from '@/lib/business/services';
import { getTarget } from '@/config/orgConfig';
import { useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { isManager } from '@/config/plans';
import { useT, type TranslationKey } from '@/i18n';
import type { ServiceStatus } from '@/data/types';
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

function monthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function fmtRpInline(value: number): string {
  return fmtRp(value).replace(' ', '\u00a0');
}

export function DashboardPage() {
  const navigate = useNavigate();
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const locale = language === 'en' ? 'en-US' : 'id-ID';
  const me = useSessionStore((s) => s.currentEmployee);
  const isMgr = me ? isManager(me.role) : false;
  const { from, to } = monthRange();

  const servicesQuery = useCollection('services');
  const incomesQuery = useCollectionRange('incomes', 'date', from, to);
  const expensesQuery = useCollectionRange('expenses', 'date', from, to);
  const walletsQuery = useCollection('wallets');
  const inventoryQuery = useCollection('inventory');
  // Hanya baris hari ini yang dipakai (activeStaff) — kunci query-nya sama
  // dengan rail navigasi, jadi keduanya berbagi satu tarikan kecil.
  const attendanceQuery = useCollectionRange('attendance', 'date', localDateStr(), localDateStr());
  const services = servicesQuery.data;
  const incomes = incomesQuery.data;
  const expenses = expensesQuery.data;
  const wallets = walletsQuery.data;
  const inventory = inventoryQuery.data;
  const attendance = attendanceQuery.data;

  const queryStates = [
    servicesQuery,
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
    await Promise.allSettled([
      servicesQuery.refetch(),
      incomesQuery.refetch(),
      expensesQuery.refetch(),
      walletsQuery.refetch(),
      inventoryQuery.refetch(),
      attendanceQuery.refetch(),
    ]);
  };

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const target = getTarget();
  const kpis = useMemo(
    () => computeKpis(services, incomes, expenses, wallets, from, to),
    [services, incomes, expenses, wallets, from, to],
  );
  const leaderboard = useMemo(() => technicianLeaderboard(services), [services]);
  const alerts = useMemo(() => computeAlerts(services, inventory), [services, inventory]);
  const recent = useMemo(
    () => [...services].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [services],
  );
  const revenuePct = target.revenue > 0 ? Math.min(100, (kpis.revenue / target.revenue) * 100) : 0;
  const servicePct = target.serviceCount > 0
    ? Math.min(100, (kpis.unitsIn / target.serviceCount) * 100)
    : 0;
  const empty = services.length === 0;
  const maxRev = Math.max(1, ...leaderboard.map((tech) => tech.revenue));

  const today = localDateStr();
  const activeStaff = attendance.filter(
    (entry) => entry.date === today && !!entry.checkIn && !entry.checkOut,
  ).length;
  const clock = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const updatedTime = oldestUpdatedAt
    ? new Date(oldestUpdatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
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
  const profitState = kpis.netProfit > 0 ? 'ok' : kpis.netProfit < 0 ? 'crit' : 'warn';
  const margin = kpis.revenue > 0 ? (kpis.netProfit / kpis.revenue) * 100 : 0;
  const costRatio = kpis.revenue > 0 ? (kpis.expense / kpis.revenue) * 100 : 0;
  const hasTarget = (isMgr && target.revenue > 0) || target.serviceCount > 0;

  return (
    <div className={styles.wrap} aria-busy={initialLoading || refreshing}>
      <section className={styles.console} aria-label={t('dashboard.consoleAria')}>
        <div className={styles.consoleBrand}>
          <div className={styles.consoleMascot}>
            <Mascot variant="face" size={30} animated={false} className={styles.consoleMascotImg} />
          </div>
          <div className={styles.consoleBrandText}>
            <span className={styles.consolePulse} aria-hidden />
            <span className={styles.consoleTitle}>{t('dashboard.console')}</span>
          </div>
        </div>
        <div className={styles.consoleReadouts}>
          <div className={[styles.consoleItem, styles.consoleDate].join(' ')}>
            <span className={styles.consoleKey}>{t('common.date')}</span>
            <span className={styles.consoleVal}>{dateStr}</span>
          </div>
          <div className={styles.consoleItem}>
            <span className={styles.consoleKey}>{t('dashboard.staffPresent')}</span>
            <span className={styles.consoleVal}>
              {initialLoading ? '—' : `${activeStaff} ${t('dashboard.people')}`}
            </span>
          </div>
          <div className={styles.consoleItem}>
            <span className={styles.consoleKey}>{t('dashboard.time')}</span>
            <span className={[styles.consoleVal, styles.consoleClock].join(' ')}>{clock}</span>
          </div>
          <div className={[styles.consoleItem, styles.consoleData].join(' ')} role="status" aria-live="polite">
            <span className={styles.consoleKey}>{t('dashboard.data')}</span>
            <span className={[styles.consoleVal, criticalError ? styles.consoleFault : ''].join(' ')}>
              {dataStatus}
            </span>
          </div>
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
          <section
            className={[styles.hero, styles[profitState]].join(' ')}
            aria-label={t('dashboard.netProfitAria')}
            hidden={!isMgr}
            style={isMgr ? undefined : { display: 'none' }}
          >
            <div className={styles.heroScreen}>
              <span className={styles.heroScan} aria-hidden />
              <div className={styles.heroMain}>
                <span className={styles.heroLabel}>
                  <span className={styles.heroLed} aria-hidden />
                  {t('dashboard.netProfit')}
                </span>
                <span className={styles.heroValue}>{fmtRpInline(kpis.netProfit)}</span>
                <span className={styles.heroTag}>
                  {kpis.netProfit >= 0 ? t('dashboard.surplus') : t('dashboard.deficit')}
                </span>
              </div>
              <div className={styles.heroAside}>
                <div className={styles.heroStat}>
                  <span className={styles.heroStatKey}>{t('dashboard.margin')}</span>
                  <span className={styles.heroStatVal}>{margin.toFixed(1)}%</span>
                </div>
                <div className={styles.heroStat}>
                  <span className={styles.heroStatKey}>{t('dashboard.costRatio')}</span>
                  <span className={styles.heroStatVal}>{costRatio.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </section>

          <Card glass className={styles.actionCard}>
            <CardHeader icon={<Icon name="list-check" aria-hidden />} title={t('dashboard.actionsTitle')} />
            <CardBody className={styles.noPad}>
              {alerts.length === 0 ? (
                <div className={styles.allClear}>
                  <span className={styles.allClearIcon}><Icon name="circle-check" aria-hidden /></span>
                  <span>
                    <strong>{t('dashboard.allClear')}</strong>
                    <small>{t('dashboard.allClearDescription')}</small>
                  </span>
                </div>
              ) : (
                <ul className={styles.alertList}>
                  {alerts.map((alert) => {
                    const copy = ALERT_COPY[alert.kind];
                    const message = `${alert.count} ${t(copy.message)}`;
                    const action = t(copy.action);
                    return (
                      <li key={alert.kind}>
                        <Link
                          className={styles.alertItem}
                          to={alert.href}
                          aria-label={`${message}. ${action}`}
                        >
                          <span className={[styles.alertIcon, styles[alert.tone]].join(' ')}>
                            <Icon name={alert.icon} aria-hidden />
                          </span>
                          <span className={styles.alertCopy}>
                            <strong>{message}</strong>
                            <small>{action}</small>
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

          <section className={styles.metrics} aria-label={t('dashboard.metricsAria')}>
            <Metric label={t('dashboard.unitsIn')} value={kpis.unitsIn} unit={t('dashboard.thisMonth')} icon={<Icon name="download" aria-hidden />} tone="brand" />
            <Metric label={t('dashboard.unfinished')} value={kpis.unitsPending} unit={t('dashboard.inQueue')} icon={<Icon name="screwdriver-wrench" aria-hidden />} tone="warning" />
            {isMgr && (
              <>
                <Metric label={t('dashboard.revenue')} value={fmtRpInline(kpis.revenue)} unit={t('dashboard.thisMonth')} icon={<Icon name="arrow-trend-up" aria-hidden />} tone="success" />
                <Metric label={t('dashboard.expense')} value={fmtRpInline(kpis.expense)} unit={t('dashboard.thisMonth')} icon={<Icon name="arrow-trend-down" aria-hidden />} tone="danger" />
                <Metric label={t('dashboard.totalBalance')} value={fmtRpInline(kpis.totalWallet)} unit={t('dashboard.allWallets')} icon={<Icon name="wallet" aria-hidden />} tone="info" />
              </>
            )}
          </section>

          <div className={[styles.grid, !hasTarget ? styles.gridSingle : ''].join(' ')}>
            <Card glass>
              <CardHeader
                icon={<Icon name="clock" aria-hidden />}
                title={t('dashboard.recentServices')}
                action={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/services')}>
                    {t('dashboard.viewAll')}
                  </Button>
                }
              />
              <CardBody className={styles.noPad}>
                {empty ? (
                  <EmptyState
                    icon={<Icon name="inbox" aria-hidden />}
                    title={t('dashboard.noServices')}
                    description={t('dashboard.noServicesDescription')}
                    action={
                      <Button onClick={() => navigate('/services')} iconLeft={<Icon name="plus" aria-hidden />}>
                        {t('dashboard.newService')}
                      </Button>
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
                <CardHeader icon={<Icon name="bullseye" aria-hidden />} title={t('dashboard.monthlyTarget')} />
                <CardBody>
                  <div className={styles.targets}>
                    {isMgr && target.revenue > 0 && (
                      <Target label={t('dashboard.revenueTarget')} pct={revenuePct} detail={`${fmtRpInline(kpis.revenue)} / ${fmtRpInline(target.revenue)}`} />
                    )}
                    {target.serviceCount > 0 && (
                      <Target label={t('dashboard.serviceTarget')} pct={servicePct} detail={`${kpis.unitsIn} / ${target.serviceCount} ${t('dashboard.units')}`} />
                    )}
                  </div>
                </CardBody>
              </Card>
            )}
          </div>

          <Card glass accent="brand">
            <CardHeader icon={<Icon name="trophy" aria-hidden />} title={t('dashboard.technicianPerformance')} />
            <CardBody className={styles.noPad}>
              {leaderboard.length === 0 ? (
                <EmptyState icon={<Icon name="users" aria-hidden />} title={t('dashboard.noPerformance')} description={t('dashboard.noPerformanceDescription')} />
              ) : (
                <ul className={styles.leaderboard}>
                  {leaderboard.map((tech, index) => {
                    const rank = index + 1;
                    const pct = Math.max(8, (tech.revenue / maxRev) * 100);
                    return (
                      <li key={tech.name} className={styles.leaderItem}>
                        <span className={styles.chan} data-rank={rank}>{rank}</span>
                        <div className={styles.leaderMain}>
                          <div className={styles.leaderTop}>
                            <span className={styles.leaderName}>{tech.name}</span>
                            <span className={styles.leaderStats}>
                              <strong>{tech.completed}</strong> {t('dashboard.completed')} · {fmtRpInline(tech.revenue)}
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

function Target({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  const state = pct >= 100 ? 'ok' : pct >= 60 ? 'warn' : 'live';
  return (
    <div className={styles.targetItem}>
      <div className={styles.targetLabel}>
        <span>{label}</span>
        <span className={[styles.targetPct, styles[state]].join(' ')}>{Math.round(pct)}%</span>
      </div>
      <div className={[styles.gauge, styles[state]].join(' ')}>
        <div className={styles.gaugeFill} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <small className={styles.targetDetail}>{detail}</small>
    </div>
  );
}

function Metric({ label, value, unit, icon, tone }: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon: ReactNode;
  tone: 'brand' | 'warning' | 'success' | 'danger' | 'accent' | 'info';
}) {
  return (
    <div className={[styles.metric, styles[tone]].join(' ')}>
      <div className={styles.metricTop}>
        <span className={styles.metricIcon}>{icon}</span>
        <span className={styles.metricLabel}>
          <span className={styles.metricLed} aria-hidden />
          {label}
        </span>
      </div>
      <span className={styles.metricValue}>{value}</span>
      {unit && <span className={styles.metricUnit}>{unit}</span>}
    </div>
  );
}
