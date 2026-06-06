import { describe, it, expect } from 'vitest';
import { fmtRp, fmtNumber, fmtRpInput, parseRpInput, fmtPercent } from './format';

describe('fmtRp', () => {
  it('formats positive amounts with thousand separators', () => {
    expect(fmtRp(1500000)).toBe('Rp 1.500.000');
    expect(fmtRp(0)).toBe('Rp 0');
    expect(fmtRp(999)).toBe('Rp 999');
  });
  it('formats negative amounts', () => {
    expect(fmtRp(-50000)).toBe('-Rp 50.000');
  });
  it('rounds decimals', () => {
    expect(fmtRp(1500.6)).toBe('Rp 1.501');
  });
  it('handles non-finite input', () => {
    expect(fmtRp(NaN)).toBe('Rp 0');
    expect(fmtRp(Infinity)).toBe('Rp 0');
  });
});

describe('fmtNumber', () => {
  it('groups thousands without currency', () => {
    expect(fmtNumber(1500000)).toBe('1.500.000');
  });
});

describe('fmtRpInput / parseRpInput', () => {
  it('formats raw digits into grouped string', () => {
    expect(fmtRpInput('1500000')).toBe('1.500.000');
    expect(fmtRpInput('abc')).toBe('');
  });
  it('parses grouped string back to number (round-trip)', () => {
    expect(parseRpInput('1.500.000')).toBe(1500000);
    expect(parseRpInput('Rp 250.000')).toBe(250000);
    expect(parseRpInput('')).toBe(0);
  });
});

describe('fmtPercent', () => {
  it('formats ratio with Indonesian decimal comma', () => {
    expect(fmtPercent(0.1234)).toBe('12,3%');
    expect(fmtPercent(1)).toBe('100,0%');
  });
  it('handles non-finite', () => {
    expect(fmtPercent(NaN)).toBe('0%');
  });
});
