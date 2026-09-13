import { useMemo, useState, type ReactNode } from 'react';
import { Card, CardHeader, CardBody, EmptyState, Icon, Button, LoadState, loadPending } from '@/components/ui';
import { useFeature } from '@/hooks/useFeature';
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
  previousWindow,
  outletComparison,
  receivablesAging,
} from '@/lib/business/reports';
import { getTarget } from '@/config/orgConfig';
import { useSessionStore } from '@/stores/session';
import { buildCsv, csvFilename } from '@/lib/business/export';
import { downloadCsvFile } from '@/lib/csv';
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
  const rangeValid = from <= to;

  // Server-side date filter (plan B): only the selected period is fetched, so
  // the report never pulls the whole history (which truncated at the row cap).
  const { data: incomes, ...incomesLoad } = useCollectionRange('incomes', 'date', from, to);
  const { data: expenses, ...expensesLoad } = useCollectionRange('expenses', 'date', from, to);
  const { data: sales, ...salesLoad } = useCollectionRange('sales', 'date', from, to);
  // Periode pembanding diambil TERPISAH. Sebelumnya periodComparison dioper
  // array di atas — yang hanya memuat periode terpilih — sehingga `previous`
  // selalu nol dan chip "vs periode lalu" cuma bisa 0% atau +100%. Diambil
  // terpisah, bukan dengan melebarkan fetch di atas, karena trendSeries mode
  // bulanan memetakan lewat date.slice(0,7): baris bulan lalu akan masuk ke
  // ember grafik yang sama saat `from` bukan tanggal 1.
  const [prevFrom, prevTo] = previousWindow(from, to);
  const { data: prevIncomes } = useCollectionRange('incomes', 'date', prevFrom, prevTo);
  const { data: prevExpenses } = useCollectionRange('expenses', 'date', prevFrom, prevTo);
  // services filters on createdAt (a UTC timestamp) but groups by LOCAL date,
  // so widen the query ±1 day; the exact localDateOf filter below trims edges.
  const [svcFrom, svcTo] = rangeForTimestamp(from, to);
  const { data: services, ...servicesLoad } = useCollectionRange('services', 'createdAt', svcFrom, svcTo);
  const { data: outlets } = useCollection('outlets');
  const { data: inventory, ...inventoryLoad } = useCollection('inventory');
  // Panel laporan menampilkan "Belum ada data" hanya setelah datanya benar-benar
  // termuat; selama memuat atau gagal, kosong bukan fakta.
  const reportLoad = [incomesLoad, expensesLoad, salesLoad, servicesLoad, inventoryLoad];
  const reportPending = loadPending(...reportLoad);
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
  const comparison = useMemo(
    () =>
      periodComparison(
        [...incomes, ...prevIncomes],
        [...expenses, ...prevExpenses],
        from,
        to,
      ),
    [incomes, prevIncomes, expenses, prevExpenses, from, to],
  );
  const outletStats = useMemo(
    () => outletComparison(incomes, expenses, outlets, from, to),
    [incomes, expenses, outlets, from, to],
  );
  const receivables = useMemo(() => receivablesAging(fServices), [fServices]);

  // Periode lalu benar-benar kosong — bukan "tidak berubah". Dibedakan supaya
  // tile bisa mengatakannya alih-alih menampilkan angka yang dikarang.
  const noBaseline =
    comparison.previous.income === 0 &&
    comparison.previous.expense === 0 &&
    comparison.previous.net === 0;

  // Kalimat vonis + sumbernya. Aturannya sengaja konservatif: ia hanya berani
  // menyebut "lebih baik / lebih buruk" kalau ADA dasar pembanding. Tanpa itu
  // ia menyebutkan laba apa adanya dan mengaku tidak bisa membandingkan —
  // lebih berguna daripada kalimat percaya diri yang dikarang.
  const verdict = useMemo(() => {
    if (!rangeValid) {
      return { headline: 'Rentang tanggal belum sah.', source: 'Perbaiki tanggal untuk melihat hasilnya.' };
    }
    const net = fmtRp(summary.net);
    const src = `${fmtRp(summary.income)} − ${fmtRp(summary.expense)} = ${net}`;
    if (noBaseline) {
      return {
        headline: summary.net >= 0 ? `Laba bersih ${net}.` : `Rugi ${fmtRp(Math.abs(summary.net))}.`,
        source: `${src} · tidak ada data periode lalu untuk dibandingkan`,
      };
    }
    const d = comparison.netDelta;
    if (d === null || !Number.isFinite(d)) {
      return { headline: `Laba bersih ${net}.`, source: src };
    }
    const arah = d >= 0 ? 'lebih baik' : 'lebih buruk';
    return {
      headline: `Laba bersih ${net} — ${arah} ${fmtPercent(Math.abs(d))} dari periode lalu.`,
      source: `${src} · periode lalu ${fmtRp(comparison.previous.net)}`,
    };
  }, [rangeValid, summary, noBaseline, comparison]);

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

  // Ekspor CSV = portabilitas data, fitur Pro (lihat plans.ts). Jalur kedua
  // di luar kartu Export Data di Pengaturan; keduanya harus dikunci, kalau
  // tidak gerbangnya cuma menggeser pintu.
  const canExport = useFeature('exportImport');

  // Export the period's transactions (income + expense) as one CSV, newest first.
  const exportCsv = () => {
    if (!canExport) return;
    if (txnRows.length === 0) {
      toast.error('Tidak ada transaksi pada periode ini');
      return;
    }
    // buildCsv, bukan perakit lokal: ia melolosi sel yang diawali `=`, `+`,
    // `-`, atau `@` supaya nama pelanggan atau keterangan tidak dieksekusi
    // sebagai rumus saat berkasnya dibuka di Excel. Perakit lama di halaman
    // ini tidak punya penjagaan itu — dan tidak punya satu tes pun.
    const csv = buildCsv(txnRows, [
      { label: 'Tanggal', value: (r) => r.date },
      { label: 'Jenis', value: (r) => r.type },
      { label: 'Kategori', value: (r) => r.category },
      { label: 'Keterangan', value: (r) => r.description },
      { label: 'Nominal', value: (r) => r.amount },
    ]);
    // csvFilename menormalkan nama cabang (yang diketik pengguna) dan
    // menempelkan tanggal ekspor, sama seperti ekspor di Pengaturan.
    downloadCsvFile(csvFilename(`laporan-${scopeLabel}-${from}-sd-${to}`), csv);
    toast.success(`${txnRows.length} transaksi diekspor`);
  };

  return (
    <div className={styles.wrap}>
      <Card glass>
        <CardBody>
          <div className={styles.dateBar}>
            <Icon name="calendar-alt" aria-hidden />
            {/* max/min saling mengunci: rentang terbalik dulu diterima diam-diam
                dan membuat ketiga belas kartu melapor nol, sehingga pemilik
                diberi tahu tokonya menghasilkan Rp 0 — bukan bahwa ia salah
                mengisi tanggal. */}
            <label>
              Dari
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className={styles.dateInput}
              />
            </label>
            <label>
              Sampai
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className={styles.dateInput}
              />
            </label>
            {rangeValid ? (
              <span className={styles.range}>{fmtDate(from)} – {fmtDate(to)}</span>
            ) : (
              <span className={[styles.range, styles.rangeBad].join(' ')} role="alert">
                <Icon name="triangle-exclamation" aria-hidden /> Tanggal &ldquo;Dari&rdquo; melewati &ldquo;Sampai&rdquo;
              </span>
            )}
            <span className={styles.scopeTag} title="Cakupan laporan">
              <Icon name={activeOutletId ? 'shop' : 'boxes-stacked'} aria-hidden /> {scopeLabel}
            </span>
            {canExport && (
              <Button
                variant="secondary"
                onClick={exportCsv}
                iconLeft={<Icon name="download" aria-hidden />}
                className={styles.exportBtn}
              >
                Ekspor CSV
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Vonis. Halaman ini menghitung tiga belas kartu dan tidak pernah
          menyimpulkan satu pun; pemilik harus merakit sendiri jawabannya dari
          angka yang berserakan. Instrument well sengaja dibelanjakan di sini —
          sebelumnya halaman ini tidak memakai satu pun, padahal budgetnya satu
          per viewport dan inilah satu-satunya kalimat yang layak mendapatkannya
          (Earned Well, DESIGN.md). Sumbernya ditulis di bawah supaya angkanya
          bisa diperiksa, bukan dipercaya. */}
      <div className={styles.verdict}>
        <span className={styles.verdictLabel}>
          <span
            className={[
              styles.verdictLed,
              !rangeValid || noBaseline ? styles.verdictIdle : summary.net >= 0 ? styles.inc : styles.exp,
            ].join(' ')}
            aria-hidden
          />
          Periode ini
        </span>
        <p className={styles.verdictLine}>{verdict.headline}</p>
        <p className={styles.verdictSource}>{verdict.source}</p>
      </div>

      <div className={styles.metrics}>
        <Metric
          label="Pemasukan"
          value={fmtRp(summary.income)}
          icon={<Icon name="arrow-down" aria-hidden />}
          tone="success"
          delta={comparison.incomeDelta}
          noBaseline={noBaseline}
        />
        <Metric
          label="Pengeluaran"
          value={fmtRp(summary.expense)}
          icon={<Icon name="arrow-up" aria-hidden />}
          tone="danger"
          delta={comparison.expenseDelta}
          deltaInverse
          noBaseline={noBaseline}
        />
        <Metric
          label="Laba Bersih"
          value={fmtRp(summary.net)}
          icon={<Icon name="chart-line" aria-hidden />}
          tone="brand"
          delta={comparison.netDelta}
          noBaseline={noBaseline}
        />
        <Metric
          label="Penjualan POS"
          value={fmtRp(salesTotal)}
          icon={<Icon name="cash-register" aria-hidden />}
          tone="accent"
        />
      </div>

      {/* 1. Income vs expense trend chart */}
      <Card glass>
        <CardHeader icon={<Icon name="chart-line" aria-hidden />} title="Tren Pemasukan vs Pengeluaran" />
        <CardBody>
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : trend.length === 0 ? (
            <EmptyState icon={<Icon name="chart-line" aria-hidden />} title="Belum ada data periode ini" />
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
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : incomeByCategory.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Belum ada data periode ini" />
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
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : expenseByCategory.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Belum ada data periode ini" />
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
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : catProfit.length === 0 ? (
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
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : partUsage.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Belum ada pemakaian sparepart periode ini" />
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
          {/* Satu-satunya kartu di halaman ini yang TIDAK mengikuti periode di
              header — stok adalah nilai sekarang, bukan rentang. Dulu tidak
              disebutkan sama sekali. */}
          <CardHeader
            icon={<Icon name="boxes-stacked" aria-hidden />}
            title="Saran Restok"
            action={<span className={styles.liveTag}>Stok saat ini</span>}
          />
          <CardBody className={styles.noPad}>
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : restock.length === 0 ? (
              <EmptyState icon={<Icon name="circle-check" aria-hidden />} title="Stok semua aman" />
            ) : (
              <ul className={styles.breakdown}>
                {restock.slice(0, 8).map((i) => {
                  // Bar = KEKURANGAN, bukan sisa stok. Rumus lama (stock /
                  // minStock*2) membuat batang makin panjang saat makin aman,
                  // sehingga pemilik yang memindai batang terpanjang justru
                  // membeli barang yang paling tidak mendesak.
                  const deficit = i.minStock > 0
                    ? Math.min(100, (Math.max(0, i.minStock - i.stock) / i.minStock) * 100)
                    : 100;
                  const critical = i.stock < i.minStock;
                  return (
                  <li key={i.id} className={styles.channel}>
                    <div className={styles.channelTop}>
                      <span className={styles.channelName}>{i.name}</span>
                      <span className={[styles.channelValue, critical ? styles.exp : styles.warn].join(' ')}>
                        {i.stock} / min {i.minStock}
                      </span>
                    </div>
                    <div className={styles.bar}>
                      <div
                        className={[styles.barFill, critical ? styles.exp : styles.warnFill].join(' ')}
                        style={{ width: `${Math.max(6, deficit)}%` }}
                      />
                    </div>
                  </li>
                  );
                })}
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
            /* `avgTurnaroundDays` mengembalikan 0 untuk himpunan kosong, jadi
               toko yang tidak menyelesaikan apa pun diberi tahu rata-ratanya
               "0.0 hari" — status yang menyesatkan demi terlihat rapi. Titik
               desimalnya juga diganti koma, supaya tidak berdampingan dengan
               "102,0%" dari fmtPercent dalam satu viewport. */
            <span className={styles.turnaround}>
              <Icon name="clock" aria-hidden />{' '}
              {turnaround > 0
                ? `Rata-rata ${turnaround.toFixed(1).replace('.', ',')} hari`
                : 'Belum ada servis selesai'}
            </span>
          }
        />
        <CardBody className={styles.noPad}>
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : funnel.length === 0 ? (
            <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Belum ada servis periode ini" />
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
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : outletStats.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Belum ada data periode ini" />
            ) : (
              <ul className={styles.breakdown}>
                {outletStats.map((o) => (
                  <li key={o.outletId ?? 'none'} className={styles.channel}>
                    <div className={styles.channelTop}>
                      <span className={styles.channelName}>
                        {/* LED: untung vs rugi dulu dibedakan HANYA oleh hijau vs
                            merah, pada teks dan batang sekaligus. Lit-Signal
                            menuntut lampu + nilai, bukan warna sendirian. */}
                        <span
                          className={[styles.outletLed, o.net >= 0 ? styles.inc : styles.exp].join(' ')}
                          aria-hidden
                        />
                        {o.name}{' '}
                        <span className={styles.channelMeta}>
                          · masuk {fmtRp(o.income)} · keluar {fmtRp(o.expense)}
                        </span>
                      </span>
                      <span className={[styles.channelValue, o.net >= 0 ? styles.inc : styles.exp].join(' ')}>
                        {o.net >= 0 ? '+' : '−'}{fmtRp(Math.abs(o.net))}
                      </span>
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
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : leaderboard.length === 0 ? (
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
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : receivables.length === 0 ? (
            <EmptyState icon={<Icon name="circle-check" aria-hidden />} title="Tidak ada piutang" />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  Piutang servis yang sudah selesai tapi belum lunas
                </caption>
                <thead>
                  <tr>
                    <th scope="col">No. Servis</th>
                    <th scope="col">Pelanggan</th>
                    <th scope="col" className={styles.num}>Sisa</th>
                    <th scope="col" className={styles.num}>Umur</th>
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
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : txnRows.length === 0 ? (
            <EmptyState icon={<Icon name="inbox" aria-hidden />} title="Belum ada transaksi periode ini" />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  Rincian transaksi pemasukan dan pengeluaran pada periode terpilih
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Tanggal</th>
                    <th scope="col">Jenis</th>
                    <th scope="col">Kategori</th>
                    <th scope="col">Keterangan</th>
                    <th scope="col" className={styles.num}>Nominal</th>
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
              {/* Catatan ini dulu tidak digerbang canExport, jadi paket Trial
                  dan Solo disuruh menekan tombol yang tidak ada di halaman. */}
              {txnRows.length > 100 && (
                <p className={styles.tableNote}>
                  Menampilkan 100 dari {txnRows.length} baris.
                  {canExport ? ' Ekspor CSV untuk data lengkap.' : ' Persempit periode untuk melihat sisanya.'}
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
  noBaseline,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: 'success' | 'danger' | 'brand' | 'accent';
  delta?: number | null;
  deltaInverse?: boolean;
  /** `true` saat kartu ini memang membandingkan periode, tapi periode lalu
   *  tidak punya data sama sekali. Dibedakan dari "kartu tanpa perbandingan"
   *  (delta `undefined`) supaya kekosongan itu dikatakan, bukan disembunyikan. */
  noBaseline?: boolean;
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
        {!showDelta && noBaseline && (
          <span className={[styles.metricDelta, styles.metricNoBase].join(' ')}>
            Tidak ada data periode lalu
          </span>
        )}
      </div>
    </div>
  );
}
