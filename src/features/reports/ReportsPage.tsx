import { useMemo, useState, type ReactNode } from 'react';
import { Card, CardHeader, CardBody, EmptyState, Icon, Button } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { fmtRp, fmtPercent } from '@/lib/format';
import { localDateStr, fmtDate, isInRange } from '@/lib/time';
import { summarize } from '@/lib/business/finance';
import { technicianLeaderboard } from '@/lib/business/dashboard';
import { getTarget } from '@/config/orgConfig';
import { useSessionStore } from '@/stores/session';
import { toCsv, downloadCsv } from '@/lib/csv';
import { toast } from '@/stores/toast';
import styles from './ReportsPage.module.css';

function monthRange() {
  const now = new Date();
  return {
    from: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function ReportsPage() {
  const { data: incomes } = useCollection('incomes');
  const { data: expenses } = useCollection('expenses');
  const { data: services } = useCollection('services');
  const { data: sales } = useCollection('sales');
  const { data: outlets } = useCollection('outlets');
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const scopeLabel = activeOutletId
    ? (outlets.find((o) => o.id === activeOutletId)?.name ?? 'Cabang')
    : 'Semua Outlet';

  const [from, setFrom] = useState(monthRange().from);
  const [to, setTo] = useState(monthRange().to);

  const target = getTarget();

  const fIncomes = useMemo(() => incomes.filter((i) => isInRange(i.date, from, to)), [incomes, from, to]);
  const fExpenses = useMemo(() => expenses.filter((e) => isInRange(e.date, from, to)), [expenses, from, to]);
  const fServices = useMemo(
    () => services.filter((s) => isInRange(s.createdAt.slice(0, 10), from, to)),
    [services, from, to],
  );
  const fSales = useMemo(() => sales.filter((s) => isInRange(s.date, from, to) && !s.voided), [sales, from, to]);

  const summary = useMemo(() => summarize(fIncomes, fExpenses), [fIncomes, fExpenses]);
  const leaderboard = useMemo(() => technicianLeaderboard(fServices), [fServices]);

  // Break-even indicator: net profit vs overhead budget (target, not deducted).
  const breakEvenPct = target.overheadBudget > 0 ? summary.net / target.overheadBudget : 0;
  const salesTotal = fSales.reduce((sum, s) => sum + s.total, 0);

  // Export the period's transactions (income + expense) as one CSV, newest
  // first. Scoped to whatever outlet filter is active (data is already scoped).
  const exportCsv = () => {
    const rows = [
      ...fIncomes.map((i) => ({ date: i.date, type: 'Pemasukan', category: i.category, desc: i.description, amount: i.amount })),
      ...fExpenses.map((e) => ({ date: e.date, type: 'Pengeluaran', category: e.category, desc: e.description, amount: -e.amount })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    if (rows.length === 0) {
      toast.error('Tidak ada transaksi pada periode ini');
      return;
    }
    const csv = toCsv(
      ['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal'],
      rows.map((r) => [r.date, r.type, r.category, r.desc, r.amount]),
    );
    downloadCsv(`laporan_${scopeLabel.replace(/\s+/g, '-').toLowerCase()}_${from}_sd_${to}.csv`, csv);
    toast.success(`${rows.length} transaksi diekspor`);
  };

  // Income by category breakdown.
  const incomeByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of fIncomes) map.set(i.category, (map.get(i.category) ?? 0) + i.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [fIncomes]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of fExpenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [fExpenses]);

  const maxIncome = Math.max(1, ...incomeByCategory.map(([, v]) => v));
  const maxExpense = Math.max(1, ...expenseByCategory.map(([, v]) => v));
  const maxLeaderRev = Math.max(1, ...leaderboard.map((t) => t.revenue));

  return (
    <div className={styles.wrap}>
      <Card glass>
        <CardBody>
          <div className={styles.dateBar}>
            <Icon name="calendar-alt" aria-hidden />
            <label>
              Dari
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={styles.dateInput} />
            </label>
            <label>
              Sampai
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={styles.dateInput} />
            </label>
            <span className={styles.range}>{fmtDate(from)} – {fmtDate(to)}</span>
            <span className={styles.scopeTag} title="Cakupan laporan">
              <Icon name={activeOutletId ? 'shop' : 'boxes-stacked'} aria-hidden /> {scopeLabel}
            </span>
            <Button
              variant="secondary"
              onClick={exportCsv}
              iconLeft={<Icon name="download" aria-hidden />}
              className={styles.exportBtn}
            >
              Ekspor CSV
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className={styles.metrics}>
        <Metric label="Pemasukan" value={fmtRp(summary.income)} icon={<Icon name="arrow-down" aria-hidden />} tone="success" />
        <Metric label="Pengeluaran" value={fmtRp(summary.expense)} icon={<Icon name="arrow-up" aria-hidden />} tone="danger" />
        <Metric label="Laba Bersih" value={fmtRp(summary.net)} icon={<Icon name="chart-line" aria-hidden />} tone="brand" />
        <Metric label="Penjualan POS" value={fmtRp(salesTotal)} icon={<Icon name="cash-register" aria-hidden />} tone="accent" />
      </div>

      {target.overheadBudget > 0 && (
        <Card glass accent={breakEvenPct >= 1 ? 'success' : 'warning'}>
          <CardHeader icon={<Icon name="scale-balanced" aria-hidden />} title="Indikator Break-Even" />
          <CardBody>
            <div className={styles.breakEven}>
              <div>
                <span className={styles.beLabel}>Laba bersih vs Overhead Budget</span>
                <strong className={styles.beValue}>
                  {fmtRp(summary.net)} / {fmtRp(target.overheadBudget)}
                </strong>
              </div>
              <span className={[styles.beValue, breakEvenPct >= 1 ? styles.inc : ''].join(' ')}>
                {fmtPercent(breakEvenPct)}
              </span>
            </div>
            <div className={styles.beGauge}>
              <div
                className={[styles.beFill, breakEvenPct >= 1 ? styles.beOk : ''].join(' ')}
                style={{ width: `${Math.min(100, Math.max(0, breakEvenPct * 100))}%` }}
              />
            </div>
            <small className={styles.beNote}>
              <Icon name="info-circle" aria-hidden /> Overhead budget hanya target, tidak dipotong otomatis dari laba.
            </small>
          </CardBody>
        </Card>
      )}

      <div className={styles.grid}>
        <Card glass>
          <CardHeader icon={<Icon name="arrow-down" aria-hidden />} title="Pemasukan per Kategori" />
          <CardBody className={styles.noPad}>
            {incomeByCategory.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Tidak ada data" />
            ) : (
              <ul className={styles.breakdown}>
                {incomeByCategory.map(([cat, amt]) => (
                  <li key={cat} className={styles.channel}>
                    <div className={styles.channelTop}>
                      <span className={styles.channelName}>{cat}</span>
                      <span className={[styles.channelValue, styles.inc].join(' ')}>{fmtRp(amt)}</span>
                    </div>
                    <div className={styles.bar}>
                      <div className={[styles.barFill, styles.inc].join(' ')} style={{ width: `${(amt / maxIncome) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card glass>
          <CardHeader icon={<Icon name="arrow-up" aria-hidden />} title="Pengeluaran per Kategori" />
          <CardBody className={styles.noPad}>
            {expenseByCategory.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Tidak ada data" />
            ) : (
              <ul className={styles.breakdown}>
                {expenseByCategory.map(([cat, amt]) => (
                  <li key={cat} className={styles.channel}>
                    <div className={styles.channelTop}>
                      <span className={styles.channelName}>{cat}</span>
                      <span className={[styles.channelValue, styles.exp].join(' ')}>{fmtRp(amt)}</span>
                    </div>
                    <div className={styles.bar}>
                      <div className={[styles.barFill, styles.exp].join(' ')} style={{ width: `${(amt / maxExpense) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card glass>
        <CardHeader icon={<Icon name="trophy" aria-hidden />} title="Performa Teknisi (periode)" />
        <CardBody className={styles.noPad}>
          {leaderboard.length === 0 ? (
            <EmptyState icon={<Icon name="users" aria-hidden />} title="Belum ada servis selesai" />
          ) : (
            <ul className={styles.breakdown}>
              {leaderboard.map((t) => (
                <li key={t.name} className={styles.channel}>
                  <div className={styles.channelTop}>
                    <span className={styles.channelName}>{t.name} · {t.completed} selesai</span>
                    <span className={styles.channelValue}>{fmtRp(t.revenue)}</span>
                  </div>
                  <div className={styles.bar}>
                    <div className={[styles.barFill, styles.brand].join(' ')} style={{ width: `${(t.revenue / maxLeaderRev) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: 'success' | 'danger' | 'brand' | 'accent';
}) {
  return (
    <div className={[styles.metric, styles[tone]].join(' ')}>
      <span className={styles.metricIcon}>{icon}</span>
      <div className={styles.metricBody}>
        <span className={styles.metricLabel}>
          <span className={styles.metricLed} aria-hidden />
          {label}
        </span>
        <span className={styles.metricValue}>{value}</span>
      </div>
    </div>
  );
}
