/**
 * Pure global-search matcher. Searches across services, customers, and
 * inventory and returns ranked, grouped results with a navigation target.
 * No DOM/repository deps → unit-testable.
 */
import type { Service, Customer, InventoryItem } from '@/data/types';

export type SearchResultType = 'service' | 'customer' | 'inventory';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  /** Route to navigate to when the result is chosen. */
  to: string;
  /** Icon name (registry key) for the result row. */
  icon: string;
}

export interface SearchCollections {
  services: Service[];
  customers: Customer[];
  inventory: InventoryItem[];
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Match query against the given collections. Returns up to `limit` results,
 * ordered services → customers → inventory (most actionable first). An empty
 * or whitespace query returns [].
 */
export function searchAll(
  query: string,
  { services, customers, inventory }: SearchCollections,
  limit = 8,
): SearchResult[] {
  const q = norm(query);
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const s of services) {
    if (s.archived) continue;
    const hay = `${s.serviceNo} ${s.customerName} ${s.device} ${s.category}`.toLowerCase();
    if (hay.includes(q)) {
      results.push({
        id: s.id,
        type: 'service',
        title: `${s.serviceNo} · ${s.device}`,
        subtitle: s.customerName,
        to: `/services/${s.id}`,
        icon: 'screwdriver-wrench',
      });
    }
  }

  for (const c of customers) {
    const hay = `${c.name} ${c.phone} ${c.email}`.toLowerCase();
    if (hay.includes(q)) {
      results.push({
        id: c.id,
        type: 'customer',
        title: c.name,
        subtitle: c.phone || '—',
        to: '/customers',
        icon: 'user',
      });
    }
  }

  for (const item of inventory) {
    const hay = `${item.name} ${item.sku} ${item.category}`.toLowerCase();
    if (hay.includes(q)) {
      results.push({
        id: item.id,
        type: 'inventory',
        title: item.name,
        subtitle: item.sku || item.category,
        to: '/inventory',
        icon: 'box',
      });
    }
  }

  return results.slice(0, limit);
}

const TYPE_LABELS: Record<SearchResultType, string> = {
  service: 'Servis',
  customer: 'Pelanggan',
  inventory: 'Inventori',
};

/** Group results by type, preserving the input order within each group. */
export function groupResults(
  results: SearchResult[],
): { type: SearchResultType; label: string; items: SearchResult[] }[] {
  const order: SearchResultType[] = ['service', 'customer', 'inventory'];
  return order
    .map((type) => ({
      type,
      label: TYPE_LABELS[type],
      items: results.filter((r) => r.type === type),
    }))
    .filter((g) => g.items.length > 0);
}
