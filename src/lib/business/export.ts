/**
 * CSV export — pure, DOM-free helpers so they're fully unit-testable.
 * The browser download itself lives in the UI layer (needs Blob/anchor).
 *
 * Excel/Sheets-friendly: values are quoted when they contain a comma, quote,
 * newline, or leading characters that spreadsheets would misread; embedded
 * quotes are doubled per RFC 4180. A UTF-8 BOM is prepended by `buildCsv`
 * so Excel renders Indonesian text and Rupiah correctly.
 */

export interface CsvColumn<T> {
  /** Header label written in the first row. */
  label: string;
  /** Extract the cell value for a row. */
  value: (row: T) => string | number | boolean | null | undefined;
}

/** UTF-8 byte-order mark — makes Excel open the file as UTF-8. */
export const CSV_BOM = '\uFEFF';

/**
 * Escape a single field for CSV. Wraps in double quotes when the value
 * contains a delimiter, quote, or newline; doubles inner quotes. A leading
 * `=+-@` is prefixed with a quote to neutralise spreadsheet formula injection.
 */
export function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Formula-injection guard (CSV injection): a cell starting with = + - @
  // could execute in Excel/Sheets. Prefix with an apostrophe to defuse.
  if (/^[=+\-@]/.test(str)) str = `'${str}`;

  const mustQuote = /[",\r\n]/.test(str);
  if (mustQuote) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Join one row's already-stringified fields with commas. */
function toRow(fields: (string | number | boolean | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(',');
}

/**
 * Build a full CSV document (with header) from rows + column definitions.
 * Rows are separated by CRLF (RFC 4180). Returns the body WITHOUT the BOM so
 * the function stays easy to assert in tests; use `buildCsv` for download.
 */
export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = toRow(columns.map((c) => c.label));
  const body = rows.map((row) => toRow(columns.map((c) => c.value(row))));
  return [header, ...body].join('\r\n');
}

/** `rowsToCsv` prefixed with a UTF-8 BOM, ready to hand to a Blob download. */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  return CSV_BOM + rowsToCsv(rows, columns);
}

/**
 * Make a safe, dated filename, e.g. csvFilename('servis') →
 * "fixmaster-servis-2026-06-07.csv".
 */
export function csvFilename(dataset: string, date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  const safe = dataset.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `fixmaster-${safe}-${iso}.csv`;
}
