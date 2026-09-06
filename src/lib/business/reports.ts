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
  outstandingBalance,
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
): TrendPoint[] {
  const mode = trendMode(from, to);
  const keys: string[] = [];
  const labels: string[] = [];
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
      const d = parseISODate(cursor);
      labels.push(d ? `${d.getDate()}/${d.getMonth() + 1}` : cursor);
      cursor = addDays(cursor, step);
    }
  }

  const points: TrendPoint[] = labels.map((label) => ({
    label,
    income: 0,
    expense: 0,
    net: 0,
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
 */
export function profitByDeviceCategory(services: Service[]): CategoryProfit[] {
  const map = new Map<string, CategoryProfit>();
  for (const s of services) {
    if (s.status !== 'selesai' && s.status !== 'lunas') continue;
    const cat = s.category || 'Lainnya';
    const cur = map.get(cat) ?? { category: cat, count: 0, revenue: 0, profit: 0 };
    cur.count += 1;
    cur.revenue += s.finalCost;
    cur.profit += serviceProfit(s);
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

/** Most-used spareparts across services (counts deducted inventory parts). */
export function sparepartUsage(services: Service[]): PartUsage[] {
  const map = new Map<string, PartUsage>();
  for (const s of services) {
    for (const p of s.spareparts) {
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

/** The LOCAL date a service first reached "selesai" (from history), else null. */
export function completionDate(service: Service): string | null {
  const entry = service.history.find((h) => h.status === 'selesai');
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

/**
 * Compare the selected window against the immediately-preceding window of the
 * same length (ending the day before `from`).
 */
export function periodComparison(
  incomes: Pick<Income, 'date' | 'amount' | 'category'>[],
  expenses: Pick<Expense, 'date' | 'amount' | 'category'>[],
  from: string,
  to: string,
): PeriodComparison {
  const [prevFrom, prevTo] = previousWindow(from, to);
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

/**
 * Services where work is done ("selesai") but a balance is still owed
 * (finalCost > downPayment). Aged from completion date (fallback intake).
 */
export function receivablesAging(
  services: Service[],
  today: Date = new Date(),
): Receivable[] {
  const todayStr = localDateStr(today);
  const out: Receivable[] = [];
  for (const s of services) {
    if (s.status !== 'selesai') continue;
    const outstanding = outstandingBalance(s);
    if (outstanding <= 0) continue;
    const since = completionDate(s) ?? localDateOf(s.createdAt);
    const ageDays = Math.max(0, daysBetween(since, todayStr));
    out.push({
      serviceId: s.id,
      serviceNo: s.serviceNo,
      customerName: s.customerName,
      outstanding,
      ageDays,
      bucket: agingBucket(ageDays),
    });
  }
  return out.sort((a, b) => b.ageDays - a.ageDays);
}

/** Re-export for callers that want the inventory cost of a service's parts. */
export { sparepartCost };
