/**
 * Pure dashboard aggregation logic.
 * Computes KPIs, the service summary, technician leaderboard, and alerts from
 * raw entities. No DOM/repository dependencies → unit-testable.
 */
import type { Service, Income, Expense, Wallet, InventoryItem } from '@/data/types';
import { isInRange, localDateStr } from '@/lib/time';
import { isUnfinished, isAwaitingPickup, visibleServices } from './services';
import { operatingIncomes, operatingExpenses } from './finance';

export interface DashboardKpis {
  revenue: number;
  expense: number;
  /**
   * Pemasukan − pengeluaran operasional bulan ini. Ini ARUS KAS bersih, bukan
   * laba: DP masuk saat diterima, stok dibeli dicatat saat dibeli, dan modal
   * sparepart yang terpakai tidak dihitung.
   */
  netCashFlow: number;
  totalWallet: number;
}

export function computeKpis(
  incomes: Income[],
  expenses: Expense[],
  wallets: Wallet[],
  from: string,
  to: string,
): DashboardKpis {
  // Setoran modal / prive pemilik disaring dulu — uangnya nyata tapi bukan
  // omzet, dan dulu ikut terhitung sehingga angkanya tampak jauh lebih besar.
  const revenue = operatingIncomes(incomes)
    .filter((i) => isInRange(i.date, from, to))
    .reduce((sum, i) => sum + i.amount, 0);
  const expense = operatingExpenses(expenses)
    .filter((e) => isInRange(e.date, from, to))
    .reduce((sum, e) => sum + e.amount, 0);
  return {
    revenue,
    expense,
    netCashFlow: revenue - expense,
    totalWallet: wallets.reduce((sum, w) => sum + w.balance, 0),
  };
}

export interface TechStat {
  /** technicianId, atau nama untuk tiket lama tanpa id. */
  key: string;
  name: string;
  completed: number;
  /** Biaya final tiket yang sudah Lunas saja. */
  revenue: number;
}

/** Waktu tiket selesai dikerjakan: entri riwayat Selesai/Lunas pertama. */
function completedAt(s: Service): number {
  const entry = (s.history ?? []).find((h) => h.status === 'selesai' || h.status === 'lunas');
  return Date.parse(entry?.at ?? s.updatedAt);
}

/**
 * Tiket yang selesai dikerjakan dalam [fromISO, toISO), per teknisi. Klaim
 * garansi tidak dihitung (kerja ulang, bukan pekerjaan baru). Cermin dari
 * `service_summary` (0063) untuk mode lokal/demo.
 */
export function technicianLeaderboard(services: Service[], fromISO: string, toISO: string): TechStat[] {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  const map = new Map<string, TechStat & { at: number }>();
  for (const s of services) {
    if (!s.technicianName || s.warrantyClaimOf) continue;
    if (s.status !== 'selesai' && s.status !== 'lunas') continue;
    const at = completedAt(s);
    if (!(at >= from && at < to)) continue;
    const key = s.technicianId ?? s.technicianName;
    const cur = map.get(key) ?? { key, name: s.technicianName, completed: 0, revenue: 0, at };
    // Nama terbaru menang bila teknisi berganti nama.
    if (at >= cur.at) Object.assign(cur, { name: s.technicianName, at });
    cur.completed += 1;
    if (s.status === 'lunas') cur.revenue += s.finalCost;
    map.set(key, cur);
  }
  return [...map.values()]
    .map(({ key, name, completed, revenue }) => ({ key, name, completed, revenue }))
    .sort((a, b) => b.completed - a.completed || b.revenue - a.revenue)
    .slice(0, 5);
}

/** Angka ringkasan servis; di cloud dihitung `service_summary` (0063). */
export interface ServiceSummary {
  total: number;
  /** Masih dikerjakan (belum Selesai/Lunas/Batal). */
  unfinished: number;
  /** Diagnosa s/d pengerjaan (unfinished tanpa Diterima). */
  inProcess: number;
  confirmation: number;
  awaitingPickup: number;
  /** Selesai atau Lunas. */
  done: number;
  /** Jumlah biaya final tiket Lunas. */
  lunasValue: number;
  /** Tiket masuk dalam rentang. */
  unitsIn: number;
  leaderboard: TechStat[];
}

/** Hitungan dari tiket tak diarsip; papan teknisi dari semua tiket. */
export function serviceSummary(services: Service[], fromISO: string, toISO: string): ServiceSummary {
  const visible = visibleServices(services);
  const count = (pred: (s: Service) => boolean) => visible.filter(pred).length;
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  return {
    total: visible.length,
    unfinished: count((s) => isUnfinished(s.status)),
    inProcess: count((s) => isUnfinished(s.status) && s.status !== 'diterima'),
    confirmation: count((s) => s.status === 'konfirmasi'),
    awaitingPickup: count(isAwaitingPickup),
    done: count((s) => s.status === 'selesai' || s.status === 'lunas'),
    lunasValue: visible.filter((s) => s.status === 'lunas').reduce((sum, s) => sum + s.finalCost, 0),
    unitsIn: count((s) => {
      const at = Date.parse(s.createdAt);
      return at >= from && at < to;
    }),
    leaderboard: technicianLeaderboard(services, fromISO, toISO),
  };
}

