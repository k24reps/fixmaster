/**
 * Pure dashboard aggregation logic.
 * Computes KPIs, technician leaderboard, and alerts from raw entities.
 * No DOM/repository dependencies → unit-testable.
 */
import type { Service, Income, Expense, Wallet, InventoryItem } from '@/data/types';
import { isInRange, localDateOf, localDateStr } from '@/lib/time';
import { isActive, isAwaitingPickup } from './services';
import { operatingIncomes, operatingExpenses } from './finance';

export interface DashboardKpis {
  unitsIn: number;
  unitsPending: number;
  revenue: number;
  expense: number;
  netProfit: number;
  totalWallet: number;
}

export function computeKpis(
  services: Service[],
  incomes: Income[],
  expenses: Expense[],
  wallets: Wallet[],
  from: string,
  to: string,
): DashboardKpis {
  const inRange = services.filter((s) => isInRange(localDateOf(s.createdAt), from, to));
  // Setoran modal / prive pemilik disaring dulu — uangnya nyata tapi bukan
  // omzet, dan dulu ikut terhitung sehingga laba tampak jauh lebih besar.
  const revenue = operatingIncomes(incomes)
    .filter((i) => isInRange(i.date, from, to))
    .reduce((sum, i) => sum + i.amount, 0);
  const expense = operatingExpenses(expenses)
    .filter((e) => isInRange(e.date, from, to))
    .reduce((sum, e) => sum + e.amount, 0);
  return {
    unitsIn: inRange.length,
    unitsPending: services.filter((s) => isActive(s.status)).length,
    revenue,
    expense,
    netProfit: revenue - expense,
    totalWallet: wallets.reduce((sum, w) => sum + w.balance, 0),
  };
}

export interface TechStat {
  name: string;
  completed: number;
  revenue: number;
}

export function technicianLeaderboard(services: Service[]): TechStat[] {
  const map = new Map<string, TechStat>();
  for (const s of services) {
    if (!s.technicianName) continue;
    if (s.status !== 'selesai' && s.status !== 'lunas') continue;
    const cur = map.get(s.technicianName) ?? {
      name: s.technicianName,
      completed: 0,
      revenue: 0,
    };
    cur.completed += 1;
    cur.revenue += s.finalCost;
    map.set(s.technicianName, cur);
  }
  return [...map.values()].sort((a, b) => b.completed - a.completed).slice(0, 5);
}

export interface Alert {
  kind: 'confirmation' | 'out-of-stock' | 'low-stock' | 'awaiting-pickup';
  tone: 'warning' | 'danger' | 'info';
  icon: string;
  count: number;
  href: string;
}

export function computeAlerts(services: Service[], inventory: InventoryItem[]): Alert[] {
  const alerts: Alert[] = [];

  const awaitingConfirm = services.filter((s) => s.status === 'konfirmasi').length;
  if (awaitingConfirm > 0) {
    alerts.push({
      kind: 'confirmation',
      tone: 'warning',
      icon: 'circle-question',
      count: awaitingConfirm,
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

  const readyUncollected = services.filter(isAwaitingPickup).length;
  if (readyUncollected > 0) {
    alerts.push({
      kind: 'awaiting-pickup',
      tone: 'info',
      icon: 'box',
      count: readyUncollected,
      href: '/services?pickup=awaiting',
    });
  }

  return alerts;
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
