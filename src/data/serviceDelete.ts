import { repository } from '@/data';
import { deleteServiceTicketRpc } from '@/data/supabase-client';
import { logActivity } from '@/lib/activity';
import { serviceDeleteBlocker } from '@/lib/business/services';
import { translate } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { isCloudMode } from '@/stores/demo';
import type { Service } from '@/data/types';

/**
 * Hapus tiket servis permanen (owner, tiket bersih — migrasi 0101).
 *
 * Cloud: RPC `delete_service_ticket` memeriksa ulang syaratnya (termasuk
 * pemasukan bertaut yang tak terlihat dari baris tiket), mengembalikan unit
 * bila dihapus dalam 10 menit, mencatat Log Aktivitas, dan mematikan kode
 * lacak — semuanya dalam satu transaksi. Lokal/demo: tidak ada saldo, jadi
 * cukup cek syarat yang sama, hapus, lalu catat log di sisi klien.
 */
export async function deleteServiceTicket(
  service: Service,
  hasWarrantyClaims: boolean,
): Promise<{ refunded: boolean }> {
  if (isCloudMode()) {
    return deleteServiceTicketRpc({ orgId: service.orgId, serviceId: service.id });
  }
  const blocker = serviceDeleteBlocker(service, hasWarrantyClaims);
  if (blocker) throw new Error(translate(useSettingsStore.getState().language, blocker));
  await repository.remove('services', service.id);
  logActivity({
    action: 'service.delete',
    entityType: 'service',
    entityId: service.id,
    entityLabel: service.serviceNo,
    outletId: service.outletId ?? null,
    meta: {
      device: [service.category, service.device].filter(Boolean).join(' '),
      customer: service.customerName,
      status: service.status,
    },
  });
  return { refunded: false };
}
