import { translate, type TranslationKey } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';

/**
 * Teks tetap di atas kertas nota & struk. Jendela cetak dibangun di luar React
 * (string HTML ke `window.open`), jadi `useT()` tidak bisa dipakai; bahasanya
 * mengikuti bahasa aplikasi yang sedang aktif saat tombol cetak ditekan.
 */
export function receiptText(key: TranslationKey): string {
  return translate(useSettingsStore.getState().language, key);
}
