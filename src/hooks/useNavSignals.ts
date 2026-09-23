import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/data';
import { useCollection, useDerivedQuery } from './useCollection';
import { useCollectionRange } from './useCollectionRange';
import { isActive } from '@/lib/business/services';
import { groupTaskCounts, visibleTaskCounts } from '@/lib/business/tasks';
import type { TaskCountGroup } from '@/data/types';
import { localDateStr } from '@/lib/time';
import { roleAllows } from '@/config/plans';
import { useSessionStore } from '@/stores/session';

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
const NO_TASK_GROUPS: TaskCountGroup[] = [];

/**
 * Computes per-route live signals for the "Diagnostic Rail" sidebar.
 * Reuses existing pure business logic so the rail mirrors the same
 * numbers the pages themselves show — no duplicated rules.
 */
export function useNavSignals(): Record<string, NavSignal> {
  const queryClient = useQueryClient();
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  // Cloud: satu RPC (0081) menggantikan tarikan UTUH services + inventory +
  // purchase_orders. Rel ini hidup di Sidebar DAN MobileBottomNav, jadi ongkos
  // itu dibayar di setiap halaman — termasuk Pengaturan, yang tak memakai
  // satu pun dari ketiganya. Adapter lokal tak punya metode ini: datanya sudah
  // di memori, jadi jalur di bawah menghitungnya seperti semula.
  const serverCounts = !!repository.navCounts;
  const { data: counts } = useQuery({
    queryKey: ['navCounts', activeOutletId],
    queryFn: () => repository.navCounts!(),
    enabled: serverCounts,
  });

  // Kuncinya TIDAK bisa diletakkan di bawah satu prefiks `['collection', X]`
  // seperti useDerivedQuery, karena angka ini berasal dari TIGA koleksi dan
  // invalidateCollection mencocokkan prefiks. Tanpa langganan eksplisit ini,
  // badge stok habis — yang justru ditandai kritis dan berkedip — baru berubah
  // setelah staleTime 5 menit.
  useEffect(() => {
    if (!serverCounts) return;
    return repository.subscribe((changed) => {
      if (changed === 'services' || changed === 'inventory' || changed === 'purchaseOrders') {
        // cancelRefetch:false — resync memberi tahu ketiga koleksi sekaligus dan
        // rel ini terpasang dua kali; tanpa ini satu resync = 6 panggilan RPC.
        void queryClient.invalidateQueries({ queryKey: ['navCounts'] }, { cancelRefetch: false });
      }
    });
  }, [serverCounts, queryClient]);

  const { data: services } = useCollection('services', { enabled: !serverCounts });
  const { data: inventory } = useCollection('inventory', { enabled: !serverCounts });
  const { data: purchaseOrders } = useCollection('purchaseOrders', { enabled: !serverCounts });
  // Only today's rows matter here. The rail mounts on every page (twice, with
  // MobileBottomNav), so pulling the whole attendance history — which grows
  // every day — was paid on every page and again on every clock-in.
  const today = localDateStr();
  // Tugas: hitungan PER TEMPLATE, bukan daftar instance (0083). Dulu rel ini
  // menarik task_instances utuh — 80 KB di setiap halaman, tumbuh 5 baris/hari
  // karena tugas harian yang tak dicentang menumpuk. Kunci di bawah
  // ['collection','taskInstances',…] supaya perubahan koleksi itu tetap
  // meng-invalidasi; `today` di kunci membuatnya dihitung ulang lewat tengah malam.
  const { data: taskGroups } = useDerivedQuery(
    ['collection', 'taskInstances', 'navCounts', activeOutletId, today],
    async () =>
      repository.taskCountsByTemplate
        ? repository.taskCountsByTemplate(today)
        : groupTaskCounts(await repository.list('taskInstances'), today),
    NO_TASK_GROUPS,
  );
  // Tugas disaring dengan aturan yang sama seperti halamannya. Tanpa ini
  // karyawan melihat badge berisi tugas orang lain yang tak pernah ia temukan.
  const { data: taskTemplates } = useCollection('taskTemplates');
  const me = useSessionStore((s) => s.currentEmployee);
  const allowedOutletIds = useSessionStore((s) => s.allowedOutletIds);
  const { data: attendance } = useCollectionRange('attendance', 'date', today, today);

  return useMemo(() => {

    // Tiga angka pertama datang dari server bila tersedia. Aturannya HARUS sama
    // persis dengan cabang lokal di bawah — nav_counts (0081) mencerminkannya.
    // Services: active units in the workshop; escalate if any await cost confirmation.
    const pending = counts ? counts.servicesActive : services.filter((s) => isActive(s.status)).length;
    const awaitingConfirm = counts
      ? counts.servicesAwaitingConfirm
      : services.some((s) => s.status === 'konfirmasi');

    // Inventory: out-of-stock is critical, low-stock is a warning.
    const out = counts ? counts.inventoryOut : inventory.filter((i) => i.stock <= 0).length;
    const low = counts
      ? counts.inventoryLow
      : inventory.filter((i) => i.stock > 0 && i.stock <= i.minStock).length;

    // Suppliers: open purchase orders still awaiting receipt.
    const openPo = counts
      ? counts.poOpen
      : purchaseOrders.filter((p) => p.status === 'ordered' || p.status === 'partial').length;

    // Tasks: overdue pending is critical; due-today pending is a warning.
    // Aturan visibilitas diterapkan per kelompok template dengan fungsi yang
    // sama seperti halaman Tugas — setara persis dengan menyaring per baris.
    const { overdue, dueToday } = visibleTaskCounts(
      taskGroups,
      new Map(taskTemplates.map((t) => [t.id, t])),
      { id: me?.id ?? '', role: me?.role ?? 'karyawan' },
      allowedOutletIds,
      me ? roleAllows(me.role, '*') || me.role === 'admin' : false,
    );

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
  }, [
    counts,
    services,
    inventory,
    purchaseOrders,
    taskGroups,
    taskTemplates,
    me,
    allowedOutletIds,
    attendance,
    today,
  ]);
}
