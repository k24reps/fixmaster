/**
 * Kolom opsional tabel Servis, dalam urutan tampil. No. Servis, Status, dan Aksi
 * selalu ada: tanpa ketiganya sebuah baris tak bisa dikenali atau ditindaklanjuti.
 */
export const SERVICE_COLUMNS = [
  { id: 'customer', label: 'Pelanggan', hint: 'Nama dan nomor HP' },
  { id: 'device', label: 'Perangkat', hint: 'Perangkat, kategori, dan status ambil' },
  { id: 'complaint', label: 'Keluhan', hint: 'Keluhan saat unit diterima' },
  // Id lama dipertahankan supaya pengaturan kolom yang sudah tersimpan tetap berlaku.
  { id: 'completionNote', label: 'Penanganan', hint: 'Tindakan perbaikan, wajib saat status Selesai' },
  { id: 'technician', label: 'Teknisi', hint: 'Teknisi yang menangani' },
  { id: 'cost', label: 'Biaya', hint: 'Biaya final, plus modal dan profit untuk pemilik' },
] as const;

export type ServiceColumnId = (typeof SERVICE_COLUMNS)[number]['id'];

const ALL_IDS: ServiceColumnId[] = SERVICE_COLUMNS.map((c) => c.id);

/**
 * Nilai tersimpan (bisa kosong, usang, atau rusak) → daftar kolom yang valid
 * dalam urutan tetap. Belum pernah diatur = semua kolom tampil.
 */
export function resolveServiceColumns(saved: unknown): ServiceColumnId[] {
  if (!Array.isArray(saved)) return ALL_IDS;
  return ALL_IDS.filter((id) => saved.includes(id));
}
