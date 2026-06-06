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
