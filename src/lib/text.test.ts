import { describe, it, expect } from 'vitest';
import { capitalizeFirst, capitalizeLines } from './text';

describe('capitalizeFirst', () => {
  it('capitalizes a leading lowercase letter', () => {
    expect(capitalizeFirst('andi')).toBe('Andi');
  });
  it('leaves already-capitalized text unchanged', () => {
    expect(capitalizeFirst('Andi')).toBe('Andi');
  });
  it('handles empty string', () => {
    expect(capitalizeFirst('')).toBe('');
  });
  it('does not touch non-letters', () => {
    expect(capitalizeFirst('123abc')).toBe('123abc');
  });
});

describe('capitalizeLines', () => {
  it('capitalizes the first letter of each line', () => {
    expect(capitalizeLines('cek stok\nbackup data')).toBe('Cek stok\nBackup data');
  });
  it('respects leading whitespace per line', () => {
    expect(capitalizeLines('  ganti lcd')).toBe('  Ganti lcd');
  });
  it('keeps blank lines intact', () => {
    expect(capitalizeLines('servis\n\nbersihkan')).toBe('Servis\n\nBersihkan');
  });
  it('leaves already-capitalized lines unchanged', () => {
    expect(capitalizeLines('Servis\nBackup')).toBe('Servis\nBackup');
  });
});
