/**
 * Pure customer business logic: phone-based dedup + normalization.
 * No DOM/repository dependencies → unit-testable.
 */
import type { Customer } from '@/data/types';

/** Normalize an Indonesian phone number for comparison (digits only, leading 0/62 unified). */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('62')) digits = '0' + digits.slice(2);
  return digits;
}

/** Find an existing customer with the same normalized phone (excluding a given id). */
export function findByPhone(
  customers: Customer[],
  phone: string,
  excludeId?: string,
): Customer | null {
  const target = normalizePhone(phone);
  if (!target) return null;
  return (
    customers.find((c) => c.id !== excludeId && normalizePhone(c.phone) === target) ?? null
  );
}

export interface DedupCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate that saving a customer won't create a phone collision with a
 * *different* name. Same phone + same name is treated as the same person.
 */
export function checkDuplicate(
  customers: Customer[],
  candidate: { id?: string; name: string; phone: string },
): DedupCheck {
  const existing = findByPhone(customers, candidate.phone, candidate.id);
  if (!existing) return { ok: true };
  if (existing.name.trim().toLowerCase() === candidate.name.trim().toLowerCase()) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `No. HP sudah terdaftar atas nama "${existing.name}"`,
  };
}

/**
 * Live quick-suggest for the new-service form: match active customers by name
 * (case-insensitive substring) or by normalized phone. Returns up to `limit`
 * matches, name-sorted. Helps the user pick an EXISTING customer instead of
 * retyping — the main source of near-duplicate records.
 */
export function searchCustomers(
  customers: Customer[],
  query: string,
  limit = 5,
): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qPhone = normalizePhone(query);
  const matches = customers.filter((c) => {
    if (c.deletedAt) return false;
    const byName = c.name.toLowerCase().includes(q);
    const byPhone = qPhone.length >= 3 && normalizePhone(c.phone).includes(qPhone);
    return byName || byPhone;
  });
  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches.slice(0, limit);
}

export interface CsvImportResult {
  toAdd: { name: string; phone: string }[];
  toUpdate: { id: string; name: string }[];
  skipped: number;
}

/**
 * Plan a CSV import against existing customers:
 * - new phone → add
 * - existing phone + different name → update name
 * - existing phone + same name → skip
 */
export function planCsvImport(
  existing: Customer[],
  rows: { name: string; phone: string }[],
): CsvImportResult {
  const result: CsvImportResult = { toAdd: [], toUpdate: [], skipped: 0 };
  const seen = new Set<string>();
  for (const row of rows) {
    const norm = normalizePhone(row.phone);
    if (!norm || !row.name.trim()) {
      result.skipped++;
      continue;
    }
    if (seen.has(norm)) {
      result.skipped++;
      continue;
    }
    seen.add(norm);
    const match = findByPhone(existing, row.phone);
    if (!match) {
      result.toAdd.push({ name: row.name.trim(), phone: row.phone.trim() });
    } else if (match.name.trim().toLowerCase() !== row.name.trim().toLowerCase()) {
      result.toUpdate.push({ id: match.id, name: row.name.trim() });
    } else {
      result.skipped++;
    }
  }
  return result;
}
