import { describe, it, expect } from 'vitest';
import {
  isDueOn,
  instanceKey,
  generateInstances,
  describeRecurrence,
  isOverdue,
} from './tasks';
import type { TaskTemplate, TaskInstance } from '@/data/types';

const tpl = (over: Partial<TaskTemplate>): TaskTemplate => ({
  id: over.id ?? 't1',
  orgId: 'o1',
  outletId: null,
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
        id: 'x', orgId: 'o1', outletId: null, templateId: 't1', title: 'Bersih-bersih',
        description: '', dueDate: '2026-06-02', status: 'pending', completedAt: null,
        completedById: null, completedByName: '', note: '', createdAt: '', updatedAt: '', deletedAt: null,
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
    expect(instanceKey('t1', '2026-06-01')).toBe('t1::2026-06-01');
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
    id: 'i', orgId: 'o1', outletId: null, templateId: 't1', title: '', description: '',
    dueDate, status, completedAt: null, completedById: null, completedByName: '', note: '',
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
