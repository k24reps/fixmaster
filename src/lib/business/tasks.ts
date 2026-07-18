/**
 * Pure recurrence engine for Internal Tasks (Tugas Internal).
 * Given a task template and a date, decides whether an instance is due,
 * and generates instances across a date range. No DOM/repository deps →
 * fully unit-testable. This is the core differentiator vs FixNova, which
 * has no internal task management at all.
 */
import type { TaskTemplate, TaskInstance, TaskTemplateItem } from '@/data/types';
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

/**
 * Stable key for "does this instance already exist?". Mirrors the DB uniqueness
 * key since 0041: (template_id, item_id, due_date) — a template holds MANY
 * items, so the template alone no longer identifies a day's task.
 */
export function instanceKey(
  templateId: string | null,
  itemId: string | null,
  dueDate: string,
): string {
  return `${templateId ?? 'adhoc'}::${itemId ?? '-'}::${dueDate}`;
}

/** Items of a template in their manual order. Safe on legacy/empty rows. */
export function templateItems(template: TaskTemplate): TaskTemplateItem[] {
  return [...(template.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
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
  const seen = new Set(existing.map((i) => instanceKey(i.templateId, i.itemId, i.dueDate)));
  const fromDate = parseISODate(from);
  const toDate = parseISODate(to);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return [];

  const result: TaskInstance[] = [];
  const cursor = new Date(fromDate);
  while (cursor.getTime() <= toDate.getTime()) {
    const iso = localDateStr(cursor);
    for (const tpl of templates) {
      if (!isDueOn(tpl, iso)) continue;
      // A template holds MANY items → one instance per item, per date (0041).
      for (const item of templateItems(tpl)) {
        const key = instanceKey(tpl.id, item.id, iso);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          id: newId(),
          orgId,
          outletId: tpl.assigneeOutletId,
          templateId: tpl.id,
          itemId: item.id,
          title: item.title,
          description: item.description,
          dueDate: iso,
          status: 'pending',
          completedAt: null,
          completedById: null,
          completedByName: '',
          note: '',
          // Item order is read from the template at render time, so this is
          // only a sensible seed (and the sole ordering key for ad-hoc tasks).
          sortOrder: item.sortOrder,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/**
 * Move the item at `index` one slot up (dir -1) or down (dir +1) by swapping
 * its sortOrder with its neighbour's. `items` MUST already be sorted ascending
 * by sortOrder (i.e. as rendered).
 *
 * Returns ONLY the (max 2) records whose sortOrder changed, so callers persist
 * a minimal write. Out-of-range moves return [] — a no-op, not an error.
 *
 * Ties are handled by falling back to positional order: sortOrder is rewritten
 * from the swapped positions, so a list where every row is 0 (fresh column,
 * un-backfilled) still reorders correctly instead of silently doing nothing.
 */
export function reorder<T extends { sortOrder: number }>(
  items: T[],
  index: number,
  dir: -1 | 1,
): T[] {
  const target = index + dir;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [];
  const a = items[index];
  const b = items[target];
  // Ties (e.g. all zeros) would make a naive swap a no-op — use positions.
  const aOrder = a.sortOrder === b.sortOrder ? target : b.sortOrder;
  const bOrder = a.sortOrder === b.sortOrder ? index : a.sortOrder;
  return [
    { ...a, sortOrder: aOrder },
    { ...b, sortOrder: bOrder },
  ];
}

/** Sort by manual order, with a stable tiebreak so ties never jitter. */
export function bySortOrder<T extends { sortOrder: number; createdAt: string }>(a: T, b: T): number {
  return a.sortOrder - b.sortOrder || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
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
