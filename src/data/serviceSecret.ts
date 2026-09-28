import { repository } from '@/data';
import { getServiceSecretRpc, setServiceSecretRpc } from '@/data/supabase-client';
import { isCloudMode } from '@/stores/demo';
import type { ScreenLockKind, Service } from '@/data/types';

/**
 * Kunci layar unit (PIN/pola/sandi) — data paling sensitif di tiket, jadi TIDAK
 * disimpan di tiket. Cloud: tabel `service_secrets` yang hanya terjangkau lewat
 * RPC (0094); server menghapusnya begitu unit diambil. Lokal/demo: hanya di
 * memori tab ini (tak pernah ke IndexedDB/localStorage), dan dianggap terhapus
 * begitu tiketnya diambil — cermin trigger server.
 */
const memory = new Map<string, { kind: ScreenLockKind; secret: string }>();

/** Simpan / ganti kunci layar; `secret` kosong = hapus. */
export async function saveScreenLock(
  service: Pick<Service, 'id' | 'orgId'>,
  kind: ScreenLockKind,
  secret: string,
): Promise<void> {
  const value = secret.trim();
  if (isCloudMode()) {
    await setServiceSecretRpc({ orgId: service.orgId, serviceId: service.id, kind, secret: value });
    return;
  }
  if (value) memory.set(service.id, { kind, secret: value });
  else memory.delete(service.id);
  await repository.patch('services', service.id, { secretKind: value ? kind : null });
}

/** Isi kunci layar, atau null bila tak ada / sudah dihapus. */
export async function readScreenLock(
  service: Pick<Service, 'id' | 'orgId' | 'pickedUp'>,
): Promise<{ kind: ScreenLockKind; secret: string } | null> {
  if (isCloudMode()) return getServiceSecretRpc({ orgId: service.orgId, serviceId: service.id });
  if (service.pickedUp) {
    memory.delete(service.id);
    return null;
  }
  return memory.get(service.id) ?? null;
}
