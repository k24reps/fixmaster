import { fetchServicePrintMeta, markServicePrintedRpc } from '@/data/supabase-client';
import { isCloudMode } from '@/stores/demo';
import type { Service, ServiceDocKind, ServicePrintMeta } from '@/data/types';

/**
 * Kode lacak dan jejak cetak tiket. Cloud: tabel `service_tracking`, hanya
 * lewat RPC (0100), di luar baris `services` supaya mencatat satu cetakan tidak
 * memancarkan realtime yang membuat semua perangkat menarik ulang daftar
 * servis. Lokal/demo: jejak cetak hanya di memori tab ini, seperti kunci layar
 * (data/serviceSecret), dan TANPA kode lacak: tak ada server yang bisa
 * menerjemahkan kode jadi tiket, jadi alamat lama `?org=&no=` (dibaca dari
 * IndexedDB) tetap dipakai dan tetap bisa dibuka di tab lain.
 */
const memory = new Map<string, ServicePrintMeta>();

function localMeta(serviceId: string): ServicePrintMeta {
  let meta = memory.get(serviceId);
  if (!meta) {
    meta = { trackCode: null, printCount: 0, lastPrintedAt: null, lastPrintedKind: null };
    memory.set(serviceId, meta);
  }
  return meta;
}

/** Kode lacak + jejak cetak; di cloud kode dibuat bila tiket belum punya. null = tak tersedia. */
export async function getServicePrintMeta(
  service: Pick<Service, 'id' | 'orgId'>,
): Promise<ServicePrintMeta | null> {
  if (isCloudMode()) return fetchServicePrintMeta({ orgId: service.orgId, serviceId: service.id });
  return localMeta(service.id);
}

/** Catat satu cetakan berjenis `kind`. Cap waktunya dari server di cloud. */
export async function recordServicePrint(
  service: Pick<Service, 'id' | 'orgId'>,
  kind: ServiceDocKind,
): Promise<ServicePrintMeta | null> {
  if (isCloudMode()) {
    return markServicePrintedRpc({ orgId: service.orgId, serviceId: service.id, kind });
  }
  const prev = localMeta(service.id);
  const next: ServicePrintMeta = {
    ...prev,
    printCount: prev.printCount + 1,
    lastPrintedAt: new Date().toISOString(),
    lastPrintedKind: kind,
  };
  memory.set(service.id, next);
  return next;
}
