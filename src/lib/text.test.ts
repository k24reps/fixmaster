import { describe, it, expect } from 'vitest';
import { capitalizeFirst, capitalizeLines, capitalizeWords } from './text';

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

describe('capitalizeWords', () => {
  it('capitalizes the first letter of each word', () => {
    expect(capitalizeWords('budi santoso')).toBe('Budi Santoso');
  });
  it('capitalizes after multiple spaces', () => {
    expect(capitalizeWords('macbook pro 2019')).toBe('Macbook Pro 2019');
  });
  it('leaves already-cased letters mid-word alone', () => {
    expect(capitalizeWords('iPhone 14')).toBe('IPhone 14');
  });
  it('does not touch leading digits of a word', () => {
    expect(capitalizeWords('3 idiots')).toBe('3 Idiots');
  });
  it('preserves existing spacing', () => {
    expect(capitalizeWords('andi  budi')).toBe('Andi  Budi');
  });
  it('handles empty string', () => {
    expect(capitalizeWords('')).toBe('');
  });
});
