/**
 * Type-safe i18n engine (zero external deps).
 *   const t = useT();
 *   t('nav.dashboard')           // → "Dashboard"
 *   t('common.loading')          // autocompletes; typo'd keys = TS error
 *
 * Language comes from the settings store, so switching is reactive across
 * the whole app. Migratable to react-i18next later if many languages appear.
 */
import { useCallback } from 'react';
import { id, type TranslationKey } from './id';
import { dictionary } from './registry';
import { useSettingsStore, type Language } from '@/stores/settings';

/**
 * Translate a key for an explicit language (non-hook contexts). A language
 * whose dictionary has not arrived yet falls back to Indonesian; setLanguage
 * waits for the dictionary before switching, so the UI never mixes the two.
 */
export function translate(lang: Language, key: TranslationKey): string {
  return dictionary(lang)?.[key] ?? id[key] ?? key;
}

/**
 * Hook returning a reactive translator bound to the current language. Stable
 * per language, so `t` can sit in effect/memo dependency lists without
 * re-running them every render (loaders that toast errors need it there).
 */
export function useT() {
  const lang = useSettingsStore((s) => s.language);
  return useCallback((key: TranslationKey): string => translate(lang, key), [lang]);
}

export type { TranslationKey };
