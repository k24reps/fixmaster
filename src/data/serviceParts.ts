import { repository } from '@/data';
import { addServiceModal, updateServiceParts } from '@/data/supabase-client';
import { applyBalance } from '@/lib/business/finance';
import {
  modalDadakanLine,
  modalExpenseDescription,
  partsStockDelta,
  withPartAdded,
  type ModalDadakanInput,
} from '@/lib/business/services';
import { logActivity } from '@/lib/activity';
import { newId } from '@/lib/id';
import { localDateStr } from '@/lib/time';
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

/**
 * Tambah satu sparepart ke tiket, dipakai detail tiket dan aksi cepat Daftar
 * Servis. Tiket dibaca ulang dulu: salinan di layar bisa basi di antara dua
 * klik cepat, dan menulis dari salinan itu menimpa baris yang efek stoknya
 * sudah tercatat.
 */
export async function addServicePart(service: Service, line: ServiceSparepart): Promise<void> {
  const fresh = (await repository.get('services', service.id)) ?? service;
  await saveServiceParts(fresh, withPartAdded(fresh.spareparts, line));
}

/**
 * Catat modal dadakan (part yang dibeli di luar stok): pengeluaran kategori
 * Sparepart, saldo wallet berkurang, dan baris biaya manual di tiket. Dipakai
 * detail tiket dan aksi cepat Daftar Servis, supaya kas tercatat sama dari
 * keduanya. Cloud: satu transaksi server (0087).
 */
export async function addServiceModalLine(
  service: Service,
  input: ModalDadakanInput,
): Promise<string> {
  const name = input.name.trim();
  let expenseId: string;
  if (isCloudMode()) {
    expenseId = await addServiceModal({
      orgId: service.orgId,
      serviceId: service.id,
      name,
      amount: input.amount,
      walletId: input.walletId,
    });
  } else {
    const now = new Date().toISOString();
    expenseId = newId();
    await repository.put('expenses', {
      id: expenseId,
      orgId: service.orgId,
      outletId: service.outletId,
      date: localDateStr(),
      category: 'Sparepart',
      amount: input.amount,
      walletId: input.walletId,
      description: modalExpenseDescription(service.serviceNo, name),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    // Saldo dari baris segar, bukan dari daftar di layar yang bisa basi.
    const wallet = await repository.get('wallets', input.walletId);
    if (wallet) await repository.put('wallets', applyBalance(wallet, -input.amount));
    await addServicePart(service, modalDadakanLine({ ...input, name }, expenseId));
  }
  logActivity({
    action: 'expense.create',
    entityType: 'expense',
    entityId: expenseId,
    entityLabel: `Modal ${service.serviceNo}`,
    meta: { amount: input.amount, serviceId: service.id },
    outletId: service.outletId,
  });
  return expenseId;
}
