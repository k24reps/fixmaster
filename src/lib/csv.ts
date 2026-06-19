/**
 * Minimal CSV export helper. Builds a CSV string from rows and triggers a
 * browser download. No deps. RFC-4180-ish quoting: fields containing comma,
 * quote, or newline are wrapped in double-quotes with quotes doubled.
 *
 * A UTF-8 BOM is prepended so Excel (Windows/Indonesian locale) reads accents
 * and the rupiah text correctly instead of mojibake.
 */

/** Escape a single CSV field. */
function escapeField(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from a header row + data rows. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(','));
  return lines.join('\r\n');
}

/**
 * Trigger a browser download of `content` as a file named `filename`.
 * Prepends a UTF-8 BOM for spreadsheet compatibility.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
