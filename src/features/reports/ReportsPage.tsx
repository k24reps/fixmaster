import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardBody, EmptyState, Icon, Button, LoadState, loadPending } from '@/components/ui';
import { useFeature } from '@/hooks/useFeature';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionRange, rangeForTimestamp } from '@/hooks/useCollectionRange';
import { fmtRp, fmtPercent } from '@/lib/format';
import { localDateStr, localDateOf, fmtDate, isInRange } from '@/lib/time';
import { isCapitalFlow, summarize } from '@/lib/business/finance';
import { useServiceSummary } from '@/hooks/useServiceSummary';
import {
  trendSeries,
  transactionRows,
  sparepartUsage,
  restockSuggestions,
  serviceFunnel,
  avgTurnaroundDays,
  periodComparison,
  previousWindow,
  outletComparison,
} from '@/lib/business/reports';
import { useReceivables, useCategoryProfit } from '@/hooks/useReportData';
import { getRent, getStartMonth } from '@/config/orgConfig';
import {
  computeBreakEven,
  breakEvenVerdict,
  overheadFetchFrom,
  overheadFetchTo,
  OVERHEAD_CATEGORIES,
  EXPENSE_GROUPS,
  EXPENSE_GROUP_LABEL,
  expenseGroupOf,
  type BreakEvenVerdict,
} from '@/lib/business/overhead';
import { useSessionStore } from '@/stores/session';
import { buildCsv, csvFilename } from '@/lib/business/export';
import { downloadCsvFile } from '@/lib/csv';
import { toast } from '@/stores/toast';
import { TrendChart } from './TrendChart';
import { printReport } from './printReport';
import styles from './ReportsPage.module.css';
import { useT, type TranslationKey } from '@/i18n';
import { interpolate } from '@/lib/business/notify';

