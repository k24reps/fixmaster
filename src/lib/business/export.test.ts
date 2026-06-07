import { describe, it, expect } from 'vitest';
import {
  escapeCsvField,
  rowsToCsv,
  buildCsv,
  csvFilename,
  CSV_BOM,
  type CsvColumn,
} from './export';

describe('escapeCsvField', () => {
  it('passes through simple values unquoted', () => {
    expect(escapeCsvField('Budi')).toBe('Budi');
    expect(escapeCsvField(1500)).toBe('1500');
    expect(escapeCsvField(true)).toBe('true');
  });

  it('renders null/undefined as empty', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('quotes values containing commas, quotes, or newlines', () => {
    expect(escapeCsvField('Jl. Merdeka, No. 1')).toBe('"Jl. Merdeka, No. 1"');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('doubles embedded quotes (RFC 4180)', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('defuses formula injection by prefixing an apostrophe', () => {
    expect(escapeCsvField('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvField('+1')).toBe("'+1");
    expect(escapeCsvField('-1')).toBe("'-1");
    expect(escapeCsvField('@cmd')).toBe("'@cmd");
  });

  it('quotes AND defuses when a formula also contains a comma', () => {
    // leading '=' → apostrophe prefix, then comma forces quoting
    expect(escapeCsvField('=A,B')).toBe('"\'=A,B"');
  });
});

interface Row {
  name: string;
  amount: number;
}
const cols: CsvColumn<Row>[] = [
  { label: 'Nama', value: (r) => r.name },
  { label: 'Jumlah', value: (r) => r.amount },
];

describe('rowsToCsv', () => {
  it('writes a header row then data rows separated by CRLF', () => {
    const csv = rowsToCsv([{ name: 'Budi', amount: 1000 }], cols);
    expect(csv).toBe('Nama,Jumlah\r\nBudi,1000');
  });

  it('handles an empty dataset (header only)', () => {
    expect(rowsToCsv([], cols)).toBe('Nama,Jumlah');
  });

  it('escapes fields per row', () => {
    const csv = rowsToCsv([{ name: 'A, B', amount: 5 }], cols);
    expect(csv).toBe('Nama,Jumlah\r\n"A, B",5');
  });
});

describe('buildCsv', () => {
  it('prepends a UTF-8 BOM', () => {
    const csv = buildCsv([{ name: 'Budi', amount: 1 }], cols);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1)).toBe('Nama,Jumlah\r\nBudi,1');
  });
});

describe('csvFilename', () => {
  it('builds a dated, slugified filename', () => {
    const d = new Date('2026-06-07T10:00:00Z');
    expect(csvFilename('Servis', d)).toBe('fixmaster-servis-2026-06-07.csv');
  });

  it('slugifies spaces and symbols', () => {
    const d = new Date('2026-06-07T10:00:00Z');
    expect(csvFilename('Laba Rugi!', d)).toBe('fixmaster-laba-rugi-2026-06-07.csv');
  });
});
