import { SHOP_NAME_MAX, SHOP_NAME_MIN, cleanShopName } from '@/lib/business/demoLead';

/**
 * Pengunjung yang sudah melewati gerbang demo di perangkat ini. Yang disimpan
 * hanya nama toko, untuk kop demo dan untuk melewati gerbang lain kali; nomor
 * WhatsApp tidak pernah ditaruh di browser.
 *
 * Penyimpanan bisa hilang atau ditolak (jendela privat, data situs dihapus),
 * jadi setiap akses dibungkus try/catch dan kegagalannya berarti "pengunjung
 * baru": gerbangnya muncul lagi, tidak ada yang rusak.
 */
const KEY = 'fixmaster-demo-visitor';

export interface DemoVisitor {
  shopName: string;
}

export function readDemoVisitor(): DemoVisitor | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoVisitor> | null;
    const shopName = cleanShopName(String(parsed?.shopName ?? ''));
    if (shopName.length < SHOP_NAME_MIN || shopName.length > SHOP_NAME_MAX) return null;
    return { shopName };
  } catch {
    return null;
  }
}

export function saveDemoVisitor(shopName: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ shopName: cleanShopName(shopName) }));
  } catch {
    /* tanpa penyimpanan, gerbang muncul lagi di kunjungan berikutnya */
  }
}

export function clearDemoVisitor(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* sama: tidak ada yang perlu dibersihkan */
  }
}
