import { id, type Dictionary } from './id';
import type { Language } from '@/stores/settings';

/**
 * Kamus yang sudah dimuat. Bahasa Indonesia selalu ada: bahasa produk dan
 * cadangan setiap kunci. Inggris dimuat saat dipilih, supaya ±38 KB gzip tidak
 * ikut di jalur kritis setiap pengunjung landing (bahasa runtime saat ini
 * dikunci ke `id`, lihat getInitialLang di stores/settings).
 */
const loaded: Partial<Record<Language, Dictionary>> = { id };

export function dictionary(lang: Language): Dictionary | undefined {
  return loaded[lang];
}

export function isLanguageLoaded(lang: Language): boolean {
  return loaded[lang] !== undefined;
}

export async function loadLanguage(lang: Language): Promise<void> {
  if (loaded[lang]) return;
  if (lang === 'en') loaded.en = (await import('./en')).en;
}
