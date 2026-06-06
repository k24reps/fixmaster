/**
 * Pure recurrence engine for Internal Tasks (Tugas Internal).
 * Given a task template and a date, decides whether an instance is due,
 * and generates instances across a date range. No DOM/repository deps →
 * fully unit-testable. This is the core differentiator vs FixNova, which
 * has no internal task management at all.
 */
import type { TaskTemplate, TaskInstance } from '@/data/types';
import { parseISODate, localDateStr } from '@/lib/time';
import { newId } from '@/lib/id';

/**
 * Whether a template produces a task due on the given ISO date.
 * Respects startDate / endDate bounds and the recurrence pattern.
 */
export function isDueOn(template: TaskTemplate, isoDate: string): boolean {
  if (!template.active) return false;
  const date = parseISODate(isoDate);
  const start = parseISODate(template.startDate);
  if (!date || !start) return false;
  if (date.getTime() < start.getTime()) return false;
  if (template.endDate) {
    const end = parseISODate(template.endDate);
    if (end && date.getTime() > end.getTime()) return false;
  }

  switch (template.recurrence) {
    case 'once':
      return template.onceDate === isoDate;
    case 'daily':
      return true;
    case 'weekly':
      return template.weekdays.includes(date.getDay());
    case 'monthly':
      return template.monthDays.includes(date.getDate());
    default:
      return false;
  }
}

/** Stable key to detect whether an instance already exists for a template+date. */
export function instanceKey(templateId: string, dueDate: string): string {
  return `${templateId}::${dueDate}`;
}

/**
 * Generate missing task instances for all templates across [from, to],
 * skipping any (template, date) pair that already has an instance.
 * Returns only the NEW instances to persist.
 */
export function generateInstances(
  templates: TaskTemplate[],
  existing: TaskInstance[],
  from: string,
  to: string,
  orgId: string,
  now: string = new Date().toISOString(),
): TaskInstance[] {
  const seen = new Set(existing.map((i) => instanceKey(i.templateId, i.dueDate)));
  const fromDate = parseISODate(from);
  const toDate = parseISODate(to);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return [];

  const result: TaskInstance[] = [];
  const cursor = new Date(fromDate);
  while (cursor.getTime() <= toDate.getTime()) {
    const iso = localDateStr(cursor);
    for (const tpl of templates) {
      if (!isDueOn(tpl, iso)) continue;
      const key = instanceKey(tpl.id, iso);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: newId(),
        orgId,
        outletId: tpl.assigneeOutletId,
        templateId: tpl.id,
        title: tpl.title,
        description: tpl.description,
        dueDate: iso,
        status: 'pending',
        completedAt: null,
        completedById: null,
        completedByName: '',
        note: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/** Human-readable description of a template's schedule (Indonesian). */
export function describeRecurrence(template: TaskTemplate): string {
  const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  switch (template.recurrence) {
    case 'once':
      return template.onceDate ? `Sekali pada ${template.onceDate}` : 'Sekali';
    case 'daily':
      return 'Setiap hari';
    case 'weekly':
      return template.weekdays.length
        ? `Setiap ${template.weekdays.map((d) => DAYS[d]).join(', ')}`
        : 'Mingguan';
    case 'monthly':
      return template.monthDays.length
        ? `Tiap tanggal ${template.monthDays.join(', ')}`
        : 'Bulanan';
    default:
      return '';
  }
}

/** Whether a pending instance is overdue relative to today. */
export function isOverdue(instance: TaskInstance, today: string): boolean {
  return instance.status === 'pending' && instance.dueDate < today;
}
