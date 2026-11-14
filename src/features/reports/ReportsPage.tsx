import { EmptyValue } from '@/components/ui/EmptyValue';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardBody, EmptyState, Icon, Button, LoadState, loadPending, Term } from '@/components/ui';
import { useFeature } from '@/hooks/useFeature';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionRange, rangeForTimestamp } from '@/hooks/useCollectionRange';
import { fmtRp, fmtPercent } from '@/lib/format';
import { localDateStr, localDateOf, fmtDate, fmtDateRange, isInRange } from '@/lib/time';
import { isCapitalFlow, summarize } from '@/lib/business/finance';
import {
  trendSeries,
  transactionRows,
  sparepartUsage,
  restockSuggestions,
  serviceFunnel,
  serviceQuality,
  technicianProfit,
  salesBreakdown,
  periodComparison,
  comparisonWindows,
  outletComparison,
} from '@/lib/business/reports';
import { useReceivables, useCategoryProfit, useCompletedServices, useAwaitingPickup } from '@/hooks/useReportData';
import { getRent, getStartMonth } from '@/config/orgConfig';
import {
  computeBreakEven,
  breakEvenVerdict,
  profitLoss,
  overheadFetchFrom,
  overheadFetchTo,
  overheadBreakdown,
  categoryLabel,
  EXPENSE_GROUPS,
  EXPENSE_GROUP_LABEL,
  expenseGroupOf,
  type BreakEvenVerdict,
  type ExpenseGroup,
} from '@/lib/business/overhead';
import { useSessionStore } from '@/stores/session';
import { buildCsv, csvFilename } from '@/lib/business/export';
import { downloadCsvFile } from '@/lib/csv';
import { toast } from '@/stores/toast';
import { TrendChart } from './TrendChart';
import { printReport } from './printReport';
import type { TermId } from '@/features/glossary/terms';
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
const TAB_IDS = ['ringkasan', 'uang', 'servis', 'stok', 'piutang'] as const;
type TabId = (typeof TAB_IDS)[number];
const isTabId = (v: string | null): v is TabId => !!v && (TAB_IDS as readonly string[]).includes(v);
interface TabItem {
  id: TabId;
  label: string;
  readout: string;
  tone?: 'ok' | 'warn' | 'crit';
}

/** Ambang peringatan Lainnya: angka awal, ubah bila terasa terlalu cerewet/longgar. */
const OTHER_WARN_SHARE = 0.2;
/** Kelompok yang bukan beban usaha: bar netral, bukan merah pengeluaran. */
const NON_COST_GROUPS = new Set<ExpenseGroup>(['contra', 'stock', 'asset', 'receivable', 'owner']);
const GROUP_TERM: Partial<Record<ExpenseGroup, TermId>> = {
  overhead: 'overhead',
  direct: 'beban-langsung',
  stock: 'persediaan',
  asset: 'aset-tetap',
  receivable: 'piutang',
  owner: 'prive',
};
const signedRp = (n: number) => `${n >= 0 ? '+' : '−'}${fmtRp(Math.abs(n))}`;
/** Baris biaya di struk Laba Rugi: selalu bertanda minus, nol tetap "Rp 0". */
const minusRp = (n: number) => (n === 0 ? fmtRp(0) : `−${fmtRp(Math.abs(n))}`);
/** Barang kasir yang ditampilkan; daftar lengkap ada di PDF. */
const TOP_PRODUCTS = 8;
/** Baris maksimum Unit Menunggu Diambil; sisanya disebut, tertua tetap di atas. */
const PICKUP_ROWS = 10;
/** Hari dengan satu desimal bila perlu ("2", "0,5"); format angka tak ikut bahasa. */
const fmtDays = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
/** Total: tanpa "+", minus hanya bila memang negatif. */
const signedPlain = (n: number) => (n < 0 ? `−${fmtRp(Math.abs(n))}` : fmtRp(n));

/** Urut nominal, tetapi Modal/Prive (arus kas pemilik) selalu di dasar. */
const byCapitalLast = (a: [string, number], b: [string, number]) =>
  Number(isCapitalFlow({ category: a[0] })) - Number(isCapitalFlow({ category: b[0] })) || b[1] - a[1];

