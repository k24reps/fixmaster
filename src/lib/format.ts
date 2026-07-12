/**
 * Pure formatting utilities (Rupiah currency + numbers).
 * No DOM/state dependencies → fully unit-testable.
 */

/** Format a number as Indonesian Rupiah, e.g. 1500000 → "Rp 1.500.000". */
export function fmtRp(value: number): string {
  if (!Number.isFinite(value)) return 'Rp 0';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${digits}`;
}

/**
 * Compact Rupiah for tight spaces (chart axes, badges): 2450000 → "2,45 jt",
 * 612500 → "612 rb", 900 → "900". One decimal max, no trailing zero.
 */
export function fmtRpCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(Math.round(value));
  const sign = value < 0 ? '-' : '';
  const compact = (n: number, unit: string) => {
    const s = (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
    return `${sign}${s} ${unit}`;
  };
  if (abs >= 1_000_000_000) return compact(abs / 1_000_000_000, 'M');
  if (abs >= 1_000_000) return compact(abs / 1_000_000, 'jt');
  if (abs >= 1_000) return compact(abs / 1_000, 'rb');
  return `${sign}${abs}`;
}

/** Format a number with thousand separators (no currency), e.g. 1500000 → "1.500.000". */
export function fmtNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Format raw input as a grouped number string for currency inputs. */
export function fmtRpInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Parse a formatted Rupiah/grouped string back into a number. */
export function parseRpInput(formatted: string): number {
  const digits = formatted.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

/** Format a percentage, e.g. 0.1234 → "12,3%". */
export function fmtPercent(ratio: number, decimals = 1): string {
  if (!Number.isFinite(ratio)) return '0%';
  return `${(ratio * 100).toFixed(decimals).replace('.', ',')}%`;
}
