/**
 * Pure dashboard aggregation logic.
 * Computes KPIs, technician leaderboard, and alerts from raw entities.
 * No DOM/repository dependencies → unit-testable.
 */
import type { Service, Income, Expense, Wallet, InventoryItem } from '@/data/types';
import { isInRange } from '@/lib/time';
import { isActive } from './services';

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
  const inRange = services.filter((s) => isInRange(s.createdAt.slice(0, 10), from, to));
  const revenue = incomes
    .filter((i) => isInRange(i.date, from, to))
    .reduce((sum, i) => sum + i.amount, 0);
  const expense = expenses
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
    const cur = map.get(s.technicianName) ?? { name: s.technicianName, completed: 0, revenue: 0 };
    cur.completed += 1;
    cur.revenue += s.finalCost;
    map.set(s.technicianName, cur);
  }
  return [...map.values()].sort((a, b) => b.completed - a.completed).slice(0, 5);
}

export interface Alert {
  tone: 'warning' | 'danger' | 'info';
  icon: string;
  message: string;
}

export function computeAlerts(services: Service[], inventory: InventoryItem[]): Alert[] {
  const alerts: Alert[] = [];

  const awaitingConfirm = services.filter((s) => s.status === 'konfirmasi').length;
  if (awaitingConfirm > 0) {
    alerts.push({
      tone: 'warning',
      icon: 'fa-circle-question',
      message: `${awaitingConfirm} unit menunggu konfirmasi biaya`,
    });
  }

  const outOfStock = inventory.filter((i) => i.stock <= 0).length;
  if (outOfStock > 0) {
    alerts.push({ tone: 'danger', icon: 'fa-box-open', message: `${outOfStock} sparepart habis` });
  }
  const lowStock = inventory.filter((i) => i.stock > 0 && i.stock <= i.minStock).length;
  if (lowStock > 0) {
    alerts.push({
      tone: 'warning',
      icon: 'fa-triangle-exclamation',
      message: `${lowStock} sparepart stok menipis`,
    });
  }

  const readyUncollected = services.filter((s) => s.status === 'selesai').length;
  if (readyUncollected > 0) {
    alerts.push({
      tone: 'info',
      icon: 'fa-box',
      message: `${readyUncollected} unit selesai menunggu diambil`,
    });
  }

  return alerts;
}

/** Revenue series for the last N days (for the trend chart). */
export function revenueSeries(incomes: Income[], days: number, today: Date = new Date()): {
  labels: string[];
  values: number[];
} {
  const labels: string[] = [];
  const values: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    values.push(
      incomes.filter((inc) => inc.date === iso).reduce((sum, inc) => sum + inc.amount, 0),
    );
  }
  return { labels, values };
}
