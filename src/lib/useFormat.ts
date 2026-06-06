/**
 * Locale-aware formatting hook. Keeps the THREE AXES separate:
 *   - money  → follows the workspace CURRENCY (stable across UI language)
 *   - dates  → follow the UI LANGUAGE (id → "2 Jun 2026", en → "Jun 2, 2026")
 *   - plain numbers → consistent grouping (tied to currency locale, not language)
 *
 * Pure IDR helpers in lib/format.ts remain for tests/non-React code; this hook
 * is the app-facing, reactive formatter.
 */
import { useSettingsStore, type CurrencyCode } from '@/stores/settings';

/** Locale used for MONEY + number grouping, derived from currency (not UI lang). */
const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  IDR: 'id-ID',
};
/** Fraction digits per currency (IDR has none). */
const CURRENCY_FRACTION: Record<CurrencyCode, number> = {
  IDR: 0,
};

export function useFormat() {
  const language = useSettingsStore((s) => s.language);
  const currency = useSettingsStore((s) => s.currency);

  const moneyLocale = CURRENCY_LOCALE[currency];
  const fraction = CURRENCY_FRACTION[currency];
  const dateLocale = language === 'en' ? 'en-US' : 'id-ID';

  /** Money with currency symbol, e.g. IDR → "Rp 1.500.000". */
  const fmtMoney = (value: number): string => {
    if (!Number.isFinite(value)) value = 0;
    return new Intl.NumberFormat(moneyLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(value);
  };

  /** Plain grouped number (no currency), consistent regardless of UI language. */
  const fmtNum = (value: number): string => {
    if (!Number.isFinite(value)) value = 0;
    return new Intl.NumberFormat(moneyLocale).format(value);
  };

  /** Date formatted per UI language. */
  const fmtDate = (
    date: string | Date,
    opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
  ): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(dateLocale, opts).format(d);
  };

  /** Date + time per UI language. */
  const fmtDateTime = (date: string | Date): string =>
    fmtDate(date, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return { fmtMoney, fmtNum, fmtDate, fmtDateTime, currency, language };
}
