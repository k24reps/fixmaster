import { repository } from '@/data';
import { updateServiceParts } from '@/data/supabase-client';
import { partsStockDelta } from '@/lib/business/services';
import { isCloudMode } from '@/stores/demo';
import type { InventoryItem, Service, ServiceSparepart } from '@/data/types';

/**
 * Simpan daftar sparepart tiket beserta perubahan stoknya. Cloud: satu RPC
 * atomik (update_service_parts, 0064) — stok dihitung & dikunci server, aman
 * terhadap penjualan kasir yang bersamaan. Lokal/demo: semua stok dicek dulu,
 * baru ditulis.
 */
export async function saveServiceParts(service: Service, next: ServiceSparepart[]): Promise<void> {
  if (isCloudMode()) {
    await updateServiceParts({ orgId: service.orgId, serviceId: service.id, spareparts: next });
    return;
  }
  const fresh = (await repository.get('services', service.id)) ?? service;
  const items: InventoryItem[] = [];
  for (const { itemId, delta } of partsStockDelta(fresh.spareparts, next)) {
    if (fresh.status === 'lunas' && delta > 0) {
      throw new Error('Tiket sudah Lunas: sparepart yang terpasang tidak bisa dikembalikan ke stok');
    }
    const item = await repository.get('inventory', itemId);
    // Barang sudah dihapus: stok yang dikembalikan dilewati (cermin 0069).
    if (!item && delta > 0) continue;
    if (!item) throw new Error('Item inventory tidak ditemukan');
    if (item.stock + delta < 0) throw new Error(`Stok ${item.name} hanya ${item.stock}, tidak cukup`);
    items.push({ ...item, stock: item.stock + delta });
  }
  if (items.length) await repository.putMany('inventory', items);
  await repository.put('services', { ...fresh, spareparts: next, updatedAt: new Date().toISOString() });
}