function monthRange() {
  const now = new Date();
  return {
    from: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

const VERDICT: Record<BreakEvenVerdict, { key: TranslationKey; tone: 'ok' | 'warn' | 'crit' }> = {
  healthy: { key: 'reports.verdictHealthy', tone: 'ok' },
  thin: { key: 'reports.verdictThin', tone: 'warn' },
  tied: { key: 'reports.verdictTied', tone: 'warn' },
  loss: { key: 'reports.verdictLoss', tone: 'crit' },
};
/** Ambang peringatan Lainnya: angka awal, ubah bila terasa terlalu cerewet/longgar. */
const OTHER_WARN_SHARE = 0.2;
const signedRp = (n: number) => `${n >= 0 ? '+' : '−'}${fmtRp(Math.abs(n))}`;

/** Urut nominal, tetapi Modal/Prive (arus kas pemilik) selalu di dasar. */
const byCapitalLast = (a: [string, number], b: [string, number]) =>
  Number(isCapitalFlow({ category: a[0] })) - Number(isCapitalFlow({ category: b[0] })) || b[1] - a[1];

export function ReportsPage() {
  const t = useT();
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
  // Overhead butuh bulan penuh + 3 bulan riwayat, di luar jendela periode.
  const { data: overheadExpenses } = useCollectionRange(
    'expenses',
    'date',
    overheadFetchFrom(from),
    overheadFetchTo(to),
  );
  // services filters on createdAt (a UTC timestamp) but groups by LOCAL date,
  // so widen the query ±1 day; the exact localDateOf filter below trims edges.
  const [svcFrom, svcTo] = rangeForTimestamp(from, to);
  const { data: services, ...servicesLoad } = useCollectionRange('services', 'createdAt', svcFrom, svcTo);
  const { data: outlets } = useCollection('outlets');
  const { data: inventory, ...inventoryLoad } = useCollection('inventory');
  // Panel laporan menampilkan "Belum ada data" hanya setelah datanya benar-benar
  // termuat; selama memuat atau gagal, kosong bukan fakta.
  // Performa teknisi = tiket yang SELESAI dikerjakan dalam periode (bukan yang
  // masuk), dihitung dari semua tiket — lihat service_summary (0063).
  const summaryQuery = useServiceSummary(from, to);
  // Dua kartu ini tidak boleh dibatasi jendela yang dimuat halaman: piutang
  // adalah keadaan sekarang, dan laba per kategori memakai tanggal SELESAI.
  const receivablesQuery = useReceivables();
  const catProfitQuery = useCategoryProfit(from, to);
  const reportLoad = [
    incomesLoad,
    expensesLoad,
    salesLoad,
    servicesLoad,
    inventoryLoad,
    summaryQuery,
    receivablesQuery,
    catProfitQuery,
  ];
  const reportPending = loadPending(...reportLoad);
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const org = useSessionStore((s) => s.org);
  const scopeLabel = activeOutletId
    ? (outlets.find((o) => o.id === activeOutletId)?.name ?? t('reports.branch'))
    : t('reports.allOutlets');


  const fIncomes = useMemo(() => incomes.filter((i) => isInRange(i.date, from, to)), [incomes, from, to]);
  const fExpenses = useMemo(() => expenses.filter((e) => isInRange(e.date, from, to)), [expenses, from, to]);
  const fServices = useMemo(
    () => services.filter((s) => isInRange(localDateOf(s.createdAt), from, to)),
    [services, from, to],
  );
  const fSales = useMemo(() => sales.filter((s) => isInRange(s.date, from, to) && !s.voided), [sales, from, to]);

  const summary = useMemo(() => summarize(fIncomes, fExpenses), [fIncomes, fExpenses]);
  const leaderboard = summaryQuery.data?.leaderboard ?? [];

  // New aggregations (all pure, from reports.ts).
  const trend = useMemo(() => trendSeries(incomes, expenses, from, to), [incomes, expenses, from, to]);
  const txnRows = useMemo(() => transactionRows(fIncomes, fExpenses), [fIncomes, fExpenses]);
  const catProfit = catProfitQuery.data;
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
  const receivables = receivablesQuery.data;

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
      return { headline: t('reports.rangeInvalid'), source: t('reports.rangeFix') };
    }
    const net = fmtRp(summary.net);
    const src = `${fmtRp(summary.income)} − ${fmtRp(summary.expense)} = ${net}`;
    if (noBaseline) {
      return {
        headline: interpolate(t('reports.netHeadline'), { net }),
        source: `${src} · ${t('reports.noBaseline')}`,
      };
    }
    const d = comparison.netDelta;
    if (d === null || !Number.isFinite(d)) {
      return { headline: interpolate(t('reports.netHeadline'), { net }), source: src };
    }
    const arah = d >= 0 ? t('reports.better') : t('reports.worse');
    return {
      headline: interpolate(t('reports.netVsPrev'), { net, dir: arah, pct: fmtPercent(Math.abs(d)) }),
      source: `${src} · ${interpolate(t('reports.prevPeriod'), { amount: fmtRp(comparison.previous.net) })}`,
    };
  }, [rangeValid, summary, noBaseline, comparison, t]);

  const salesTotal = fSales.reduce((sum, s) => sum + s.total, 0);
  // Keuangan menampilkan satu bulan: tautan membuka bulan terakhir periode.
  const financeHref = (category: string) =>
    `/finance?cat=${encodeURIComponent(category)}&month=${to.slice(0, 7)}`;
  const financeLink = (category: string) => (
    <Link
      className={styles.catLink}
      to={financeHref(category)}
      aria-label={interpolate(t('reports.openInFinance'), { category })}
    >
      {category}
    </Link>
  );

  // Break-even: laba kotor vs overhead dari catatan Keuangan, seporsi panjang
  // periode. Dulu arus kas bersih (sudah dipotong overhead) dibanding anggaran
  // sebulan penuh — overhead terhitung dua kali dan filter seminggu selalu "gagal".
  const breakEven = useMemo(() => {
    if (!rangeValid) return null;
    return computeBreakEven(
      {
        expenses: overheadExpenses,
        from,
        to,
        today: localDateStr(),
        rent: getRent(),
        outletIds: activeOutletId ? [activeOutletId] : outlets.map((o) => o.id),
        startMonth: getStartMonth(),
      },
      catProfit.reduce((sum, c) => sum + c.profit, 0),
      fSales,
      fExpenses,
    );
  }, [rangeValid, overheadExpenses, from, to, activeOutletId, outlets, catProfit, fSales, fExpenses]);
  const verdictKind =
    breakEven && breakEven.overhead.total > 0 ? breakEvenVerdict(summary.net, breakEven.surplus) : null;
  // "Lainnya" gampang jadi tempat membuang catatan; porsi besar = biaya bulanan membengkak.
  const otherShare =
    breakEven && breakEven.overhead.total > 0 ? breakEven.overhead.byCategory.Lainnya / breakEven.overhead.total : 0;

  const incomeByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of fIncomes) map.set(i.category, (map.get(i.category) ?? 0) + i.amount);
    // Modal/Prive di dasar daftar: uang pemilik, bukan omzet/biaya (isCapitalFlow).
    return [...map.entries()].sort(byCapitalLast);
  }, [fIncomes]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of fExpenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].sort(byCapitalLast);
  }, [fExpenses]);

  // Dikelompokkan menurut perlakuannya di break-even; kelompok kosong disembunyikan.
  const expenseGroups = useMemo(
    () =>
      EXPENSE_GROUPS.map((g) => {
        const rows = expenseByCategory.filter(([c]) => expenseGroupOf(c) === g.id);
        return { id: g.id, rows, total: rows.reduce((sum, [, v]) => sum + v, 0) };
      }).filter((g) => g.rows.length > 0),
    [expenseByCategory],
  );
  const paidOverhead = expenseGroups.find((g) => g.id === 'overhead')?.total ?? 0;
  const maxIncome = Math.max(1, ...incomeByCategory.map(([, v]) => v));
  const maxExpense = Math.max(1, ...expenseByCategory.map(([, v]) => v));
  const maxLeaderRev = Math.max(1, ...leaderboard.map((tech) => tech.revenue));
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
      toast.error(t('reports.tidakAdaTransaksiPada'));
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

  // Laporan A4 untuk dicetak atau disimpan sebagai PDF. Jalur ketiga di gerbang
  // `exportImport` yang sama: berkas yang keluar dari aplikasi, sama seperti CSV.
  const exportPdf = () => {
    if (!canExport) return;
    if (!org) return;
    if (!rangeValid) {
      toast.error(t('reports.perbaikiRentangTanggalDulu'));
      return;
    }
    // Laporan yang dicetak selagi angkanya masih dimuat akan membekukan nol
    // sebagai fakta di atas kertas — dan kertas tidak bisa memperbarui diri.
    if (reportPending) {
      toast.error(t('reports.dataLaporanBelumSelesai'));
      return;
    }
    const opened = printReport({
      org,
      from,
      to,
      scopeLabel,
      verdict,
      summary,
      comparison,
      noBaseline,
      salesTotal,
      breakEven,
      trend,
      incomeByCategory,
      expenseByCategory,
      catProfit,
      partUsage,
      restock,
      funnel,
      turnaround,
      leaderboard,
      outletStats,
      receivables,
      txnRows,
    });
    // Tujuan "Simpan sebagai PDF" ada di dalam dialog cetak, dan tidak semua
    // pemilik tahu itu — tanpa kalimat ini tombol bernama "Ekspor PDF" terasa
    // seperti salah membuka dialog printer.
    if (opened) toast.success(t('reports.pilihSimpanSebagaiPdf'));
  };

  // Piutang punya ekspornya sendiri: daftar inilah yang dibawa saat menagih,
  // dan ia tidak mengikuti periode — jadi tak bisa ikut di ekspor transaksi.
  const exportReceivables = () => {
    if (!canExport) return;
    if (receivables.length === 0) {
      toast.error(t('reports.tidakAdaPiutangUntuk'));
      return;
    }
    const csv = buildCsv(receivables, [
      { label: 'No. Servis', value: (r) => r.serviceNo },
      { label: 'Pelanggan', value: (r) => r.customerName },
      { label: 'Sisa', value: (r) => r.outstanding },
      { label: 'Umur (hari)', value: (r) => r.ageDays },
      { label: 'Kelompok Umur', value: (r) => r.bucket },
    ]);
    downloadCsvFile(csvFilename(`piutang-${scopeLabel}`), csv);
    toast.success(`${receivables.length} piutang diekspor`);
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
              {t('reports.dari')}
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className={styles.dateInput}
              />
            </label>
            <label>
              {t('reports.sampai')}
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
            <span className={styles.scopeTag} title={t('reports.cakupanLaporan')}>
              <Icon name={activeOutletId ? 'shop' : 'boxes-stacked'} aria-hidden /> {scopeLabel}
            </span>
            {canExport && (
              <span className={styles.exportGroup}>
                <Button
                  variant="secondary"
                  onClick={exportPdf}
                  iconLeft={<Icon name="file-invoice" aria-hidden />}
                  className={styles.exportBtn}
                >
                  {t('reports.eksporPdf')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={exportCsv}
                  iconLeft={<Icon name="download" aria-hidden />}
                  className={styles.exportBtn}
                >
                  {t('reports.eksporCsv')}
                </Button>
              </span>
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
          {t('reports.periodeIni')}
        </span>
        <p className={styles.verdictLine}>{verdict.headline}</p>
        <p className={styles.verdictSource}>{verdict.source}</p>
      </div>

      <div className={styles.metrics}>
        <Metric
          label={t('reports.pemasukan')}
          value={fmtRp(summary.income)}
          icon={<Icon name="arrow-down" aria-hidden />}
          tone="success"
          delta={comparison.incomeDelta}
          noBaseline={noBaseline}
        />
        <Metric
          label={t('reports.pengeluaran')}
          value={fmtRp(summary.expense)}
          icon={<Icon name="arrow-up" aria-hidden />}
          tone="danger"
          delta={comparison.expenseDelta}
          deltaInverse
          noBaseline={noBaseline}
        />
        <Metric
          label={t('reports.arusKasBersih')}
          value={fmtRp(summary.net)}
          icon={<Icon name="chart-line" aria-hidden />}
          tone="brand"
          delta={comparison.netDelta}
          noBaseline={noBaseline}
        />
        <Metric
          label={t('reports.penjualanPos')}
          value={fmtRp(salesTotal)}
          icon={<Icon name="cash-register" aria-hidden />}
          tone="accent"
          /* Pembayaran penjualan sudah membukukan pemasukan, jadi angka ini
             BAGIAN dari Pemasukan di kiri — bukan tambahannya. */
          note="Sudah termasuk di Pemasukan"
        />
      </div>

      {/* 1. Income vs expense trend chart */}
      <Card glass>
        <CardHeader icon={<Icon name="chart-line" aria-hidden />} title={t('reports.trenPemasukanVsPengeluaran')} />
        <CardBody>
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : trend.length === 0 ? (
            <EmptyState icon={<Icon name="chart-line" aria-hidden />} title={t('reports.belumAdaDataPeriode')} />
          ) : (
            <TrendChart points={trend} />
          )}
        </CardBody>
      </Card>

      {breakEven && (
        <Card glass accent={breakEven.overhead.total === 0 ? undefined : breakEven.pct >= 1 ? 'success' : 'warning'}>
          <CardHeader icon={<Icon name="scale-balanced" aria-hidden />} title={t('reports.indikatorBreakEven')} />
          <CardBody>
            {breakEven.overhead.total === 0 ? (
              // Tanpa isian perkiraan, kartu kosong inilah yang memberi tahu fitur ini ada.
              <p className={styles.beEmpty}>{t('reports.beEmpty')}</p>
            ) : (
              <>
                {verdictKind && (
                  <div className={styles.beVerdict} data-tone={VERDICT[verdictKind].tone}>
                    <span className={styles.beLed} aria-hidden />
                    <div>
                      <strong>{t(VERDICT[verdictKind].key)}</strong>
                      <span className={styles.beVerdictSub}>
                        {interpolate(t('reports.verdictSub'), {
                          cash: signedRp(summary.net),
                          be: signedRp(breakEven.surplus),
                        })}
                      </span>
                    </div>
                  </div>
                )}
                <div className={styles.breakEven}>
                  <div>
                    <span className={styles.beLabel}>{t('reports.beGrossVsOverhead')}</span>
                    <strong className={styles.beValue}>
                      {fmtRp(breakEven.gross)} / {fmtRp(breakEven.overhead.total)}
                    </strong>
                  </div>
                  <span className={[styles.beValue, breakEven.pct >= 1 ? styles.inc : ''].join(' ')}>
                    {fmtPercent(breakEven.pct)}
                  </span>
                </div>
                <div className={styles.beGauge}>
                  <div
                    className={[styles.beFill, breakEven.pct >= 1 ? styles.beOk : ''].join(' ')}
                    style={{ width: `${Math.min(100, Math.max(0, breakEven.pct * 100))}%` }}
                  />
                </div>
                <p className={styles.beResult}>
                  {interpolate(t(breakEven.pct >= 1 ? 'reports.beSurplus' : 'reports.beShort'), {
                    amount: fmtRp(Math.abs(breakEven.gross - breakEven.overhead.total)),
                  })}
                </p>
                <ul className={styles.beBreakdown} aria-label={t('reports.beBreakdown')}>
                  {OVERHEAD_CATEGORIES.filter((c) => breakEven.overhead.byCategory[c] > 0).map((c) => (
                    <li key={c}>
                      {financeLink(c)} <b>{fmtRp(breakEven.overhead.byCategory[c])}</b>
                    </li>
                  ))}
                </ul>
                <small className={styles.beNote}>
                  <Icon name="info-circle" aria-hidden />{' '}
                  {t(
                    breakEven.overhead.basis === 'actual'
                      ? 'reports.beBasisActual'
                      : breakEven.overhead.basis === 'estimate'
                        ? 'reports.beBasisEstimate'
                        : 'reports.beBasisPartial',
                  )}
                </small>
                {otherShare > OTHER_WARN_SHARE && (
                  <Link className={[styles.beNote, styles.beWarn].join(' ')} to={financeHref('Lainnya')}>
                    <Icon name="triangle-exclamation" aria-hidden />{' '}
                    {interpolate(t('reports.beOtherHigh'), {
                      amount: fmtRp(breakEven.overhead.byCategory.Lainnya),
                      pct: fmtPercent(otherShare, 0),
                    })}
                  </Link>
                )}
            {breakEven.overhead.missingPayroll && (
                  <small className={[styles.beNote, styles.beWarn].join(' ')}>
                    <Icon name="triangle-exclamation" aria-hidden /> {t('reports.beNoPayroll')}
                  </small>
                )}
              </>
            )}
          </CardBody>
        </Card>
      )}

      <div className={styles.grid}>
        <Card glass>
          <CardHeader icon={<Icon name="arrow-down" aria-hidden />} title={t('reports.pemasukanPerKategori')} />
          <CardBody className={styles.noPad}>
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : incomeByCategory.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title={t('reports.belumAdaDataPeriode')} />
            ) : (
              <ul className={styles.breakdown}>
                {incomeByCategory.map(([cat, amt]) => (
                  <li key={cat} className={styles.channel}>
                    <div className={styles.channelTop}>
                      <span className={styles.channelName}>
                        {financeLink(cat)}
                        {isCapitalFlow({ category: cat }) && <span className={styles.capitalTag}>{t('reports.notRevenue')}</span>}
                      </span>
                      <span className={[styles.channelValue, isCapitalFlow({ category: cat }) ? '' : styles.inc].join(' ')}>{fmtRp(amt)}</span>
                    </div>
                    <div className={styles.bar}>
                      <div
                        className={[styles.barFill, isCapitalFlow({ category: cat }) ? styles.capital : styles.inc].join(' ')}
                        style={{ width: `${(amt / maxIncome) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card glass>
          <CardHeader icon={<Icon name="arrow-up" aria-hidden />} title={t('reports.pengeluaranPerKategori')} />
          <CardBody className={styles.noPad}>
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : expenseByCategory.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title={t('reports.belumAdaDataPeriode')} />
            ) : (
              <div className={styles.breakdown}>
                {expenseGroups.map((g) => (
                  <section key={g.id} className={styles.expGroup} aria-label={t(EXPENSE_GROUP_LABEL[g.id])}>
                    <div className={styles.groupHead}>
                      <span>{t(EXPENSE_GROUP_LABEL[g.id])}</span>
                      <span>{fmtRp(g.total)}</span>
                    </div>
                    <ul className={styles.breakdown}>
                      {g.rows.map(([cat, amt]) => (
                        <li key={cat} className={styles.channel}>
                          <div className={styles.channelTop}>
                            <span className={styles.channelName}>{financeLink(cat)}</span>
                            <span className={[styles.channelValue, g.id === 'owner' ? '' : styles.exp].join(' ')}>
                              {fmtRp(amt)}
                            </span>
                          </div>
                          <div className={styles.bar}>
                            <div
                              className={[styles.barFill, g.id === 'owner' ? styles.capital : styles.exp].join(' ')}
                              style={{ width: `${(amt / maxExpense) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                    {g.id === 'overhead' && breakEven && Math.abs(breakEven.overhead.total - paidOverhead) >= 1 && (
                      <p className={styles.groupNote}>{t('reports.groupOverheadNote')}</p>
                    )}
                  </section>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* 3. Profit by device category */}
      <Card glass>
        <CardHeader
          icon={<Icon name="microchip" aria-hidden />}
          title={t('reports.labaPerKategoriPerangkat')}
          /* Periode kartu ini dihitung dari tanggal SELESAI, sama seperti
             Performa Teknisi di bawah — dulu ia memakai tanggal tiket masuk. */
          action={<span className={styles.liveTag}>{t('reports.selesaiPeriodeIni')}</span>}
        />
        <CardBody className={styles.noPad}>
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : catProfit.length === 0 ? (
            <EmptyState icon={<Icon name="inbox" aria-hidden />} title={t('reports.belumAdaServisSelesai')} />
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
          <CardHeader icon={<Icon name="screwdriver-wrench" aria-hidden />} title={t('reports.sparepartTerlaris')} />
          <CardBody className={styles.noPad}>
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : partUsage.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title={t('reports.belumAdaPemakaianSparepart')} />
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
            title={t('reports.saranRestok')}
            action={<span className={styles.liveTag}>{t('reports.stokSaatIni')}</span>}
          />
          <CardBody className={styles.noPad}>
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : restock.length === 0 ? (
              <EmptyState icon={<Icon name="circle-check" aria-hidden />} title={t('reports.stokSemuaAman')} />
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
          title={t('reports.funnelServisTiketMasuk')}
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
                : t('reports.belumAdaServisSelesai')}
            </span>
          }
        />
        <CardBody className={styles.noPad}>
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : funnel.length === 0 ? (
            <EmptyState icon={<Icon name="inbox" aria-hidden />} title={t('reports.belumAdaServisPeriode')} />
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
          <CardHeader icon={<Icon name="store" aria-hidden />} title={t('reports.perbandinganAntarOutlet')} />
          <CardBody className={styles.noPad}>
            {reportPending ? (
              <LoadState queries={reportLoad} />
            ) : activeOutletId ? (
              /* Datanya sudah tersaring cabang aktif, jadi kartu ini hanya akan
                 menampilkan satu batang — pembanding yang tidak membandingkan. */
              <p className={styles.tableNote}>
                Sedang menampilkan satu cabang ({scopeLabel}). Pilih &ldquo;Semua Outlet&rdquo; di
                selektor cabang untuk membandingkan antar-cabang.
              </p>
            ) : outletStats.length === 0 ? (
              <EmptyState icon={<Icon name="inbox" aria-hidden />} title={t('reports.belumAdaDataPeriode')} />
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
        <CardHeader icon={<Icon name="trophy" aria-hidden />} title={t('reports.performaTeknisiPeriode')} />
        <CardBody className={styles.noPad}>
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : leaderboard.length === 0 ? (
            <EmptyState icon={<Icon name="users" aria-hidden />} title={t('reports.belumAdaServisSelesai')} />
          ) : (
            <ul className={styles.breakdown}>
              {leaderboard.map((tech) => (
                <li key={tech.key} className={styles.channel}>
                  <div className={styles.channelTop}>
                    <span className={styles.channelName}>{tech.name} · {tech.completed} selesai</span>
                    <span className={styles.channelValue}>{fmtRp(tech.revenue)}</span>
                  </div>
                  <div className={styles.bar}>
                    <div className={[styles.barFill, styles.brand].join(' ')} style={{ width: `${(tech.revenue / maxLeaderRev) * 100}%` }} />
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
          title={t('reports.piutangServisSelesaiBelum')}
          /* Satu-satunya kartu selain Saran Restok yang TIDAK mengikuti periode
             di header: piutang adalah keadaan sekarang, dan yang paling tua
             justru selalu di luar periode yang sedang dilihat. */
          action={
            <span className={styles.turnaround}>
              {receivables.length > 0 ? `Total ${fmtRp(receivablesTotal)} · ` : ''}
              {t('reports.allPeriods')}
              {canExport && receivables.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportReceivables}
                  iconLeft={<Icon name="download" aria-hidden />}
                >
                  {t('reports.ekspor')}
                </Button>
              )}
            </span>
          }
        />
        <CardBody className={styles.noPad}>
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : receivables.length === 0 ? (
            <EmptyState icon={<Icon name="circle-check" aria-hidden />} title={t('reports.tidakAdaPiutang')} />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  {t('reports.piutangServisYangSudah')}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t('reports.noServis')}</th>
                    <th scope="col">{t('reports.pelanggan')}</th>
                    <th scope="col" className={styles.num}>{t('reports.sisa')}</th>
                    <th scope="col" className={styles.num}>{t('reports.umur')}</th>
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
          title={t('reports.rincianTransaksi')}
          action={<span className={styles.turnaround}>{txnRows.length} baris</span>}
        />
        <CardBody className={styles.noPad}>
          {reportPending ? (
            <LoadState queries={reportLoad} />
          ) : txnRows.length === 0 ? (
            <EmptyState icon={<Icon name="inbox" aria-hidden />} title={t('reports.belumAdaTransaksiPeriode')} />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  {t('reports.rincianTransaksiPemasukanDan')}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t('reports.tanggal')}</th>
                    <th scope="col">{t('reports.jenis')}</th>
                    <th scope="col">{t('reports.kategori')}</th>
                    <th scope="col">{t('reports.keterangan')}</th>
                    <th scope="col" className={styles.num}>{t('reports.nominal')}</th>
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
  note,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: 'success' | 'danger' | 'brand' | 'accent';
  delta?: number | null;
  deltaInverse?: boolean;
  /** Keterangan tetap di bawah angka (mis. "sudah termasuk di Pemasukan"). */
  note?: string;
  /** `true` saat kartu ini memang membandingkan periode, tapi periode lalu
   *  tidak punya data sama sekali. Dibedakan dari "kartu tanpa perbandingan"
   *  (delta `undefined`) supaya kekosongan itu dikatakan, bukan disembunyikan. */
  noBaseline?: boolean;
}) {
  const t = useT();
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
            {t('reports.tidakAdaDataPeriode')}
          </span>
        )}
        {note && (
          <span className={[styles.metricDelta, styles.metricNoBase].join(' ')}>{note}</span>
        )}
      </div>
    </div>
  );
}
