import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardBody, Badge, Button, EmptyState, Icon, Mascot } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionRange } from '@/hooks/useCollectionRange';
import { fmtRp } from '@/lib/format';
import { localDateStr, localDateOf, fmtDate } from '@/lib/time';
import {
  computeKpis,
  technicianLeaderboard,
  computeAlerts,
} from '@/lib/business/dashboard';
import { STATUS_LABELS, STATUS_TONE } from '@/lib/business/services';
import { getTarget } from '@/config/orgConfig';
import { useSessionStore } from '@/stores/session';
import { isManager } from '@/config/plans';
import type { ServiceStatus } from '@/data/types';
import styles from './DashboardPage.module.css';

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { from, to };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const me = useSessionStore((s) => s.currentEmployee);
  const isMgr = me ? isManager(me.role) : false;
  // Only incomes/expenses (the fastest-growing collections) are date-ranged to
  // the current month here (plan B). services/wallets/inventory stay full: the
  // leaderboard, alerts, recent list, and wallet totals need cross-period data.
  const { from, to } = monthRange();
  const { data: services } = useCollection('services');
  const { data: incomes } = useCollectionRange('incomes', 'date', from, to);
  const { data: expenses } = useCollectionRange('expenses', 'date', from, to);
  const { data: wallets } = useCollection('wallets');
  const { data: inventory } = useCollection('inventory');
  const { data: attendance } = useCollection('attendance');

  // Live clock for the console header (bench-instrument feel).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
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
  const servicePct =
    target.serviceCount > 0 ? Math.min(100, (kpis.unitsIn / target.serviceCount) * 100) : 0;

  const empty = services.length === 0;
  const maxRev = Math.max(1, ...leaderboard.map((t) => t.revenue));

  // Console header values — deliberately info NOT shown in the tiles below.
  const today = localDateStr();
  const activeStaff = attendance.filter(
    (a) => a.date === today && !!a.checkIn && !a.checkOut,
  ).length;
  const clock = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Hero readout — net profit is the centerpiece, so it is removed from the
  // tile grid below to avoid showing the same figure twice.
  const profitState = kpis.netProfit > 0 ? 'ok' : kpis.netProfit < 0 ? 'crit' : 'warn';
  const margin = kpis.revenue > 0 ? (kpis.netProfit / kpis.revenue) * 100 : 0;
  const costRatio = kpis.revenue > 0 ? (kpis.expense / kpis.revenue) * 100 : 0;

  return (
    <div className={styles.wrap}>
      <section className={styles.console} aria-label="Konsol status">
        <div className={styles.consoleBrand}>
          <div className={styles.consoleMascot}>
            <Mascot variant="face" size={30} animated={false} className={styles.consoleMascotImg} />
          </div>
          <div className={styles.consoleBrandText}>
            <span className={styles.consolePulse} aria-hidden />
            <span className={styles.consoleTitle}>BENCH CONSOLE</span>
          </div>
        </div>
        <div className={styles.consoleReadouts}>
          <div className={styles.consoleItem}>
            <span className={styles.consoleKey}>Tanggal</span>
            <span className={styles.consoleVal}>{dateStr}</span>
          </div>
          <div className={styles.consoleItem}>
            <span className={styles.consoleKey}>Teknisi Hadir</span>
            <span className={styles.consoleVal}>{activeStaff} orang</span>
          </div>
          <div className={styles.consoleItem}>
            <span className={styles.consoleKey}>Waktu</span>
            <span className={[styles.consoleVal, styles.consoleClock].join(' ')}>{clock}</span>
          </div>
        </div>
      </section>

      <section
        className={[styles.hero, styles[profitState]].join(' ')}
        aria-label="Laba bersih bulan ini"
        hidden={!isMgr}
        style={isMgr ? undefined : { display: 'none' }}
      >
        <div className={styles.heroScreen}>
          <span className={styles.heroScan} aria-hidden />
          <div className={styles.heroMain}>
            <span className={styles.heroLabel}>
              <span className={styles.heroLed} aria-hidden />
              Laba Bersih · Bulan Ini
            </span>
            <span className={styles.heroValue}>{fmtRp(kpis.netProfit)}</span>
            <span className={styles.heroTag}>{kpis.netProfit >= 0 ? 'SURPLUS' : 'DEFISIT'}</span>
          </div>
          <div className={styles.heroAside}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatKey}>Margin</span>
              <span className={styles.heroStatVal}>{margin.toFixed(1)}%</span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroStatKey}>Rasio Biaya</span>
              <span className={styles.heroStatVal}>{costRatio.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.metrics}>
        <Metric label="Unit Masuk" value={kpis.unitsIn} unit="bulan ini" icon={<Icon name="download" aria-hidden />} tone="brand" />
        <Metric label="Belum Selesai" value={kpis.unitsPending} unit="dalam antrean" icon={<Icon name="screwdriver-wrench" aria-hidden />} tone="warning" />
        {isMgr && (
          <>
            <Metric label="Pemasukan" value={fmtRp(kpis.revenue)} unit="bulan ini" icon={<Icon name="arrow-trend-up" aria-hidden />} tone="success" />
            <Metric label="Pengeluaran" value={fmtRp(kpis.expense)} unit="bulan ini" icon={<Icon name="arrow-trend-down" aria-hidden />} tone="danger" />
            <Metric label="Total Saldo" value={fmtRp(kpis.totalWallet)} unit="semua wallet" icon={<Icon name="wallet" aria-hidden />} tone="info" />
          </>
        )}
      </section>

      {((isMgr && target.revenue > 0) || target.serviceCount > 0) && (
        <Card glass>
          <CardHeader icon={<Icon name="bullseye" aria-hidden />} title="Target Bulanan" />
          <CardBody>
            <div className={styles.targets}>
              {isMgr && target.revenue > 0 && (
                <Target label="Target Pendapatan" pct={revenuePct} detail={`${fmtRp(kpis.revenue)} / ${fmtRp(target.revenue)}`} />
              )}
              {target.serviceCount > 0 && (
                <Target label="Target Servis" pct={servicePct} detail={`${kpis.unitsIn} / ${target.serviceCount} unit`} />
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <div className={styles.grid}>
        <Card glass>
          <CardHeader
            icon={<Icon name="clock" aria-hidden />}
            title="Servis Terbaru"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/services')}>
                Lihat semua
              </Button>
            }
          />
          <CardBody className={styles.noPad}>
            {empty ? (
              <EmptyState
                icon={<Icon name="inbox" aria-hidden />}
                title="Belum ada servis"
                description="Mulai dengan membuat tiket servis pertama."
                action={
                  <Button onClick={() => navigate('/services')} iconLeft={<Icon name="plus" aria-hidden />}>
                    Servis Baru
                  </Button>
                }
              />
            ) : (
              <ul className={styles.recentList}>
                {recent.map((s) => (
                  <li key={s.id} className={styles.recentItem} onClick={() => navigate('/services')}>
                    <span className={styles.recentNo}>{s.serviceNo}</span>
                    <span className={styles.recentDetail}>
                      <strong>{s.device}</strong>
                      <small>
                        {s.customerName} · {fmtDate(localDateOf(s.createdAt))}
                      </small>
                    </span>
                    <Badge tone={STATUS_TONE[s.status] as 'brand'} dot>
                      {STATUS_LABELS[s.status as ServiceStatus]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card glass>
          <CardHeader icon={<Icon name="bell" aria-hidden />} title="Notifikasi" />
          <CardBody className={styles.noPad}>
            {alerts.length === 0 ? (
              <EmptyState
                icon={<Icon name="circle-check" aria-hidden />}
                title="Semua aman"
                description="Tidak ada peringatan saat ini."
              />
            ) : (
              <ul className={styles.alertList}>
                {alerts.map((a, i) => (
                  <li key={i} className={styles.alertItem}>
                    <span className={[styles.alertIcon, styles[a.tone]].join(' ')}>
                      <Icon name={a.icon} aria-hidden />
                    </span>
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card glass accent="brand">
        <CardHeader icon={<Icon name="trophy" aria-hidden />} title="Performa Teknisi" />
        <CardBody className={styles.noPad}>
          {leaderboard.length === 0 ? (
            <EmptyState
              icon={<Icon name="users" aria-hidden />}
              title="Belum ada data"
              description="Leaderboard muncul setelah ada servis selesai dengan teknisi."
            />
          ) : (
            <ul className={styles.leaderboard}>
              {leaderboard.map((t, i) => {
                const rank = i + 1;
                const pct = Math.max(8, (t.revenue / maxRev) * 100);
                return (
                  <li key={t.name} className={styles.leaderItem}>
                    <span className={styles.chan} data-rank={rank}>{rank}</span>
                    <div className={styles.leaderMain}>
                      <div className={styles.leaderTop}>
                        <span className={styles.leaderName}>{t.name}</span>
                        <span className={styles.leaderStats}>
                          <strong>{t.completed}</strong> selesai · {fmtRp(t.revenue)}
                        </span>
                      </div>
                      <div className={styles.meter}>
                        <div className={styles.meterFill} data-rank={rank} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
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
        <div className={styles.gaugeFill} style={{ width: `${pct}%` }} />
      </div>
      <small className={styles.targetDetail}>{detail}</small>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  icon,
  tone,
}: {
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
