import type { TranslationKey } from '@/i18n';

/**
 * Kolom opsional tabel Servis, dalam urutan tampil. No. Servis, Status, dan Aksi
 * selalu ada: tanpa ketiganya sebuah baris tak bisa dikenali atau ditindaklanjuti.
 *
 * Teks tak ditulis di sini (lib/business tak punya hook): tiap kolom membawa KUNCI
 * i18n, UI menerjemahkannya lewat useT(). Label memakai kunci yang sama dengan judul
 * kolom di Daftar (`services.col*`), jadi pengaturan dan daftar tak bisa menyebut
 * kolom yang sama dengan dua kata berbeda.
 */
export const SERVICE_COLUMNS = [
  { id: 'customer', labelKey: 'services.colCustomer', hintKey: 'services.colHintCustomer' },
  { id: 'device', labelKey: 'services.colDevice', hintKey: 'services.colHintDevice' },
  { id: 'complaint', labelKey: 'services.colComplaint', hintKey: 'services.colHintComplaint' },
  // Id lama dipertahankan supaya pengaturan kolom yang sudah tersimpan tetap berlaku.
  { id: 'completionNote', labelKey: 'services.colFix', hintKey: 'services.colHintFix' },
  { id: 'technician', labelKey: 'services.colTech', hintKey: 'services.colHintTech' },
  { id: 'cost', labelKey: 'services.colCost', hintKey: 'services.colHintCost' },
] as const satisfies readonly { id: string; labelKey: TranslationKey; hintKey: TranslationKey }[];

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
