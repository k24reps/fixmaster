/**
 * Pure customer business logic: phone-based dedup + normalization.
 * No DOM/repository dependencies → unit-testable.
 */
import type { Customer, Service } from '@/data/types';

/** Normalize an Indonesian phone number for comparison (digits only, leading 0/62 unified). */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('62')) digits = '0' + digits.slice(2);
  return digits;
}

/**
 * Find an existing record with the same normalized phone (excluding a given id).
 * Generic over the row: pelanggan dan supplier memakai aturan nomor yang sama,
 * dan yang satu tidak boleh punya salinan normalisasi sendiri.
 */
export function findByPhone<T extends { id: string; phone: string }>(
  rows: readonly T[],
  phone: string,
  excludeId?: string,
): T | null {
  const target = normalizePhone(phone);
  if (!target) return null;
  return rows.find((c) => c.id !== excludeId && normalizePhone(c.phone) === target) ?? null;
}

export interface DedupCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate that saving a customer won't reuse a phone already held by ANOTHER
 * record. Dulu nomor + nama yang sama dianggap "orang yang sama" lalu tetap
 * dibuatkan data baru — hasilnya pelanggan ganda. Database juga menolaknya (0069).
 */
export function checkDuplicate(
  customers: Customer[],
  candidate: { id?: string; name: string; phone: string },
): DedupCheck {
  const existing = findByPhone(customers, candidate.phone, candidate.id);
  if (!existing) return { ok: true };
  const sameName = existing.name.trim().toLowerCase() === candidate.name.trim().toLowerCase();
  return {
    ok: false,
    reason: sameName
      ? `Pelanggan "${existing.name}" dengan No. HP ini sudah terdaftar`
      : `No. HP sudah terdaftar atas nama "${existing.name}"`,
  };
}

export interface CustomerStat {
  /** Tiket servis, tanpa yang dibatalkan. */
  count: number;
  /** Jumlah biaya final tiket Lunas. */
  paidTotal: number;
  /** Kategori perangkat yang pernah dibawa. */
  categories: string[];
}

export const EMPTY_CUSTOMER_STAT: CustomerStat = { count: 0, paidTotal: 0, categories: [] };

/** Statistik per pelanggan dari daftar tiket. Cermin customer_service_stats (0069). */
export function customerServiceStats(
  services: Pick<Service, 'customerId' | 'status' | 'finalCost' | 'category'>[],
): Map<string, CustomerStat> {
  const map = new Map<string, CustomerStat>();
  for (const s of services) {
    if (!s.customerId) continue;
    const cur = map.get(s.customerId) ?? { count: 0, paidTotal: 0, categories: [] };
    if (s.status !== 'batal') cur.count += 1;
    if (s.status === 'lunas') cur.paidTotal += s.finalCost;
    const cat = (s.category || '').trim();
    if (cat && !cur.categories.includes(cat)) cur.categories.push(cat);
    map.set(s.customerId, cur);
  }
  return map;
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
  if (!query.trim()) return [];
  const matches = customers.filter((c) => !c.deletedAt && matchesCustomer(c, query));
  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches.slice(0, limit);
}

/**
 * Cocok untuk pencarian pelanggan: nama (tanpa beda huruf besar) atau No. HP
 * yang dinormalkan — "0812-3456", "+62 812 3456", dan "08123456" sama saja.
 * Kueri kosong cocok dengan semua.
 */
export function matchesCustomer(c: Pick<Customer, 'name' | 'phone'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (c.name.toLowerCase().includes(q)) return true;
  const qPhone = normalizePhone(query);
  return qPhone.length >= 3 && normalizePhone(c.phone).includes(qPhone);
}
