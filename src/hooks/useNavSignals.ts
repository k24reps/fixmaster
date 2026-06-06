import { useMemo } from 'react';
import { useCollection } from './useCollection';
import { isActive } from '@/lib/business/services';
import { isOverdue } from '@/lib/business/tasks';
import { localDateStr } from '@/lib/time';

/**
 * Live status tone for a sidebar nav item's diagnostic readout.
 * - idle: nothing notable (dim LED, no count)
 * - info: informational activity (cyan)
 * - good: positive live state (green)
 * - warn: needs attention soon (amber)
 * - crit: needs attention now (red, pulsing)
 */
export type SignalTone = 'idle' | 'info' | 'good' | 'warn' | 'crit';

export interface NavSignal {
  count: number;
  tone: SignalTone;
  pulse: boolean;
}

const IDLE: NavSignal = { count: 0, tone: 'idle', pulse: false };

/**
 * Computes per-route live signals for the "Diagnostic Rail" sidebar.
 * Reuses existing pure business logic so the rail mirrors the same
 * numbers the pages themselves show — no duplicated rules.
 */
export function useNavSignals(): Record<string, NavSignal> {
  const { data: services } = useCollection('services');
  const { data: inventory } = useCollection('inventory');
  const { data: purchaseOrders } = useCollection('purchaseOrders');
  const { data: taskInstances } = useCollection('taskInstances');
  const { data: attendance } = useCollection('attendance');

  return useMemo(() => {
    const today = localDateStr();

    // Services: active units in the workshop; escalate if any await cost confirmation.
    const pending = services.filter((s) => isActive(s.status)).length;
    const awaitingConfirm = services.some((s) => s.status === 'konfirmasi');

    // Inventory: out-of-stock is critical, low-stock is a warning.
    const out = inventory.filter((i) => i.stock <= 0).length;
    const low = inventory.filter((i) => i.stock > 0 && i.stock <= i.minStock).length;

    // Suppliers: open purchase orders still awaiting receipt.
    const openPo = purchaseOrders.filter(
      (p) => p.status === 'ordered' || p.status === 'partial',
    ).length;

    // Tasks: overdue pending is critical; due-today pending is a warning.
    const overdue = taskInstances.filter((t) => isOverdue(t, today)).length;
    const dueToday = taskInstances.filter(
      (t) => t.status === 'pending' && t.dueDate === today,
    ).length;

    // Attendance: staff currently clocked in (checked in, not out, today).
    const working = attendance.filter(
      (a) => a.date === today && !!a.checkIn && !a.checkOut,
    ).length;

    return {
      '/services':
        pending > 0
          ? { count: pending, tone: awaitingConfirm ? 'warn' : 'info', pulse: false }
          : IDLE,
      '/inventory':
        out > 0
          ? { count: out, tone: 'crit', pulse: true }
          : low > 0
            ? { count: low, tone: 'warn', pulse: false }
            : IDLE,
      '/suppliers': openPo > 0 ? { count: openPo, tone: 'info', pulse: false } : IDLE,
      '/tasks':
        overdue > 0
          ? { count: overdue, tone: 'crit', pulse: true }
          : dueToday > 0
            ? { count: dueToday, tone: 'warn', pulse: false }
            : IDLE,
      '/attendance': working > 0 ? { count: working, tone: 'good', pulse: false } : IDLE,
    } as Record<string, NavSignal>;
  }, [services, inventory, purchaseOrders, taskInstances, attendance]);
}
