import { create } from 'zustand';

/**
 * Workspace preferences: UI language + display currency.
 * Stored locally now; will move to the organization row in the Supabase phase.
 *
 * Three separated axes (per product decision):
 *   - language  → UI text + DATE format (id/en)
 *   - currency  → money symbol/decimals/grouping (Intl)
 *   - non-money numbers stay consistent (not tied to language)
 */
export type Language = 'id' | 'en';
export type CurrencyCode = 'IDR'; // multi-currency-ready (opt-A); add 'USD' | 'EUR' | ... later

const LANG_KEY = 'fixmaster-lang';
const CURRENCY_KEY = 'fixmaster-currency';

function getInitialLang(): Language {
  // Locked to Indonesian for now: only ~5% of UI text is wired to i18n, so
  // exposing 'en' produced a mixed-language UI. The toggle is hidden (Topbar);
  // any previously-stored 'en' is intentionally ignored here so users aren't
  // stuck in the broken state. Restore the stored-preference logic once the
  // app is actually translated.
  return 'id';
}

function getInitialCurrency(): CurrencyCode {
  if (typeof window === 'undefined') return 'IDR';
  const stored = window.localStorage.getItem(CURRENCY_KEY) as CurrencyCode | null;
  return stored === 'IDR' ? stored : 'IDR';
}

interface SettingsState {
  language: Language;
  currency: CurrencyCode;
  setLanguage: (lang: Language) => void;
  setCurrency: (currency: CurrencyCode) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: getInitialLang(),
  currency: getInitialCurrency(),
  setLanguage: (language) => {
    window.localStorage.setItem(LANG_KEY, language);
    document.documentElement.setAttribute('lang', language);
    set({ language });
  },
  setCurrency: (currency) => {
    window.localStorage.setItem(CURRENCY_KEY, currency);
    set({ currency });
  },
}));

/** Apply persisted language to <html lang> before render. */
export function initSettings() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('lang', getInitialLang());
}