export interface Alert {
  kind: 'confirmation' | 'out-of-stock' | 'low-stock' | 'awaiting-pickup';
  tone: 'warning' | 'danger' | 'info';
  icon: string;
  count: number;
  href: string;
}

export function computeAlerts(
  summary: Pick<ServiceSummary, 'confirmation' | 'awaitingPickup'>,
  inventory: InventoryItem[],
): Alert[] {
  const alerts: Alert[] = [];

  if (summary.confirmation > 0) {
    alerts.push({
      kind: 'confirmation',
      tone: 'warning',
      icon: 'circle-question',
      count: summary.confirmation,
      href: '/services?status=konfirmasi',
    });
  }

  const outOfStock = inventory.filter((i) => i.stock <= 0).length;
  if (outOfStock > 0) {
    alerts.push({
      kind: 'out-of-stock',
      tone: 'danger',
      icon: 'box-open',
      count: outOfStock,
      href: '/inventory?stock=out',
    });
  }
  const lowStock = inventory.filter((i) => i.stock > 0 && i.stock <= i.minStock).length;
  if (lowStock > 0) {
    alerts.push({
      kind: 'low-stock',
      tone: 'warning',
      icon: 'triangle-exclamation',
      count: lowStock,
      href: '/inventory?stock=low',
    });
  }

  if (summary.awaitingPickup > 0) {
    alerts.push({
      kind: 'awaiting-pickup',
      tone: 'info',
      icon: 'box',
      count: summary.awaitingPickup,
      href: '/services?pickup=awaiting',
    });
  }

  return alerts;
}

/**
 * Laba kotor servis dari baris laba-per-kategori (tiket yang SELESAI dalam
 * periode, `category_profit` 0074 / `profitByDeviceCategory`). Inilah "margin"
 * yang dimaksud pemilik — bukan arus kas ÷ pemasukan, yang dulu tampil 79% karena
 * pembelian stok dan DP ikut di kedua sisi.
 */
export function serviceMargin(rows: readonly { count: number; revenue: number; profit: number }[]): {
  units: number;
  revenue: number;
  profit: number;
  pct: number | null;
} {
  const units = rows.reduce((n, r) => n + r.count, 0);
  const revenue = rows.reduce((n, r) => n + r.revenue, 0);
  const profit = rows.reduce((n, r) => n + r.profit, 0);
  return { units, revenue, profit, pct: revenue > 0 ? (profit / revenue) * 100 : null };
}

/** Bagian bulan yang sudah berjalan, 0..1, termasuk hari ini. */
export function monthPace(today: Date = new Date()): number {
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return today.getDate() / days;
}

/**
 * Keadaan gauge target terhadap LAJU bulan, bukan ambang tetap. 13% pada
 * tanggal 27 dulu tampil cyan tenang karena di bawah 60% = "live"; sekarang
 * tertinggal lebih dari 10 poin dari laju = `behind`.
 */
export function targetState(pct: number, pace: number): 'ok' | 'on' | 'behind' {
  if (pct >= 100) return 'ok';
  return pct + 10 < pace * 100 ? 'behind' : 'on';
}

/**
 * Umur (hari) peringatan tertua dari tiket yang masih terbuka: konfirmasi biaya
 * sejak perubahan terakhir tiket, siap diambil sejak selesai dikerjakan.
 */
export function alertAges(
  open: readonly (Pick<Service, 'status' | 'pickedUp' | 'updatedAt' | 'completedAt'> &
    Partial<Pick<Service, 'history'>>)[],
  now: Date = new Date(),
): Partial<Record<Alert['kind'], number>> {
  const days = (iso: string) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000));
  const oldest = (dates: string[]) => (dates.length ? Math.max(...dates.map(days)) : undefined);
  const out: Partial<Record<Alert['kind'], number>> = {};
  const conf = oldest(open.filter((s) => s.status === 'konfirmasi').map((s) => s.updatedAt));
  // completedAt kosong di baris lama/lokal: pakai entri riwayat Selesai, baru updatedAt
  // (dulu tiket yang selesai hari ini terbaca "tertua 9 hari").
  const doneAt = (s: (typeof open)[number]) =>
    s.completedAt ??
    s.history?.find((h) => h.status === 'selesai' || h.status === 'lunas')?.at ??
    s.updatedAt;
  const pick = oldest(open.filter(isAwaitingPickup).map(doneAt));
  if (conf !== undefined) out.confirmation = conf;
  if (pick !== undefined) out['awaiting-pickup'] = pick;
  return out;
}

/** Revenue series for the last N days (for the trend chart). */
export function revenueSeries(
  incomes: Income[],
  days: number,
  today: Date = new Date(),
): {
  labels: string[];
  values: number[];
} {
  const labels: string[] = [];
  const values: number[] = [];
  const operating = operatingIncomes(incomes);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // Local date key — inc.date is localDateStr; a UTC key would shift the
    // whole series back a day before 07:00 WIB.
    const iso = localDateStr(d);
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    values.push(
      operating
        .filter((inc) => inc.date === iso)
        .reduce((sum, inc) => sum + inc.amount, 0),
    );
  }
  return { labels, values };
}
