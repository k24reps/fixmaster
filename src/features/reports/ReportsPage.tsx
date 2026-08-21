import { useMemo, useState, type ReactNode } from 'react';
import { Card, CardHeader, CardBody, EmptyState, Icon, Button } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionRange, rangeForTimestamp } from '@/hooks/useCollectionRange';
import { fmtRp, fmtPercent } from '@/lib/format';
import { localDateStr, localDateOf, fmtDate, isInRange } from '@/lib/time';
import { summarize } from '@/lib/business/finance';
import { technicianLeaderboard } from '@/lib/business/dashboard';
import {
  trendSeries,
  transactionRows,
  profitByDeviceCategory,
  sparepartUsage,
  restockSuggestions,
  serviceFunnel,
  avgTurnaroundDays,
  periodComparison,
  outletComparison,
  receivablesAging,
} from '@/lib/business/reports';
import { getTarget } from '@/config/orgConfig';
import { useSessionStore } from '@/stores/session';
import { toCsv, downloadCsv } from '@/lib/csv';
import { toast } from '@/stores/toast';
import { TrendChart } from './TrendChart';
import styles from './ReportsPage.module.css';

function monthRange() {
  const now = new Date();
  return {
    from: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function ReportsPage() {
  const [from, setFrom] = useState(monthRange().from);
  const [to, setTo] = useState(monthRange().to);

  // Server-side date filter (plan B): only the selected period is fetched, so
  // the report never pulls the whole history (which truncated at the row cap).
  const { data: incomes } = useCollectionRange('incomes', 'date', from, to);
  const { data: expenses } = useCollectionRange('expenses', 'date', from, to);
  const { data: sales } = useCollectionRange('sales', 'date', from, to);
  // services filters on createdAt (a UTC timestamp) but groups by LOCAL date,
  // so widen the query ±1 day; the exact localDateOf filter below trims edges.
  const [svcFrom, svcTo] = rangeForTimestamp(from, to);
  const { data: services } = useCollectionRange('services', 'createdAt', svcFrom, svcTo);
  const { data: outlets } = useCollection('outlets');
  const { data: inventory } = useCollection('inventory');
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const scopeLabel = activeOutletId
    ? (outlets.find((o) => o.id === activeOutletId)?.name ?? 'Cabang')
    : 'Semua Outlet';

  const target = getTarget();

  const fIncomes = useMemo(() => incomes.filter((i) => isInRange(i.date, from, to)), [incomes, from, to]);
  const fExpenses = useMemo(() => expenses.filter((e) => isInRange(e.date, from, to)), [expenses, from, to]);
  const fServices = useMemo(
    () => services.filter((s) => isInRange(localDateOf(s.createdAt), from, to)),
    [services, from, to],
  );
  const fSales = useMemo(() => sales.filter((s) => isInRange(s.date, from, to) && !s.voided), [sales, from, to]);

  const summary = useMemo(() => summarize(fIncomes, fExpenses), [fIncomes, fExpenses]);
  const leaderboard = useMemo(() => technicianLeaderboard(fServices), [fServices]);

  // New aggregations (all pure, from reports.ts).
  const trend = useMemo(() => trendSeries(incomes, expenses, from, to), [incomes, expenses, from, to]);
  const txnRows = useMemo(() => transactionRows(fIncomes, fExpenses), [fIncomes, fExpenses]);
  const catProfit = useMemo(() => profitByDeviceCategory(fServices), [fServices]);
  const partUsage = useMemo(() => sparepartUsage(fServices), [fServices]);
  const restock = useMemo(() => restockSuggestions(inventory), [inventory]);
  const funnel = useMemo(() => serviceFunnel(fServices), [fServices]);
  const turnaround = useMemo(() => avgTurnaroundDays(fServices), [fServices]);
  const comparison = useMemo(() => periodComparison(incomes, expenses, from, to), [incomes, expenses, from, to]);
  const outletStats = useMemo(
    () => outletComparison(incomes, expenses, outlets, from, to),
    [incomes, expenses, outlets, from, to],
  );
  const receivables = useMemo(() => receivablesAging(fServices), [fServices]);

  // Break-even indicator: net profit vs overhead budget (target, not deducted).
  const breakEvenPct = target.overheadBudget > 0 ? summary.net / target.overheadBudget : 0;
  const salesTotal = fSales.reduce((sum, s) => sum + s.total, 0);

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
  const maxCatProfit = Math.max(1, ...catProfit.map((c) => c.profit));
  const maxPartQty = Math.max(1, ...partUsage.map((p) => p.qty));
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));
  const maxOutletNet = Math.max(1, ...outletStats.map((o) => Math.abs(o.net)));
  const receivablesTotal = receivables.reduce((s, r) => s + r.outstanding, 0);

  // Export the period's transactions (income + expense) as one CSV, newest first.
  const exportCsv = () => {
    if (txnRows.length === 0) {
      toast.error('Tidak ada transaksi pada periode ini');
      return;
    }
    const csv = toCsv(
      ['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal'],
      txnRows.map((r) => [r.date, r.type, r.category, r.description, r.amount]),
    );
    downloadCsv(`laporan_${scopeLabel.replace(/\s+/g, '-').toLowerCase()}_${from}_sd_${to}.csv`, csv);
    toast.success(`${txnRows.length} transaksi diekspor`);
  };

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
        <Metric label="Pemasukan" value={fmtRp(summary.income)} icon={<Icon name="arrow-down" aria-hidden />} tone="success" delta={comparison.incomeDelta} />
        <Metric label="Pengeluaran" value={fmtRp(summary.expense)} icon={<Icon name="arrow-up" aria-hidden />} tone="danger" delta={comparison.expenseDelta} deltaInverse />
        <Metric label="Laba Bersih" value={fmtRp(summary.net)} icon={<Icon name="chart-line" aria-hidden />} tone="brand" delta={comparison.netDelta} />
        <Metric label="Penjualan POS" value={fmtRp(salesTotal)} icon={<Icon name="cash-register" aria-hidden />} tone="accent" />
      </div>

      {/* 1. Income vs expense trend chart */}
      <Card glass>
        <CardHeader icon={<Icon name="chart-line" aria-hidden />} title="Tren Pemasukan vs Pengeluaran" />
        <CardBody>
          {trend.length === 0 ? (
            <EmptyState icon={<Icon name="chart-line" aria-hidden />} title="Tidak ada data periode ini" />
          ) : (
            <TrendChart points={trend} />
          )}
        </CardBody>
      </Card>

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

      {/* 3. Profit by device category */}
      <Card glass>
        <CardHeader icon={<Icon name="microchip" aria-hidden />} title="Laba per Kategori Perangkat" />
        <CardBody className={styles.noPad}>
          {catProfit.length === 0 ? (
            <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Belum ada servis selesai" />
          ) : (
            <ul className={styles.breakdown}>
              {catProfit.map((c) => (
                <li key={c.category} className={styles.channel}>
                  <div className={styles.channelTop}>
                    <span className={styles.channelName}>{c.category} · {c.count} unit · omzet {fmtRp(c.revenue)}</span>
                    <span className={[styles.channelValue, styles.inc].join(' ')}>{fmtRp(c.profit)}</span>
                  </div>
                  <div className={styles.bar}>
                    <div className={[styles.barFill, styles.brand].join(' ')} style={{ width: `${(c.profit / maxCatProfit) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className={styles.grid}>
        {/* 4a. Sparepart usage */}
        <Card glass>
          <CardHeader icon={<Icon name="screwdriver-wrench" aria-hidden />} title="Sparepart Terlaris" />
          <CardBody className={styles.noPad}>
            {partUsage.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Belum ada pemakaian part" />
            ) : (
              <ul className={styles.breakdown}>
                {partUsage.slice(0, 8).map((p) => (
                  <li key={p.name} className={styles.channel}>
                    <div className={styles.channelTop}>
                      <span className={styles.channelName}>{p.name} · {fmtRp(p.cost)}</span>
                      <span className={styles.channelValue}>{p.qty}x</span>
                    </div>
                    <div className={styles.bar}>
                      <div className={[styles.barFill, styles.brand].join(' ')} style={{ width: `${(p.qty / maxPartQty) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* 4b. Restock suggestions */}
        <Card glass>
          <CardHeader icon={<Icon name="boxes-stacked" aria-hidden />} title="Saran Restok" />
          <CardBody className={styles.noPad}>
            {restock.length === 0 ? (
              <EmptyState icon={<Icon name="circle-check" aria-hidden />} title="Stok semua aman" />
            ) : (
              <ul className={styles.breakdown}>
                {restock.slice(0, 8).map((i) => (
                  <li key={i.id} className={styles.channel}>
                    <div className={styles.channelTop}>
                      <span className={styles.channelName}>{i.name}</span>
                      <span className={[styles.channelValue, i.stock <= 0 ? styles.exp : styles.warn].join(' ')}>
                        {i.stock} / min {i.minStock}
                      </span>
                    </div>
                    <div className={styles.bar}>
                      <div
                        className={[styles.barFill, i.stock <= 0 ? styles.exp : styles.warnFill].join(' ')}
                        style={{ width: `${Math.min(100, i.minStock > 0 ? (i.stock / (i.minStock * 2)) * 100 : 5)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* 5. Service funnel + turnaround */}
      <Card glass>
        <CardHeader
          icon={<Icon name="filter" aria-hidden />}
          title="Funnel Servis"
          action={
            <span className={styles.turnaround}>
              <Icon name="clock" aria-hidden /> Rata-rata {turnaround.toFixed(1)} hari
            </span>
          }
        />
        <CardBody className={styles.noPad}>
          {funnel.length === 0 ? (
            <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Tidak ada servis periode ini" />
          ) : (
            <ul className={styles.breakdown}>
              {funnel.map((f) => (
                <li key={f.status} className={styles.channel}>
                  <div className={styles.channelTop}>
                    <span className={styles.channelName}>{f.label}</span>
                    <span className={styles.channelValue}>{f.count}</span>
                  </div>
                  <div className={styles.bar}>
                    <div className={[styles.barFill, styles.accentFill].join(' ')} style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* 7. Per-outlet comparison (only when multiple outlets) */}
      {outlets.length > 1 && (
        <Card glass>
          <CardHeader icon={<Icon name="store" aria-hidden />} title="Perbandingan Antar-Outlet" />
          <CardBody className={styles.noPad}>
            {outletStats.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Tidak ada data" />
            ) : (
              <ul className={styles.breakdown}>
                {outletStats.map((o) => (
                  <li key={o.outletId ?? 'none'} className={styles.channel}>
                    <div className={styles.channelTop}>
                      <span className={styles.channelName}>{o.name} · masuk {fmtRp(o.income)} · keluar {fmtRp(o.expense)}</span>
                      <span className={[styles.channelValue, o.net >= 0 ? styles.inc : styles.exp].join(' ')}>{fmtRp(o.net)}</span>
                    </div>
                    <div className={styles.bar}>
                      <div className={[styles.barFill, o.net >= 0 ? styles.inc : styles.exp].join(' ')} style={{ width: `${(Math.abs(o.net) / maxOutletNet) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* Technician leaderboard (existing) */}
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

      {/* 8. Receivables aging */}
      <Card glass>
        <CardHeader
          icon={<Icon name="coins" aria-hidden />}
          title="Piutang (Servis Selesai Belum Lunas)"
          action={receivables.length > 0 ? <span className={styles.turnaround}>Total {fmtRp(receivablesTotal)}</span> : undefined}
        />
        <CardBody className={styles.noPad}>
          {receivables.length === 0 ? (
            <EmptyState icon={<Icon name="circle-check" aria-hidden />} title="Tidak ada piutang" />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>No. Servis</th>
                    <th>Pelanggan</th>
                    <th className={styles.num}>Sisa</th>
                    <th className={styles.num}>Umur</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((r) => (
                    <tr key={r.serviceId}>
                      <td className={styles.mono}>{r.serviceNo}</td>
                      <td>{r.customerName}</td>
                      <td className={[styles.num, styles.mono, styles.exp].join(' ')}>{fmtRp(r.outstanding)}</td>
                      <td className={styles.num}>
                        <span className={[styles.ageTag, styles[`age${r.bucket === '0-7' ? 'New' : r.bucket === '8-30' ? 'Mid' : 'Old'}`]].join(' ')}>
                          {r.ageDays} hari
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 2. Transaction detail table */}
      <Card glass>
        <CardHeader
          icon={<Icon name="clipboard-list" aria-hidden />}
          title="Rincian Transaksi"
          action={<span className={styles.turnaround}>{txnRows.length} baris</span>}
        />
        <CardBody className={styles.noPad}>
          {txnRows.length === 0 ? (
            <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Tidak ada transaksi periode ini" />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Jenis</th>
                    <th>Kategori</th>
                    <th>Keterangan</th>
                    <th className={styles.num}>Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {txnRows.slice(0, 100).map((r, idx) => (
                    <tr key={idx}>
                      <td className={styles.mono}>{fmtDate(r.date)}</td>
                      <td>
                        <span className={[styles.typeTag, r.amount >= 0 ? styles.typeInc : styles.typeExp].join(' ')}>
                          {r.type}
                        </span>
                      </td>
                      <td>{r.category}</td>
                      <td className={styles.descCell}>{r.description || '—'}</td>
                      <td className={[styles.num, styles.mono, r.amount >= 0 ? styles.inc : styles.exp].join(' ')}>
                        {fmtRp(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {txnRows.length > 100 && (
                <p className={styles.tableNote}>
                  Menampilkan 100 dari {txnRows.length} baris. Ekspor CSV untuk data lengkap.
                </p>
              )}
            </div>
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
  delta,
  deltaInverse,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: 'success' | 'danger' | 'brand' | 'accent';
  delta?: number;
  deltaInverse?: boolean;
}) {
  // For expense, a rise is "bad" → invert the good/bad color mapping.
  const showDelta = delta != null && Number.isFinite(delta);
  const isUp = (delta ?? 0) >= 0;
  const good = deltaInverse ? !isUp : isUp;
  return (
    <div className={[styles.metric, styles[tone]].join(' ')}>
      <span className={styles.metricIcon}>{icon}</span>
      <div className={styles.metricBody}>
        <span className={styles.metricLabel}>
          <span className={styles.metricLed} aria-hidden />
          {label}
        </span>
        <span className={styles.metricValue}>{value}</span>
        {showDelta && (
          <span className={[styles.metricDelta, good ? styles.inc : styles.exp].join(' ')}>
            <Icon name={isUp ? 'arrow-trend-up' : 'arrow-trend-down'} aria-hidden />
            {fmtPercent(Math.abs(delta as number))} vs periode lalu
          </span>
        )}
      </div>
    </div>
  );
}
