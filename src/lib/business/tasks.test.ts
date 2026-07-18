import { describe, it, expect } from 'vitest';
import {
  isDueOn,
  instanceKey,
  generateInstances,
  describeRecurrence,
  isOverdue,
  reorder,
  bySortOrder,
} from './tasks';
import type { TaskTemplate, TaskInstance } from '@/data/types';

const tpl = (over: Partial<TaskTemplate>): TaskTemplate => ({
  id: over.id ?? 't1',
  orgId: 'o1',
  outletId: null,
  name: over.name ?? 'SOP Harian',
  items: over.items ?? [
    { id: `${over.id ?? 't1'}-i1`, title: over.title ?? 'Bersih-bersih', description: '', sortOrder: 0 },
  ],
  title: over.title ?? 'Bersih-bersih',
  description: '',
  recurrence: over.recurrence ?? 'daily',
  weekdays: over.weekdays ?? [],
  monthDays: over.monthDays ?? [],
  onceDate: over.onceDate ?? null,
  assigneeType: 'role',
  assigneeRole: 'karyawan',
  assigneeEmployeeId: null,
  assigneeOutletId: null,
  active: over.active ?? true,
  startDate: over.startDate ?? '2026-06-01',
  endDate: over.endDate ?? null,
  sortOrder: over.sortOrder ?? 0,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

describe('isDueOn', () => {
  it('daily is always due within bounds', () => {
    expect(isDueOn(tpl({ recurrence: 'daily' }), '2026-06-15')).toBe(true);
  });
  it('respects start date', () => {
    expect(isDueOn(tpl({ recurrence: 'daily', startDate: '2026-06-10' }), '2026-06-05')).toBe(false);
  });
  it('respects end date', () => {
    expect(
      isDueOn(tpl({ recurrence: 'daily', startDate: '2026-06-01', endDate: '2026-06-10' }), '2026-06-15'),
    ).toBe(false);
  });
  it('inactive templates are never due', () => {
    expect(isDueOn(tpl({ active: false }), '2026-06-15')).toBe(false);
  });

  it('weekly matches selected weekdays', () => {
    // 2026-06-01 is a Monday (getDay 1).
    const weekly = tpl({ recurrence: 'weekly', weekdays: [1] }); // Mondays
    expect(isDueOn(weekly, '2026-06-01')).toBe(true); // Monday
    expect(isDueOn(weekly, '2026-06-02')).toBe(false); // Tuesday
    expect(isDueOn(weekly, '2026-06-08')).toBe(true); // next Monday
  });

  it('monthly matches selected month days', () => {
    const monthly = tpl({ recurrence: 'monthly', monthDays: [1, 15] });
    expect(isDueOn(monthly, '2026-06-01')).toBe(true);
    expect(isDueOn(monthly, '2026-06-15')).toBe(true);
    expect(isDueOn(monthly, '2026-06-16')).toBe(false);
  });

  it('once matches only the exact date', () => {
    const once = tpl({ recurrence: 'once', onceDate: '2026-06-20' });
    expect(isDueOn(once, '2026-06-20')).toBe(true);
    expect(isDueOn(once, '2026-06-21')).toBe(false);
  });
});

describe('generateInstances', () => {
  it('creates one instance per due day in range', () => {
    const daily = tpl({ recurrence: 'daily' });
    const created = generateInstances([daily], [], '2026-06-01', '2026-06-03', 'o1');
    expect(created).toHaveLength(3);
    expect(created.map((i) => i.dueDate)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  it('skips dates that already have an instance', () => {
    const daily = tpl({ recurrence: 'daily' });
    const existing: TaskInstance[] = [
      {
        id: 'x', orgId: 'o1', outletId: null, templateId: 't1', itemId: 't1-i1', title: 'Bersih-bersih',
        description: '', dueDate: '2026-06-02', status: 'pending', completedAt: null,
        completedById: null, completedByName: '', note: '', sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null,
      },
    ];
    const created = generateInstances([daily], existing, '2026-06-01', '2026-06-03', 'o1');
    expect(created.map((i) => i.dueDate)).toEqual(['2026-06-01', '2026-06-03']);
  });

  it('generates weekly instances only on matching days', () => {
    const weekly = tpl({ recurrence: 'weekly', weekdays: [1] }); // Mondays
    const created = generateInstances([weekly], [], '2026-06-01', '2026-06-14', 'o1');
    expect(created.map((i) => i.dueDate)).toEqual(['2026-06-01', '2026-06-08']);
  });

  it('returns nothing for an inverted range', () => {
    expect(generateInstances([tpl({})], [], '2026-06-10', '2026-06-01', 'o1')).toHaveLength(0);
  });
});

describe('instanceKey', () => {
  it('combines template id and due date', () => {
    expect(instanceKey('t1', 'i1', '2026-06-01')).toBe('t1::i1::2026-06-01');
  });
  it('maps an ad-hoc (null) template to a stable adhoc key', () => {
    expect(instanceKey(null, null, '2026-06-01')).toBe('adhoc::-::2026-06-01');
  });
  it('an ad-hoc instance does not block template generation on the same date', () => {
    const daily = tpl({ recurrence: 'daily' });
    const adhoc: TaskInstance = {
      id: 'a', orgId: 'o1', outletId: null, templateId: null, itemId: null, title: 'Telepon supplier',
      description: '', dueDate: '2026-06-02', status: 'pending', completedAt: null,
      completedById: null, completedByName: '', note: '', sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null,
    };
    const created = generateInstances([daily], [adhoc], '2026-06-01', '2026-06-03', 'o1');
    // The ad-hoc task keys to 'adhoc::2026-06-02', so the template instance
    // 't1::2026-06-02' is still generated.
    expect(created.map((i) => i.dueDate)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });
});

describe('describeRecurrence', () => {
  it('describes each pattern in Indonesian', () => {
    expect(describeRecurrence(tpl({ recurrence: 'daily' }))).toBe('Setiap hari');
    expect(describeRecurrence(tpl({ recurrence: 'weekly', weekdays: [1, 5] }))).toContain('Senin');
    expect(describeRecurrence(tpl({ recurrence: 'monthly', monthDays: [1] }))).toContain('tanggal 1');
    expect(describeRecurrence(tpl({ recurrence: 'once', onceDate: '2026-06-20' }))).toContain('2026-06-20');
  });
});

describe('isOverdue', () => {
  const inst = (status: 'pending' | 'done', dueDate: string): TaskInstance => ({
    id: 'i', orgId: 'o1', outletId: null, templateId: 't1', itemId: 't1-i1', title: '', description: '',
    dueDate, status, completedAt: null, completedById: null, completedByName: '', note: '',
    sortOrder: 0,
    createdAt: '', updatedAt: '', deletedAt: null,
  });
  it('flags pending past-due instances', () => {
    expect(isOverdue(inst('pending', '2026-06-01'), '2026-06-05')).toBe(true);
  });
  it('does not flag completed instances', () => {
    expect(isOverdue(inst('done', '2026-06-01'), '2026-06-05')).toBe(false);
  });
  it('does not flag today or future', () => {
    expect(isOverdue(inst('pending', '2026-06-05'), '2026-06-05')).toBe(false);
  });
});

// ---- Manual ordering (sortOrder) ----
const row = (id: string, sortOrder: number, createdAt = '') => ({ id, sortOrder, createdAt });

describe('reorder', () => {
  it('swaps sortOrder with the neighbour above and returns only changed rows', () => {
    const items = [row('a', 0), row('b', 1), row('c', 2)];
    const changed = reorder(items, 1, -1);
    expect(changed).toHaveLength(2);
    expect(changed.find((r) => r.id === 'b')!.sortOrder).toBe(0);
    expect(changed.find((r) => r.id === 'a')!.sortOrder).toBe(1);
  });

  it('swaps with the neighbour below', () => {
    const items = [row('a', 0), row('b', 1)];
    const changed = reorder(items, 0, 1);
    expect(changed.find((r) => r.id === 'a')!.sortOrder).toBe(1);
    expect(changed.find((r) => r.id === 'b')!.sortOrder).toBe(0);
  });

  it('is a no-op past either edge', () => {
    const items = [row('a', 0), row('b', 1)];
    expect(reorder(items, 0, -1)).toEqual([]);
    expect(reorder(items, 1, 1)).toEqual([]);
    expect(reorder(items, 5, 1)).toEqual([]);
  });

  it('still reorders when every sortOrder ties (un-backfilled column)', () => {
    const items = [row('a', 0), row('b', 0), row('c', 0)];
    const changed = reorder(items, 2, -1);
    // Falls back to positions so the move is not silently swallowed.
    expect(changed.find((r) => r.id === 'c')!.sortOrder).toBe(1);
    expect(changed.find((r) => r.id === 'b')!.sortOrder).toBe(2);
  });

  it('does not mutate the input', () => {
    const items = [row('a', 0), row('b', 1)];
    reorder(items, 0, 1);
    expect(items[0].sortOrder).toBe(0);
    expect(items[1].sortOrder).toBe(1);
  });
});

describe('bySortOrder', () => {
  it('sorts ascending by sortOrder', () => {
    const items = [row('c', 2), row('a', 0), row('b', 1)];
    expect([...items].sort(bySortOrder).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('breaks ties by createdAt so equal orders never jitter', () => {
    const items = [row('y', 0, '2026-06-02'), row('x', 0, '2026-06-01')];
    expect([...items].sort(bySortOrder).map((r) => r.id)).toEqual(['x', 'y']);
  });
});

describe('generateInstances — items (0041)', () => {
  it('creates ONE instance per item, seeded from the item order', () => {
    const multi = tpl({
      id: 't1',
      items: [
        { id: 'a', title: 'Sapu lantai', description: '', sortOrder: 0 },
        { id: 'b', title: 'Cek stok', description: '', sortOrder: 1 },
      ],
    });
    const out = generateInstances([multi], [], '2026-06-15', '2026-06-15', 'o1');
    expect(out).toHaveLength(2);
    expect(out.map((i) => i.itemId)).toEqual(['a', 'b']);
    expect(out.map((i) => i.title)).toEqual(['Sapu lantai', 'Cek stok']);
    expect(out.map((i) => i.sortOrder)).toEqual([0, 1]);
  });

  it('skips only the item+date pairs that already exist', () => {
    const multi = tpl({
      id: 't1',
      items: [
        { id: 'a', title: 'Sapu lantai', description: '', sortOrder: 0 },
        { id: 'b', title: 'Cek stok', description: '', sortOrder: 1 },
      ],
    });
    const existing: TaskInstance[] = [
      {
        id: 'x', orgId: 'o1', outletId: null, templateId: 't1', itemId: 'a', title: 'Sapu lantai',
        description: '', dueDate: '2026-06-15', status: 'pending', completedAt: null,
        completedById: null, completedByName: '', note: '', sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null,
      },
    ];
    const out = generateInstances([multi], existing, '2026-06-15', '2026-06-15', 'o1');
    // Item "a" already exists → only "b" is created. Pre-0041 the whole
    // template would have been skipped, losing item b entirely.
    expect(out).toHaveLength(1);
    expect(out[0].itemId).toBe('b');
  });

  it('orders items by sortOrder regardless of array order', () => {
    const multi = tpl({
      id: 't1',
      items: [
        { id: 'b', title: 'Kedua', description: '', sortOrder: 1 },
        { id: 'a', title: 'Pertama', description: '', sortOrder: 0 },
      ],
    });
    const out = generateInstances([multi], [], '2026-06-15', '2026-06-15', 'o1');
    expect(out.map((i) => i.title)).toEqual(['Pertama', 'Kedua']);
  });
});