export function ReportsPage() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
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
  // Periode berjalan dipotong ke hari ini dan dibanding tanggal yang sama
  // bulan lalu (comparisonWindows) — bukan 30 hari penuh sebelumnya.
  const today = localDateStr();
  const cmp = useMemo(() => comparisonWindows(from, to, today), [from, to, today]);
  const running = from <= today && today <= to;
  const [curFrom, curTo] = cmp.current;
  const [prevFrom, prevTo] = cmp.previous;
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
  // Mutu servis & performa teknisi = tiket yang SELESAI dalam periode (bukan
  // yang masuk), dengan part-nya, supaya teknisi diurutkan menurut laba.
  const completedQuery = useCompletedServices(from, to);
  // Unit menunggu diambil: keadaan sekarang, semua periode (seperti piutang).
  const pickupQuery = useAwaitingPickup();
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
    completedQuery,
    pickupQuery,
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
  const completed = completedQuery.data;
  const pickups = pickupQuery.data;

  // New aggregations (all pure, from reports.ts).
  const trend = useMemo(() => trendSeries(incomes, expenses, from, to, today), [incomes, expenses, from, to, today]);
  const txnRows = useMemo(() => transactionRows(fIncomes, fExpenses), [fIncomes, fExpenses]);
  const catProfit = catProfitQuery.data;
  const partUsage = useMemo(() => sparepartUsage(fServices), [fServices]);
  const restock = useMemo(() => restockSuggestions(inventory), [inventory]);
  const funnel = useMemo(() => serviceFunnel(fServices), [fServices]);
  const quality = useMemo(() => serviceQuality(fServices, completed), [fServices, completed]);
  const techRows = useMemo(() => technicianProfit(completed), [completed]);
  // `sales`, bukan fSales: struk batal ikut dihitung (terpisah) di sini.
  const salesInfo = useMemo(() => salesBreakdown(sales, from, to), [sales, from, to]);
  const topProducts = salesInfo.products.slice(0, TOP_PRODUCTS);
  const maxProductProfit = Math.max(1, ...topProducts.map((p) => p.profit));
  const comparison = useMemo(
    () =>
      periodComparison(
        [...incomes, ...prevIncomes],
        [...expenses, ...prevExpenses],
        curFrom,
        curTo,
        [prevFrom, prevTo],
      ),
    [incomes, prevIncomes, expenses, prevExpenses, curFrom, curTo, prevFrom, prevTo],
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
      source: `${src} · ${interpolate(t('reports.prevPeriod'), {
        range: fmtDateRange(prevFrom, prevTo),
        amount: fmtRp(comparison.previous.net),
      })}`,
    };
  }, [rangeValid, summary, noBaseline, comparison, prevFrom, prevTo, t]);

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
      {categoryLabel(category)}
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
  // Laba Rugi = break-even yang dipecah per baris; labanya angka yang sama.
  const pl = useMemo(
    () =>
      profitLoss(
        {
          revenue: catProfit.reduce((sum, c) => sum + c.revenue, 0),
          profit: catProfit.reduce((sum, c) => sum + c.profit, 0),
        },
        fSales,
        fExpenses,
      ),
    [catProfit, fSales, fExpenses],
  );
  const unitsDone = catProfit.reduce((sum, c) => sum + c.count, 0);
  const hasOverhead = !!breakEven && breakEven.overhead.total > 0;
  const operating = breakEven?.surplus ?? 0;
  // Bulan berjalan dibandingkan dengan overhead SEBULAN: minus di tanggal 5 itu
  // jarak ke impas, bukan rugi. Kata "rugi" hanya untuk periode yang sudah tutup.
  const finalTone: 'ok' | 'warn' | 'crit' = operating >= 0 ? 'ok' : running ? 'warn' : 'crit';
  const finalLabel = running
    ? t(operating >= 0 ? 'reports.plRunningSurplus' : 'reports.plRunningShort')
    : t(operating >= 0 ? 'reports.plOperating' : 'reports.plOperatingLoss');
  // "Lainnya" gampang jadi tempat membuang catatan; porsi besar = biaya bulanan membengkak.
  const otherShare =
    breakEven && breakEven.overhead.total > 0 ? (breakEven.overhead.byCategory.Lainnya ?? 0) / breakEven.overhead.total : 0;

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
  const maxTechProfit = Math.max(1, ...techRows.map((tech) => tech.profit));
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
      salesInfo,
      breakEven,
      pl,
      unitsDone,
      running,
      trend,
      incomeByCategory,
      expenseByCategory,
      catProfit,
      partUsage,
      restock,
      funnel,
      quality,
      techRows,
      pickups,
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

  // Tab bagian. LED hanya pada kanal yang punya status (Lit-Signal): sisanya
  // cuma hitungan, dan lampu di sana akan menyala tanpa arti.
  const pendingReadout = '…';
  const ticketTotal = funnel.reduce((s, f) => s + f.count, 0);
  const summaryTab: TabItem = reportPending
    ? { id: 'ringkasan', label: t('reports.tabSummary'), readout: pendingReadout }
    : pl.grossMargin === null
      ? { id: 'ringkasan', label: t('reports.tabSummary'), readout: t('reports.idxNoRevenue') }
      : {
          id: 'ringkasan',
          label: t('reports.tabSummary'),
          readout: interpolate(t('reports.idxMargin'), { pct: fmtPercent(pl.grossMargin, 0) }),
          // Tanpa overhead tercatat, margin saja tak bisa menyebut impas atau belum.
          tone: hasOverhead ? (operating >= 0 ? 'ok' : 'warn') : undefined,
        };
  const tabItems: TabItem[] = [
    summaryTab,
    {
      id: 'uang',
      label: t('reports.tabMoney'),
      readout: reportPending ? pendingReadout : interpolate(t('reports.idxTxnCount'), { n: String(txnRows.length) }),
    },
    {
      id: 'servis',
      label: t('reports.tabService'),
      readout: reportPending ? pendingReadout : interpolate(t('reports.idxTickets'), { n: String(ticketTotal) }),
    },
    reportPending
      ? { id: 'stok', label: t('reports.tabStock'), readout: pendingReadout }
      : restock.length > 0
        ? {
            id: 'stok',
            label: t('reports.tabStock'),
            readout: interpolate(t('reports.idxRestock'), { n: String(restock.length) }),
            tone: 'warn',
          }
        : { id: 'stok', label: t('reports.tabStock'), readout: t('reports.idxStockOk'), tone: 'ok' },
    reportPending
      ? { id: 'piutang', label: t('reports.idxReceivables'), readout: pendingReadout }
      : receivables.length > 0
        ? {
            id: 'piutang',
            label: t('reports.idxReceivables'),
            readout: fmtRp(receivablesTotal),
            tone: receivables.some((r) => r.bucket === '31+') ? 'crit' : 'warn',
          }
        : { id: 'piutang', label: t('reports.idxReceivables'), readout: t('reports.idxNoReceivables'), tone: 'ok' },
  ];
  // Tab aktif hidup di URL (?bagian=), supaya tautan dan tombol Kembali membuka
  // bagian yang sama. replace: berpindah tab bukan langkah navigasi.
  const tab: TabId = isTabId(searchParams.get('bagian')) ? (searchParams.get('bagian') as TabId) : 'ringkasan';
  const selectTab = (id: TabId) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'ringkasan') next.delete('bagian');
    else next.set('bagian', id);
    setSearchParams(next, { replace: true });
  };
  // Pola tab WAI-ARIA: panah kiri/kanan, Home, End memindah fokus DAN memilih.
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TAB_IDS.indexOf(tab);
    const to =
      e.key === 'ArrowRight' ? (i + 1) % TAB_IDS.length
      : e.key === 'ArrowLeft' ? (i - 1 + TAB_IDS.length) % TAB_IDS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TAB_IDS.length - 1
      : null;
    if (to === null) return;
    e.preventDefault();
    selectTab(TAB_IDS[to]);
    document.getElementById(`lap-tab-${TAB_IDS[to]}`)?.focus();
  };
  const panel = (id: TabId, children: ReactNode) => (
    <div
      role="tabpanel"
      id={`lap-panel-${id}`}
      aria-labelledby={`lap-tab-${id}`}
      hidden={tab !== id}
      className={styles.panel}
    >
      {children}
    </div>
  );

  return (
    <div className={styles.wrap}>
      <Card>
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
            <Link className={styles.glossaryBtn} to="/istilah">
              <Icon name="circle-question" aria-hidden /> {t('glossary.open')}
            </Link>
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
              !rangeValid || noBaseline ? styles.verdictIdle : summary.net >= 0 ? styles.inc : styles.neg,
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
          delta={noBaseline ? null : comparison.incomeDelta}
        />
        <Metric
          label={t('reports.pengeluaran')}
          value={fmtRp(summary.expense)}
          icon={<Icon name="arrow-up" aria-hidden />}
          tone="neutral"
          delta={noBaseline ? null : comparison.expenseDelta}
          deltaInverse
        />
        <Metric
          label={<Term id="arus-kas-bersih">{t('reports.arusKasBersih')}</Term>}
          value={fmtRp(summary.net)}
          icon={<Icon name="chart-line" aria-hidden />}
          tone={summary.net < 0 ? 'warning' : 'neutral'}
          delta={noBaseline ? null : comparison.netDelta}
        />
        <Metric
          label={t('reports.penjualanPos')}
          value={fmtRp(salesTotal)}
          icon={<Icon name="cash-register" aria-hidden />}
          tone="neutral"
          /* Pembayaran penjualan sudah membukukan pemasukan, jadi angka ini
             BAGIAN dari Pemasukan di kiri — bukan tambahannya. */
          note={t('reports.posIncluded')}
        />
      </div>

      {/* Tab bagian. Dulu indeks lompat ke 13 kartu dalam satu gulir ±6 layar
          (ponsel). Laporan baru (mutu servis, kasir, pelanggan) akan membuat
          gulir itu ±10 layar, jadi kartu dikelompokkan per pertanyaan pemilik.
          Readout + LED tetap, jadi deret ini masih ringkasan tanpa menggulir. */}
      <div className={styles.index}>
        <span className={styles.indexTitle} id="lap-tabs-title">
          {t('reports.idxTitle')}
        </span>
        <div role="tablist" aria-labelledby="lap-tabs-title" className={styles.indexList} onKeyDown={onTabKey}>
          {tabItems.map((it) => (
            <button
              key={it.id}
              type="button"
              role="tab"
              id={`lap-tab-${it.id}`}
              aria-selected={tab === it.id}
              aria-controls={`lap-panel-${it.id}`}
              tabIndex={tab === it.id ? 0 : -1}
              className={styles.indexLink}
              onClick={() => selectTab(it.id)}
            >
              <span className={styles.indexLabel}>{it.label}</span>
              <span className={styles.indexReadout}>
                {it.tone && <span className={styles.indexLed} data-tone={it.tone} aria-hidden />}
                {it.readout}
              </span>
            </button>
          ))}
        </div>
      </div>

      {panel(
        'ringkasan',
        <>
          {/* Laba Rugi + break-even dalam satu kartu: keduanya membaca laba kotor
              yang sama. Dulu laba usaha hanya muncul sebagai "Break-even −Rp X" di
              kalimat kecil kartu ketiga, dan laba penjualan kasir dihitung tanpa
              pernah ditampilkan. */}
          {breakEven && (
            <Card
              accent={!hasOverhead ? undefined : breakEven.pct >= 1 ? 'success' : 'warning'}
            >
              <CardHeader
                icon={<Icon name="scale-balanced" aria-hidden />}
                title={<Term id="laba-usaha">{t('reports.plTitle')}</Term>}
              />
              <CardBody>
                {reportPending ? (
                  <LoadState queries={reportLoad} />
                ) : (
                  <div className={styles.plWrap}>
                    <div className={styles.pl}>
                      <ul className={styles.plLines} aria-label={t('reports.plLines')}>
                        <PlLine
                          label={t('reports.plServiceRevenue')}
                          sub={interpolate(t('reports.plUnits'), { n: String(unitsDone) })}
                          amount={fmtRp(pl.serviceRevenue)}
                        />
                        <PlLine label={t('reports.plServiceCost')} amount={minusRp(pl.serviceCost)} />
                        <PlLine label={t('reports.plSalesRevenue')} amount={fmtRp(pl.salesRevenue)} />
                        <PlLine
                          label={<Term id="hpp">{t('reports.plSalesCost')}</Term>}
                          amount={minusRp(pl.salesCost)}
                        />
                        {pl.directCost > 0 && (
                          <PlLine
                            label={<Term id="beban-langsung">{t('reports.plDirect')}</Term>}
                            amount={minusRp(pl.directCost)}
                          />
                        )}
                        <PlLine
                          kind="total"
                          label={<Term id="laba-kotor">{t('reports.plGross')}</Term>}
                          sub={
                            pl.grossMargin === null
                              ? undefined
                              : interpolate(t('reports.plMargin'), { pct: fmtPercent(pl.grossMargin) })
                          }
                          amount={signedPlain(pl.gross)}
                        />
                        <PlLine
                          label={<Term id="overhead">{t('reports.plOverhead')}</Term>}
                          amount={hasOverhead ? minusRp(breakEven.overhead.total) : t('reports.plOverheadNone')}
                          muted={!hasOverhead}
                        />
                        {hasOverhead && (
                          <li className={styles.plDetail}>
                            <ul className={styles.plBreakdown} aria-label={t('reports.beBreakdown')}>
                              {overheadBreakdown(breakEven.overhead.byCategory).map(([c, v]) => (
                                <li key={c}>
                                  {financeLink(c)}
                                  {breakEven.overhead.estimated.includes(c) && (
                                    <i className={styles.estTag}>{t('reports.estTag')}</i>
                                  )}{' '}
                                  <b>{fmtRp(v)}</b>
                                </li>
                              ))}
                            </ul>
                          </li>
                        )}
                        {hasOverhead && (
                          <PlLine
                            kind="final"
                            tone={finalTone}
                            label={finalLabel}
                            sub={
                              running || pl.revenue <= 0
                                ? undefined
                                : interpolate(t('reports.plMargin'), { pct: fmtPercent(operating / pl.revenue) })
                            }
                            amount={running ? fmtRp(Math.abs(operating)) : signedPlain(operating)}
                          />
                        )}
                      </ul>

                      <div className={styles.plSide}>
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
                        {hasOverhead ? (
                          <>
                            <div className={styles.breakEven}>
                              <div>
                                <span className={styles.beLabel}>
                                  <Term id="break-even">{t('reports.beGrossVsOverhead')}</Term>
                                </span>
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
                            {running && (
                              <small className={styles.beNote}>
                                <Icon name="info-circle" aria-hidden /> {t('reports.plRunningNote')}
                              </small>
                            )}
                            {breakEven.overhead.prorated && (
                              <small className={styles.beNote}>
                                <Icon name="info-circle" aria-hidden /> {t('reports.beProrated')}
                              </small>
                            )}
                            {otherShare > OTHER_WARN_SHARE && (
                              <Link className={[styles.beNote, styles.beWarn].join(' ')} to={financeHref('Lainnya')}>
                                <Icon name="triangle-exclamation" aria-hidden />{' '}
                                {interpolate(t('reports.beOtherHigh'), {
                                  amount: fmtRp(breakEven.overhead.byCategory.Lainnya ?? 0),
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
                        ) : (
                          // Tanpa isian perkiraan, kalimat inilah yang memberi tahu break-even ada.
                          <p className={styles.beEmpty}>{t('reports.beEmpty')}</p>
                        )}
                        <small className={styles.beNote}>
                          <Icon name="info-circle" aria-hidden /> {t('reports.plAccrualNote')}
                        </small>
                      </div>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* 1. Income vs expense trend chart */}
          <Card>
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
        </>,
      )}

      {panel(
        'uang',
        <>
          <div className={styles.grid}>
            <Card>
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

            <Card>
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
                          <span>
                            {GROUP_TERM[g.id] ? (
                              <Term id={GROUP_TERM[g.id]!}>{t(EXPENSE_GROUP_LABEL[g.id])}</Term>
                            ) : (
                              t(EXPENSE_GROUP_LABEL[g.id])
                            )}
                          </span>
                          <span>{fmtRp(g.total)}</span>
                        </div>
                        <ul className={styles.breakdown}>
                          {g.rows.map(([cat, amt]) => (
                            <li key={cat} className={styles.channel}>
                              <div className={styles.channelTop}>
                                <span className={styles.channelName}>{financeLink(cat)}</span>
                                <span className={[styles.channelValue, NON_COST_GROUPS.has(g.id) ? '' : styles.exp].join(' ')}>
                                  {fmtRp(amt)}
                                </span>
                              </div>
                              <div className={styles.bar}>
                                <div
                                  className={[styles.barFill, NON_COST_GROUPS.has(g.id) ? styles.capital : styles.exp].join(' ')}
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

          {/* 7. Per-outlet comparison (only when multiple outlets) */}
          {outlets.length > 1 && (
            <Card>
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
                              className={[styles.outletLed, o.net >= 0 ? styles.inc : styles.neg].join(' ')}
                              aria-hidden
                            />
                            {o.name}{' '}
                            <span className={styles.channelMeta}>
                              · masuk {fmtRp(o.income)} · keluar {fmtRp(o.expense)}
                            </span>
                          </span>
                          <span className={[styles.channelValue, o.net >= 0 ? styles.inc : styles.neg].join(' ')}>
                            {o.net >= 0 ? '+' : '−'}{fmtRp(Math.abs(o.net))}
                          </span>
                        </div>
                        <div className={styles.bar}>
                          <div className={[styles.barFill, o.net >= 0 ? styles.inc : styles.neg].join(' ')} style={{ width: `${(Math.abs(o.net) / maxOutletNet) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          {/* 2. Transaction detail table */}
          <Card>
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
                          <td className={styles.descCell}>{r.description || <EmptyValue />}</td>
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
        </>,
      )}

      {panel(
        'servis',
        <>
          {/* Mutu & kecepatan: empat readout. Tanpa LED: ambang "baik" untuk
              klaim atau batal berbeda per toko, dan lampu tanpa ambang yang
              disepakati hanya menyala tanpa arti (Lit-Signal). */}
          <Card>
            <CardHeader icon={<Icon name="gauge" aria-hidden />} title={t('reports.qualityTitle')} />
            <CardBody>
              {reportPending ? (
                <LoadState queries={reportLoad} />
              ) : (
                <dl className={styles.qGrid}>
                  <QTile
                    label={t('reports.qTurnaround')}
                    value={
                      quality.medianDays === null ? <EmptyValue /> : interpolate(t('reports.qDays'), { n: fmtDays(quality.medianDays) })
                    }
                    sub={interpolate(t('reports.qDoneSub'), { n: String(quality.done) })}
                  />
                  <QTile
                    label={t('reports.qClaims')}
                    value={quality.done > 0 ? fmtPercent(quality.claims / quality.done, 0) : <EmptyValue />}
                    sub={interpolate(t('reports.qClaimsSub'), { claims: String(quality.claims), done: String(quality.done) })}
                  />
                  <QTile
                    label={t('reports.qCancelled')}
                    value={quality.intake > 0 ? fmtPercent(quality.cancelled / quality.intake, 0) : <EmptyValue />}
                    sub={interpolate(t('reports.qCancelledSub'), { n: String(quality.cancelled), total: String(quality.intake) })}
                  />
                  <QTile
                    label={t('reports.qOverEstimate')}
                    value={quality.estimated > 0 ? `${quality.overEstimate} / ${quality.estimated}` : <EmptyValue />}
                    sub={t('reports.qOverEstimateSub')}
                  />
                </dl>
              )}
            </CardBody>
          </Card>

          {/* Unit menunggu diambil: keadaan sekarang, semua periode. Rak penuh
              unit yang tak diambil = modal part tertahan dan risiko hilang. */}
          <Card>
            <CardHeader
              icon={<Icon name="box-open" aria-hidden />}
              title={t('reports.pickupTitle')}
              action={
                <span className={styles.turnaround}>
                  {pickups.length > 0 ? `${interpolate(t('reports.pickupCount'), { n: String(pickups.length) })} · ` : ''}
                  {t('reports.allPeriods')}
                </span>
              }
            />
            <CardBody className={styles.noPad}>
              {reportPending ? (
                <LoadState queries={reportLoad} />
              ) : pickups.length === 0 ? (
                <EmptyState icon={<Icon name="circle-check" aria-hidden />} title={t('reports.pickupNone')} />
              ) : (
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <caption className={styles.srOnly}>{t('reports.pickupCaption')}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('reports.noServis')}</th>
                        <th scope="col">{t('reports.pelanggan')}</th>
                        <th scope="col">{t('reports.status')}</th>
                        <th scope="col" className={styles.num}>{t('reports.pickupWaiting')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickups.slice(0, PICKUP_ROWS).map((r) => (
                        <tr key={r.serviceId}>
                          <td className={styles.mono}>
                            <Link className={styles.catLink} to={`/services/${r.serviceId}`}>
                              {r.serviceNo}
                            </Link>
                          </td>
                          <td>{r.customerName}</td>
                          <td>{t(`status.${r.status}` as TranslationKey)}</td>
                          <td className={styles.num}>
                            <span className={[styles.ageTag, styles[`age${r.bucket === '0-7' ? 'New' : r.bucket === '8-30' ? 'Mid' : 'Old'}`]].join(' ')}>
                              {interpolate(t('reports.qDays'), { n: String(r.ageDays) })}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pickups.length > PICKUP_ROWS && (
                    <p className={styles.tableNote}>
                      {interpolate(t('reports.pickupMore'), { shown: String(PICKUP_ROWS), total: String(pickups.length) })}
                    </p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {/* 3. Profit by device category */}
          <Card>
            <CardHeader
              icon={<Icon name="microchip" aria-hidden />}
              title={<Term id="laba-servis">{t('reports.labaPerKategoriPerangkat')}</Term>}
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

          {/* Tahapan servis. Kecepatan pindah ke Mutu & Kecepatan (median dari
              unit yang SELESAI); rata-rata dari tiket masuk di sini dulu
              menjawab pertanyaan lain dengan angka yang mirip. */}
          <Card>
            <CardHeader icon={<Icon name="filter" aria-hidden />} title={t('reports.funnelServisTiketMasuk')} />
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

          {/* Teknisi menurut LABA, dari unit selesai periode ini. */}
          <Card>
            <CardHeader
              icon={<Icon name="trophy" aria-hidden />}
              title={t('reports.performaTeknisiPeriode')}
              action={<span className={styles.liveTag}>{t('reports.techSortNote')}</span>}
            />
            <CardBody className={styles.noPad}>
              {reportPending ? (
                <LoadState queries={reportLoad} />
              ) : techRows.length === 0 ? (
                <EmptyState icon={<Icon name="users" aria-hidden />} title={t('reports.belumAdaServisSelesai')} />
              ) : (
                <ul className={styles.breakdown}>
                  {techRows.map((tech) => (
                    <li key={tech.key} className={styles.channel}>
                      <div className={styles.channelTop}>
                        <span className={styles.channelName}>
                          {tech.name}{' '}
                          <span className={styles.channelMeta}>
                            ·{' '}
                            {interpolate(t('reports.techRow'), {
                              units: String(tech.units),
                              days: tech.medianDays === null ? '–' : fmtDays(tech.medianDays),
                              revenue: fmtRp(tech.revenue),
                            })}
                          </span>
                        </span>
                        <span className={[styles.channelValue, tech.profit >= 0 ? styles.inc : styles.neg].join(' ')}>
                          {signedPlain(tech.profit)}
                        </span>
                      </div>
                      <div className={styles.bar}>
                        <div
                          className={[styles.barFill, styles.brand].join(' ')}
                          style={{ width: `${(Math.max(0, tech.profit) / maxTechProfit) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>,
      )}

      {panel('stok', <>
          {/* Penjualan Kasir. Dulu Laporan hanya tahu omzetnya (kartu metrik);
              laba, barang yang menghasilkannya, diskon, dan struk batal tak
              terlihat di mana pun. */}
          <Card>
            <CardHeader
              icon={<Icon name="cash-register" aria-hidden />}
              title={t('reports.salesTitle')}
              action={<span className={styles.liveTag}>{t('reports.sSortNote')}</span>}
            />
            {reportPending ? (
              <CardBody>
                <LoadState queries={reportLoad} />
              </CardBody>
            ) : salesInfo.count === 0 && salesInfo.voidCount === 0 ? (
              <CardBody>
                <EmptyState icon={<Icon name="inbox" aria-hidden />} title={t('reports.sNone')} />
              </CardBody>
            ) : (
              <>
                <CardBody>
                  <dl className={styles.qGrid}>
                    <QTile
                      label={t('reports.sReceipts')}
                      value={String(salesInfo.count)}
                      sub={
                        salesInfo.count > 0
                          ? interpolate(t('reports.sReceiptsSub'), { avg: fmtRp(Math.round(salesInfo.revenue / salesInfo.count)) })
                          : t('reports.sNone')
                      }
                    />
                    <QTile
                      label={t('reports.sGross')}
                      value={signedPlain(salesInfo.revenue - salesInfo.cost)}
                      sub={interpolate(t('reports.sGrossSub'), {
                        pct: salesInfo.revenue > 0 ? fmtPercent((salesInfo.revenue - salesInfo.cost) / salesInfo.revenue, 0) : '–',
                        revenue: fmtRp(salesInfo.revenue),
                      })}
                    />
                    <QTile
                      label={t('reports.sDiscount')}
                      value={fmtRp(salesInfo.discount)}
                      sub={interpolate(t('reports.sDiscountSub'), {
                        pct: salesInfo.subtotal > 0 ? fmtPercent(salesInfo.discount / salesInfo.subtotal, 1) : '–',
                      })}
                    />
                    <QTile
                      label={t('reports.sVoid')}
                      value={String(salesInfo.voidCount)}
                      sub={interpolate(t('reports.sVoidSub'), { amount: fmtRp(salesInfo.voidValue) })}
                    />
                  </dl>
                </CardBody>
                {topProducts.length > 0 && (
                  <CardBody className={[styles.noPad, styles.dottedTop].join(' ')}>
                    <ul className={styles.breakdown}>
                      {topProducts.map((p) => (
                        <li key={p.key} className={styles.channel}>
                          <div className={styles.channelTop}>
                            <span className={styles.channelName}>
                              {p.name}{' '}
                              <span className={styles.channelMeta}>
                                ·{' '}
                                {interpolate(t('reports.sProductRow'), {
                                  qty: String(p.qty),
                                  revenue: fmtRp(Math.round(p.revenue)),
                                })}
                              </span>
                            </span>
                            <span className={[styles.channelValue, p.profit >= 0 ? styles.inc : styles.neg].join(' ')}>
                              {signedPlain(Math.round(p.profit))}
                            </span>
                          </div>
                          <div className={styles.bar}>
                            <div
                              className={[styles.barFill, styles.brand].join(' ')}
                              style={{ width: `${(Math.max(0, p.profit) / maxProductProfit) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                )}
              </>
            )}
          </Card>

          <div className={styles.grid}>
            {/* 4a. Sparepart usage */}
            <Card>
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
            <Card>
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
                          <span className={[styles.channelValue, critical ? styles.crit : styles.warn].join(' ')}>
                            {i.stock} / min {i.minStock}
                          </span>
                        </div>
                        <div className={styles.bar}>
                          <div
                            className={[styles.barFill, critical ? styles.crit : styles.warnFill].join(' ')}
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
      </>)}

      {panel('piutang', <>
          {/* 8. Receivables aging */}
          <Card>
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
      </>)}
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
  note,
}: {
  label: ReactNode;
  value: ReactNode;
  icon: ReactNode;
  tone: 'success' | 'neutral' | 'warning';
  /** Tanpa periode pembanding, delta `null` dan kartu diam: kalimat vonis di
   *  atasnya sudah mengatakan "tidak ada data periode lalu" sekali. Dulu tiap
   *  kartu mengulanginya, tiga kali, dan membungkus empat baris di 1097px. */
  delta?: number | null;
  deltaInverse?: boolean;
  /** Keterangan tetap di bawah angka (mis. "sudah termasuk di Pemasukan"). */
  note?: string;
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
          <span className={[styles.metricDelta, good ? styles.inc : styles.neg].join(' ')}>
            <Icon name={isUp ? 'arrow-trend-up' : 'arrow-trend-down'} aria-hidden />
            {interpolate(t('reports.deltaVsPrev'), { pct: fmtPercent(Math.abs(delta as number)) })}
          </span>
        )}
        {note && (
          <span className={[styles.metricDelta, styles.metricNoBase].join(' ')}>{note}</span>
        )}
      </div>
    </div>
  );
}

/** Satu baris struk Laba Rugi: nama (+ keterangan kecil) di kiri, nominal mono di kanan. */
function PlLine({
  label,
  sub,
  amount,
  kind = 'line',
  tone,
  muted,
}: {
  label: ReactNode;
  sub?: string;
  amount: string;
  kind?: 'line' | 'total' | 'final';
  tone?: 'ok' | 'warn' | 'crit';
  muted?: boolean;
}) {
  return (
    <li
      className={[styles.plLine, kind === 'total' ? styles.plTotal : '', kind === 'final' ? styles.plFinal : '']
        .filter(Boolean)
        .join(' ')}
      data-tone={tone}
    >
      <span className={styles.plName}>
        {tone && <span className={styles.plLed} aria-hidden />}
        <span>
          {label}
          {sub && <small className={styles.plSub}>{sub}</small>}
        </span>
      </span>
      <span className={[styles.plAmount, muted ? styles.plMuted : ''].filter(Boolean).join(' ')}>{amount}</span>
    </li>
  );
}

/** Satu readout Mutu Servis: label mono, nilai besar, keterangan dasar angkanya. */
function QTile({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className={styles.qTile}>
      <dt className={styles.qLabel}>{label}</dt>
      <dd className={styles.qValue}>{value}</dd>
      <dd className={styles.qSub}>{sub}</dd>
    </div>
  );
}
