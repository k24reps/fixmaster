/**
 * Pure reporting aggregations for the Reports page. No DOM/repository deps →
 * fully unit-testable. Covers: income/expense trend series, profit by device
 * category, sparepart usage + restock, service funnel + turnaround, period
 * comparison, per-outlet comparison, and receivables aging.
 */
import type {
  Service,
  Income,
  Expense,
  InventoryItem,
  Outlet,
  Sale,
  ServiceStatus,
} from '@/data/types';
import {
  addDays,
  daysBetween,
  parseISODate,
  isInRange,
  localDateOf,
  localDateStr,
} from '@/lib/time';
import {
  summarize,
  operatingIncomes,
  operatingExpenses,
  type FinanceSummary,
} from './finance';
import {
  cancelledProfit,
  heldCost,
  outstandingBalance,
  retainedDownPayment,
  serviceProfit,
  sparepartCost,
  STATUS_LABELS,
} from './services';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

// ---------- 1. Income vs expense trend series ----------
export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
  net: number;
  /** Ember yang mulai setelah hari ini. Nolnya bukan fakta, jadi tidak digambar. */
  future?: boolean;
}

export interface TrendGeometry {
  width: number;
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  plotW: number;
  plotH: number;
  /** Nilai tertinggi pada sumbu Y (minimal 1, supaya tidak pernah bagi nol). */
  max: number;
  /** Titik ke-i → koordinat X. */
  x: (i: number) => number;
  /** Nominal → koordinat Y. Sama untuk pemasukan dan pengeluaran (satu skala). */
  y: (value: number) => number;
  incPath: string;
  expPath: string;
  /** `incPath` yang ditutup ke garis dasar, untuk arsiran di bawah pemasukan. */
  incArea: string;
  gridYs: { y: number; value: number }[];
  /** Label sumbu X yang lolos penjarangan (maksimal ~8 supaya tidak berdesakan). */
  xLabels: { x: number; label: string }[];
  /** X titik terakhir yang sudah terjadi, bila ada ember di masa depan; selain itu null. */
  nowX: number | null;
}

const TREND_SIZE = { width: 720, height: 240 };
// Kiri 68: label Y terpanjang ("12,5 jt", 7–8 karakter mono 12px ≈ 58px) + 8
// jarak ke garis. Sejak viewBox selebar wadah (1:1), label tak lagi diskalakan,
// jadi 56 memotong "2,63 jt" di 390px.
const TREND_PAD = { top: 16, right: 16, bottom: 28, left: 68 };

/**
 * Geometri grafik tren: jalur, gridline, dan posisi label — murni, tanpa DOM.
 *
 * Dipakai `TrendChart` di layar DAN dokumen cetak laporan. Rumusnya hanya boleh
 * hidup sekali: dua salinan berarti grafik di PDF bisa diam-diam menggambar
 * bentuk yang berbeda dari yang dilihat pemilik di layar, dan tidak ada yang
 * akan menyadarinya.
 */
export function trendGeometry(
  points: TrendPoint[],
  size: { width?: number; height?: number } = {},
): TrendGeometry {
  const width = size.width ?? TREND_SIZE.width;
  const height = size.height ?? TREND_SIZE.height;
  const pad = TREND_PAD;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => Math.max(p.income, p.expense)));
  const n = points.length;

  const x = (i: number) => pad.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  // Garis berhenti di hari ini. Dulu sisa bulan digambar sebagai garis datar
  // nol, yang terbaca "tidak ada pemasukan" padahal harinya belum terjadi.
  const past = points.filter((p) => !p.future).length;
  const toPath = (sel: (p: TrendPoint) => number) =>
    points
      .slice(0, past)
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(sel(p)).toFixed(1)}`)
      .join(' ');

  const incPath = toPath((p) => p.income);
  // Maksimal 8 label, dan tak lebih rapat dari satu per ±56 unit (label mono
  // "13/11" ±40px + jarak) — grafik selebar ponsel cuma muat 4.
  const maxLabels = Math.max(2, Math.min(8, Math.floor(plotW / 56)));
  const labelStep = Math.max(1, Math.ceil(n / maxLabels));

  return {
    width,
    height,
    pad,
    plotW,
    plotH,
    max,
    x,
    y,
    incPath,
    expPath: toPath((p) => p.expense),
    incArea: past === 0 ? '' : `${incPath} L ${x(past - 1)} ${pad.top + plotH} L ${x(0)} ${pad.top + plotH} Z`,
    gridYs: [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: pad.top + plotH - f * plotH,
      value: Math.round(max * f),
    })),
    xLabels: points
      .map((p, i) => ({ x: x(i), label: p.label, i }))
      .filter(({ i }) => i % labelStep === 0),
    nowX: past < n && past > 0 ? x(past - 1) : past === 0 && n > 0 ? pad.left : null,
  };
}

type TrendMode = 'day' | 'week' | 'month';

/** Pick bucket granularity from the span so the chart never gets too dense. */
export function trendMode(from: string, to: string): TrendMode {
  const span = daysBetween(from, to);
  if (span <= 31) return 'day';
  if (span <= 184) return 'week';
  return 'month';
}

/**
 * Bucketed income/expense series across [from, to]. Daily for short ranges,
 * weekly for medium, monthly for long — keeps the line chart readable.
 */
export function trendSeries(
  incomes: Pick<Income, 'date' | 'amount' | 'category'>[],
  expenses: Pick<Expense, 'date' | 'amount' | 'category'>[],
  from: string,
  to: string,
  today: string = localDateStr(),
): TrendPoint[] {
  const mode = trendMode(from, to);
  const keys: string[] = [];
  const labels: string[] = [];
  const starts: string[] = [];
  const indexOf = new Map<string, number>();

  if (mode === 'month') {
    const start = parseISODate(from);
    const end = parseISODate(to);
    if (!start || !end) return [];
    let y = start.getFullYear();
    let m = start.getMonth();
    while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      indexOf.set(key, keys.length);
      keys.push(key);
      starts.push(`${key}-01`);
      labels.push(`${MONTH_LABELS[m]} ${String(y).slice(2)}`);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  } else {
    const step = mode === 'week' ? 7 : 1;
    let cursor = from;
    while (cursor <= to) {
      const key = `b${keys.length}`;
      indexOf.set(key, keys.length);
      keys.push(key);
      starts.push(cursor);
      const d = parseISODate(cursor);
      labels.push(d ? `${d.getDate()}/${d.getMonth() + 1}` : cursor);
      cursor = addDays(cursor, step);
    }
  }

  const points: TrendPoint[] = labels.map((label, i) => ({
    label,
    income: 0,
    expense: 0,
    net: 0,
    future: starts[i] > today,
  }));
  const bucketIndex = (date: string): number => {
    if (mode === 'month') return indexOf.get(date.slice(0, 7)) ?? -1;
    const step = mode === 'week' ? 7 : 1;
    const offset = daysBetween(from, date);
    if (offset < 0) return -1;
    return Math.min(keys.length - 1, Math.floor(offset / step));
  };

  // Modal/prive pemilik tak masuk tren usaha — kalau ikut, grafiknya lebih
  // mencerminkan kapan pemilik menyuntik dana daripada kapan bengkel ramai.
  for (const i of operatingIncomes(incomes)) {
    if (!isInRange(i.date, from, to)) continue;
    const idx = bucketIndex(i.date);
    if (idx >= 0) points[idx].income += i.amount;
  }
  for (const e of operatingExpenses(expenses)) {
    if (!isInRange(e.date, from, to)) continue;
    const idx = bucketIndex(e.date);
    if (idx >= 0) points[idx].expense += e.amount;
  }
  for (const p of points) p.net = p.income - p.expense;
  return points;
}

// ---------- 2. Transaction rows (for the on-screen table + CSV) ----------
export interface TxnRow {
  date: string;
  type: 'Pemasukan' | 'Pengeluaran';
  category: string;
  description: string;
  amount: number; // signed: income positive, expense negative
}

/** Flatten incomes + expenses into signed rows, newest first. */
export function transactionRows(
  incomes: Pick<Income, 'date' | 'category' | 'description' | 'amount'>[],
  expenses: Pick<Expense, 'date' | 'category' | 'description' | 'amount'>[],
): TxnRow[] {
  const rows: TxnRow[] = [
    ...incomes.map((i) => ({
      date: i.date,
      type: 'Pemasukan' as const,
      category: i.category,
      description: i.description,
      amount: i.amount,
    })),
    ...expenses.map((e) => ({
      date: e.date,
      type: 'Pengeluaran' as const,
      category: e.category,
      description: e.description,
      amount: -e.amount,
    })),
  ];
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- 3. Profit by device category ----------
export interface CategoryProfit {
  category: string;
  count: number;
  revenue: number;
  profit: number;
}

/**
 * Revenue + gross profit grouped by device category, for realized services
 * (selesai/lunas). Profit = finalCost − sparepart cost.
 *
 * Tiket batal ikut bila ada uang yang tertinggal di toko: DP yang ditahan jadi
 * pendapatan, part terpakai & modal dadakan jadi biaya. Ia tidak menambah
 * `count` — unitnya tidak selesai. Cermin `category_profit` (0093).
 */
export function profitByDeviceCategory(services: Service[]): CategoryProfit[] {
  const map = new Map<string, CategoryProfit>();
  for (const s of services) {
    const cancelled = s.status === 'batal';
    if (s.status !== 'selesai' && s.status !== 'lunas' && !cancelled) continue;
    const kept = cancelled ? retainedDownPayment(s) : null;
    if (cancelled && (kept === null || (kept === 0 && heldCost(s.spareparts) === 0))) continue;
    const cat = s.category || 'Lainnya';
    const cur = map.get(cat) ?? { category: cat, count: 0, revenue: 0, profit: 0 };
    if (cancelled) {
      cur.revenue += kept ?? 0;
      cur.profit += cancelledProfit(s) ?? 0;
    } else {
      cur.count += 1;
      cur.revenue += s.finalCost;
      cur.profit += serviceProfit(s);
    }
    map.set(cat, cur);
  }
  return [...map.values()].sort((a, b) => b.profit - a.profit);
}

// ---------- 4. Sparepart usage + restock ----------
export interface PartUsage {
  name: string;
  qty: number;
  cost: number;
}

/**
 * Sparepart yang benar-benar TERPAKAI: hanya baris inventori yang stoknya
 * sudah dipotong. Dulu setiap baris dihitung — termasuk yang baru direncanakan
 * dan baris biaya dadakan (manual) yang bukan barang stok — sehingga laporan
 * pemakaian selalu lebih besar dari kenyataan, dan dipakai untuk memutuskan
 * pembelian.
 */
export function sparepartUsage(services: Service[]): PartUsage[] {
  const map = new Map<string, PartUsage>();
  for (const s of services) {
    for (const p of s.spareparts) {
      if (!p.deducted || p.kind === 'manual') continue;
      const key = p.name;
      const cur = map.get(key) ?? { name: key, qty: 0, cost: 0 };
      cur.qty += p.qty;
      cur.cost += p.qty * p.costPrice;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty);
}

/** Items at or below their minimum stock threshold, neediest first. */
export function restockSuggestions(inventory: InventoryItem[]): InventoryItem[] {
  return inventory.filter((i) => i.stock <= i.minStock).sort((a, b) => a.stock - b.stock);
}

// ---------- 5. Service funnel + turnaround ----------
export interface FunnelStage {
  status: ServiceStatus;
  label: string;
  count: number;
}

const FUNNEL_ORDER: ServiceStatus[] = [
  'diterima',
  'diagnosa',
  'konfirmasi',
  'tunggu',
  'pengerjaan',
  'selesai',
  'lunas',
  'batal',
];

/** Count of services per status, in workflow order (zero stages dropped). */
export function serviceFunnel(services: Service[]): FunnelStage[] {
  const counts = new Map<ServiceStatus, number>();
  for (const s of services) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
  return FUNNEL_ORDER.filter((st) => (counts.get(st) ?? 0) > 0).map((st) => ({
    status: st,
    label: STATUS_LABELS[st],
    count: counts.get(st) ?? 0,
  }));
}

/**
 * The LOCAL date a service first reached "selesai", else null.
 *
 * Prefers the `completedAt` column (migrasi 0080). Memindai `history` adalah
 * jalur mundur untuk baris yang belum membawanya — adapter lokal/demo, dan
 * baris cloud lama seandainya backfill belum jalan. Karena kolom ini ada,
 * Laporan tidak lagi perlu memuat `history` sama sekali (≈78% tiap baris).
 */
export function completionDate(service: Service): string | null {
  if (service.completedAt) return localDateOf(service.completedAt);
  const entry = (service.history ?? []).find((h) => h.status === 'selesai');
  return entry ? localDateOf(entry.at) : null;
}

/** Tanggal lokal tiket dibatalkan (entri `batal` terakhir), else null. */
export function cancelDate(service: Service): string | null {
  const entry = [...(service.history ?? [])].reverse().find((h) => h.status === 'batal');
  return entry ? localDateOf(entry.at) : null;
}

/**
 * Average turnaround in days (intake → first "selesai") across services that
 * have been completed. Returns 0 when none qualify.
 */
export function avgTurnaroundDays(services: Service[]): number {
  const spans: number[] = [];
  for (const s of services) {
    const done = completionDate(s);
    if (!done) continue;
    const span = daysBetween(localDateOf(s.createdAt), done);
    if (span >= 0) spans.push(span);
  }
  if (spans.length === 0) return 0;
  return spans.reduce((a, b) => a + b, 0) / spans.length;
}

// ---------- 6. Period comparison ----------
export interface PeriodComparison {
  current: FinanceSummary;
  previous: FinanceSummary;
  /** Pecahan, mis. 0.25 = +25%. `null` = tidak ada dasar pembanding. */
  incomeDelta: number | null;
  expenseDelta: number | null;
  netDelta: number | null;
}

/**
 * Jendela pembanding: periode sepanjang yang sama, berakhir sehari sebelum
 * `from`. Diekspor supaya pemanggil bisa MENGAMBIL data periode itu — dulu
 * batas ini hanya hidup di dalam periodComparison, sehingga tidak ada yang
 * sadar bahwa datanya tidak pernah ikut di-fetch.
 */
export function previousWindow(from: string, to: string): [string, string] {
  const span = daysBetween(from, to);
  return [addDays(from, -(span + 1)), addDays(from, -1)];
}

/**
 * Delta rasio terhadap periode sebelumnya; +1 = dua kali lipat, -1 = jadi nol.
 *
 * `null` berarti TIDAK ADA DASAR PEMBANDING — periode lalu nol sementara
 * periode ini tidak. Dulu kasus ini mengembalikan `1`, yang tampil sebagai
 * "+100,0%" dan tidak bisa dibedakan dari pertumbuhan dua kali lipat yang
 * sungguhan. Angka yang mengaku tidak punya dasar lebih berharga daripada
 * angka yang mengarangnya (PRODUCT.md, Prinsip 4).
 */
export function ratioDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

export interface ComparisonWindows {
  /** Jendela periode ini yang SUDAH terjadi: `to` dipotong ke hari ini. */
  current: [string, string];
  previous: [string, string];
  /** `to` dipotong karena periode masih berjalan. */
  clamped: boolean;
}

/**
 * Jendela yang adil untuk "vs periode lalu".
 *
 * Periode bawaan Laporan adalah bulan berjalan sampai tanggal terakhirnya. Dulu
 * 1–30 Nov dibandingkan dengan 30 hari penuh sebelumnya, padahal pada 14 Nov
 * baru ada 14 hari data — di pertengahan bulan selisihnya hampir selalu
 * "lebih buruk ±50%". Sekarang periode dipotong ke hari ini, dan satu bulan
 * kalender dibandingkan dengan rentang tanggal yang sama di bulan sebelumnya
 * (1–14 Nov vs 1–14 Okt), bukan 14 hari terakhir Oktober: sewa dan gaji jatuh
 * di tanggal yang sama tiap bulan, jadi jendela geser akan membandingkan bulan
 * yang membayar sewa dengan yang tidak.
 */
export function comparisonWindows(from: string, to: string, today: string = localDateStr()): ComparisonWindows {
  const clamped = from <= today && today < to;
  const end = clamped ? today : to;
  const f = parseISODate(from);
  const t = parseISODate(to);
  const wholeMonth =
    !!f &&
    !!t &&
    f.getDate() === 1 &&
    f.getFullYear() === t.getFullYear() &&
    f.getMonth() === t.getMonth() &&
    addDays(to, 1).slice(8) === '01';
  if (wholeMonth && f) {
    const prevFirst = localDateStr(new Date(f.getFullYear(), f.getMonth() - 1, 1, 12));
    const prevLast = addDays(from, -1);
    const prevEnd = addDays(prevFirst, daysBetween(from, end));
    return { current: [from, end], previous: [prevFirst, prevEnd < prevLast ? prevEnd : prevLast], clamped };
  }
  return { current: [from, end], previous: previousWindow(from, end), clamped };
}

/**
 * Compare the selected window against a previous window — by default the
 * immediately-preceding window of the same length (ending the day before
 * `from`); pass `prev` from `comparisonWindows` for the calendar-aware one.
 */
export function periodComparison(
  incomes: Pick<Income, 'date' | 'amount' | 'category'>[],
  expenses: Pick<Expense, 'date' | 'amount' | 'category'>[],
  from: string,
  to: string,
  prev: [string, string] = previousWindow(from, to),
): PeriodComparison {
  const [prevFrom, prevTo] = prev;
  const curInc = incomes.filter((i) => isInRange(i.date, from, to));
  const curExp = expenses.filter((e) => isInRange(e.date, from, to));
  const prevInc = incomes.filter((i) => isInRange(i.date, prevFrom, prevTo));
  const prevExp = expenses.filter((e) => isInRange(e.date, prevFrom, prevTo));
  const current = summarize(curInc, curExp);
  const previous = summarize(prevInc, prevExp);
  return {
    current,
    previous,
    incomeDelta: ratioDelta(current.income, previous.income),
    expenseDelta: ratioDelta(current.expense, previous.expense),
    netDelta: ratioDelta(current.net, previous.net),
  };
}

// ---------- 7. Per-outlet comparison ----------
export interface OutletStat {
  outletId: string | null;
  name: string;
  income: number;
  expense: number;
  net: number;
}

/**
 * Income/expense/net grouped by outlet over [from, to]. Transactions with a
 * null outlet_id (shared/legacy) are grouped under "Tanpa Cabang".
 */
export function outletComparison(
  incomes: (Pick<Income, 'date' | 'amount' | 'category'> & { outletId: string | null })[],
  expenses: (Pick<Expense, 'date' | 'amount' | 'category'> & {
    outletId: string | null;
  })[],
  outlets: Pick<Outlet, 'id' | 'name'>[],
  from: string,
  to: string,
): OutletStat[] {
  const nameOf = (id: string | null) =>
    id ? (outlets.find((o) => o.id === id)?.name ?? 'Cabang') : 'Tanpa Cabang';
  const map = new Map<string, OutletStat>();
  const bucket = (id: string | null) => {
    const key = id ?? '__none__';
    let cur = map.get(key);
    if (!cur) {
      cur = { outletId: id, name: nameOf(id), income: 0, expense: 0, net: 0 };
      map.set(key, cur);
    }
    return cur;
  };
  for (const i of operatingIncomes(incomes)) {
    if (!isInRange(i.date, from, to)) continue;
    bucket(i.outletId).income += i.amount;
  }
  for (const e of operatingExpenses(expenses)) {
    if (!isInRange(e.date, from, to)) continue;
    bucket(e.outletId).expense += e.amount;
  }
  for (const stat of map.values()) stat.net = stat.income - stat.expense;
  return [...map.values()].sort((a, b) => b.net - a.net);
}

// ---------- 8. Receivables aging ----------
export type AgingBucket = '0-7' | '8-30' | '31+';

export interface Receivable {
  serviceId: string;
  serviceNo: string;
  customerName: string;
  outstanding: number;
  ageDays: number;
  bucket: AgingBucket;
}

function agingBucket(ageDays: number): AgingBucket {
  if (ageDays <= 7) return '0-7';
  if (ageDays <= 30) return '8-30';
  return '31+';
}

/** Satu piutang sebelum umurnya dihitung — bentuk yang sama dari server (0074) maupun dari daftar tiket lokal. */
export interface ReceivableRow {
  serviceId: string;
  serviceNo: string;
  customerName: string;
  outstanding: number;
  /** Tanggal lokal mulai dihitung umurnya: tanggal selesai, atau tanggal masuk. */
  since: string;
}

/**
 * Umur piutang dari baris yang sudah disaring. Satu aturan umur untuk dua
 * sumber: RPC service_receivables (cloud — SELURUH tiket, bukan hanya yang
 * dibuat pada periode yang sedang dilihat) dan daftar tiket lokal.
 */
export function agingFromRows(rows: ReceivableRow[], today: Date = new Date()): Receivable[] {
  const todayStr = localDateStr(today);
  return rows
    .map((r) => {
      const ageDays = Math.max(0, daysBetween(r.since, todayStr));
      return { ...r, ageDays, bucket: agingBucket(ageDays) };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Services where work is done ("selesai") but a balance is still owed
 * (finalCost > downPayment). Aged from completion date (fallback intake).
 */
export function receivablesAging(
  services: Service[],
  today: Date = new Date(),
): Receivable[] {
  const rows: ReceivableRow[] = [];
  for (const s of services) {
    if (s.status !== 'selesai') continue;
    const outstanding = outstandingBalance(s);
    if (outstanding <= 0) continue;
    rows.push({
      serviceId: s.id,
      serviceNo: s.serviceNo,
      customerName: s.customerName,
      outstanding,
      since: completionDate(s) ?? localDateOf(s.createdAt),
    });
  }
  return agingFromRows(rows, today);
}

/** Re-export for callers that want the inventory cost of a service's parts. */
export { sparepartCost };

// ---------- 9. Mutu & kecepatan servis ----------
/** Biaya akhir yang melewati estimasi lebih dari ini dihitung "meleset". */
export const OVER_ESTIMATE_TOLERANCE = 0.1;

export interface ServiceQuality {
  /** Tiket masuk periode ini, tanpa tiket klaim garansi. */
  intake: number;
  /** Dari tiket masuk itu, yang berstatus batal. */
  cancelled: number;
  /** Tiket klaim garansi yang masuk periode ini (unit yang balik). */
  claims: number;
  /** Unit yang SELESAI periode ini, tanpa klaim (kerja ulang bukan pekerjaan baru). */
  done: number;
  /** Median hari dari unit diterima sampai selesai; null tanpa unit selesai. */
  medianDays: number | null;
  /** Unit selesai yang punya estimasi dan biaya akhir. */
  estimated: number;
  /** Dari `estimated`, yang biaya akhirnya > estimasi + 10%. */
  overEstimate: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function turnaroundDays(s: Service): number | null {
  const done = completionDate(s);
  if (!done) return null;
  const span = daysBetween(localDateOf(s.createdAt), done);
  return span >= 0 ? span : null;
}

/**
 * Mutu servis dari dua himpunan yang berbeda definisi periodenya, sengaja:
 * batal & klaim dihitung dari tiket yang MASUK (kapan pelanggan datang),
 * kecepatan & estimasi dari unit yang SELESAI (kapan pekerjaan tuntas) —
 * definisi yang sama dengan Laba per Kategori dan Performa Teknisi.
 *
 * Median, bukan rata-rata: satu unit yang menunggu part tiga minggu menarik
 * rata-rata jauh dari pengalaman pelanggan biasa.
 */
export function serviceQuality(intake: Service[], done: Service[]): ServiceQuality {
  const fresh = intake.filter((s) => !s.warrantyClaimOf);
  const finished = done.filter((s) => !s.warrantyClaimOf);
  const withEstimate = finished.filter((s) => s.estimateCost > 0 && s.finalCost > 0);
  return {
    intake: fresh.length,
    cancelled: fresh.filter((s) => s.status === 'batal').length,
    claims: intake.length - fresh.length,
    done: finished.length,
    medianDays: median(finished.map(turnaroundDays).filter((d): d is number => d !== null)),
    estimated: withEstimate.length,
    overEstimate: withEstimate.filter((s) => s.finalCost > s.estimateCost * (1 + OVER_ESTIMATE_TOLERANCE)).length,
  };
}

export interface TechProfit {
  /** technicianId, atau nama untuk tiket lama tanpa id. */
  key: string;
  name: string;
  units: number;
  revenue: number;
  profit: number;
  medianDays: number | null;
}

/**
 * Teknisi menurut LABA dari unit yang selesai periode ini. Dulu papan ini
 * diurutkan menurut nilai Lunas, sehingga teknisi yang memasang LCD mahal
 * menang atas teknisi yang cepat dan bermargin baik — omzet part bukan
 * kerjanya. Klaim garansi tidak dihitung, sama dengan papan lama.
 */
export function technicianProfit(done: Service[]): TechProfit[] {
  const map = new Map<string, TechProfit & { spans: number[] }>();
  for (const s of done) {
    if (!s.technicianName || s.warrantyClaimOf) continue;
    if (s.status !== 'selesai' && s.status !== 'lunas') continue;
    const key = s.technicianId ?? s.technicianName;
    const cur = map.get(key) ?? { key, name: s.technicianName, units: 0, revenue: 0, profit: 0, medianDays: null, spans: [] };
    cur.units += 1;
    cur.revenue += s.finalCost;
    cur.profit += serviceProfit(s);
    const span = turnaroundDays(s);
    if (span !== null) cur.spans.push(span);
    map.set(key, cur);
  }
  return [...map.values()]
    .map(({ spans, ...t }) => ({ ...t, medianDays: median(spans) }))
    .sort((a, b) => b.profit - a.profit || b.units - a.units);
}

export interface PickupWait {
  serviceId: string;
  serviceNo: string;
  customerName: string;
  customerPhone: string;
  status: ServiceStatus;
  ageDays: number;
  bucket: AgingBucket;
}

/**
 * Unit yang sudah selesai (atau batal) tapi belum diambil, tertua dulu. Umur
 * dihitung dari tanggal selesai; tiket batal dari tanggal batal, lalu
 * `updatedAt` bila riwayatnya tidak dimuat (daftar cloud tanpa `history`).
 */
export function awaitingPickup(
  services: Pick<
    Service,
    'id' | 'serviceNo' | 'customerName' | 'customerPhone' | 'status' | 'pickedUp' | 'createdAt' | 'updatedAt' | 'completedAt' | 'history'
  >[],
  today: Date = new Date(),
): PickupWait[] {
  const todayStr = localDateStr(today);
  return services
    .filter((s) => !s.pickedUp && (s.status === 'selesai' || s.status === 'lunas' || s.status === 'batal'))
    .map((s) => {
      const since =
        (s.status === 'batal' ? cancelDate(s as Service) : completionDate(s as Service)) ?? localDateOf(s.updatedAt);
      const ageDays = Math.max(0, daysBetween(since, todayStr));
      return {
        serviceId: s.id,
        serviceNo: s.serviceNo,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        status: s.status,
        ageDays,
        bucket: agingBucket(ageDays),
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
}

// ---------- 10. Penjualan kasir ----------
export interface ProductSales {
  /** itemId; nama terbaru menang bila barangnya berganti nama. */
  key: string;
  name: string;
  qty: number;
  /** Omzet setelah diskon struk dibagi proporsional ke tiap baris. */
  revenue: number;
  profit: number;
}

export interface SalesBreakdown {
  /** Struk sah (tidak dibatalkan) di periode. */
  count: number;
  revenue: number;
  cost: number;
  /** Potongan harga yang diberikan: subtotal − total. */
  discount: number;
  /** Jumlah harga jual sebelum diskon, dasar persen diskon. */
  subtotal: number;
  voidCount: number;
  voidValue: number;
  /** Diurutkan menurut laba. */
  products: ProductSales[];
}

/**
 * Penjualan Kasir per barang. Diskon struk dibagi ke barisnya sebanding harga
 * jual, supaya jumlah omzet per barang SAMA dengan total struk (angka yang
 * dipakai Laba Rugi) — tanpa itu barang di struk berdiskon terlihat lebih
 * untung daripada kenyataannya. Struk batal dihitung terpisah, bukan dibuang:
 * pembatalan yang sering adalah hal yang perlu dilihat pemilik.
 */
export function salesBreakdown(
  sales: Pick<Sale, 'date' | 'lines' | 'subtotal' | 'total' | 'voided'>[],
  from: string,
  to: string,
): SalesBreakdown {
  const out: SalesBreakdown = {
    count: 0,
    revenue: 0,
    cost: 0,
    discount: 0,
    subtotal: 0,
    voidCount: 0,
    voidValue: 0,
    products: [],
  };
  const map = new Map<string, ProductSales>();
  for (const s of sales) {
    if (!isInRange(s.date, from, to)) continue;
    if (s.voided) {
      out.voidCount += 1;
      out.voidValue += s.total;
      continue;
    }
    out.count += 1;
    out.revenue += s.total;
    out.subtotal += s.subtotal;
    out.discount += Math.max(0, s.subtotal - s.total);
    const ratio = s.subtotal > 0 ? s.total / s.subtotal : 0;
    for (const l of s.lines) {
      const cost = l.qty * l.costPrice;
      out.cost += cost;
      const revenue = l.qty * l.sellPrice * ratio;
      const cur = map.get(l.itemId) ?? { key: l.itemId, name: l.name, qty: 0, revenue: 0, profit: 0 };
      cur.name = l.name;
      cur.qty += l.qty;
      cur.revenue += revenue;
      cur.profit += revenue - cost;
      map.set(l.itemId, cur);
    }
  }
  out.products = [...map.values()].sort((a, b) => b.profit - a.profit || b.qty - a.qty);
  return out;
}

// ---------- 11. Pintasan periode ----------
export const PERIOD_PRESETS = ['today', '7d', 'month', 'lastMonth', 'year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/**
 * Rentang tanggal untuk satu pintasan. Bulan dan tahun memakai rentang
 * kalender PENUH, sama dengan bawaan halaman: bagian yang belum terjadi sudah
 * ditangani `comparisonWindows` dan grafik, jadi pintasan tak perlu memotongnya.
 */
export function periodPreset(id: PeriodPreset, today: string = localDateStr()): [string, string] {
  const d = parseISODate(today);
  if (!d) return [today, today];
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = (yy: number, mm: number, dd: number) => localDateStr(new Date(yy, mm, dd, 12));
  switch (id) {
    case 'today':
      return [today, today];
    case '7d':
      return [addDays(today, -6), today];
    case 'month':
      return [day(y, m, 1), day(y, m + 1, 0)];
    case 'lastMonth':
      return [day(y, m - 1, 1), day(y, m, 0)];
    case 'year':
      return [day(y, 0, 1), day(y, 11, 31)];
  }
}

