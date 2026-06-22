import { describe, it, expect } from 'vitest';
import { scorePassword } from './password';

describe('scorePassword', () => {
  it('returns empty level for an empty string', () => {
    const r = scorePassword('');
    expect(r.level).toBe('empty');
    expect(r.passed).toBe(0);
    expect(r.label).toBe('');
  });
  it('flags a short letters-only password as weak', () => {
    const r = scorePassword('abc');
    expect(r.checks).toEqual({ length: false, letter: true, digit: false, symbol: false });
    expect(r.level).toBe('weak');
  });
  it('marks letter+digit+length (the signup minimum) as medium', () => {
    const r = scorePassword('abcd1234');
    expect(r.checks).toEqual({ length: true, letter: true, digit: true, symbol: false });
    expect(r.passed).toBe(3);
    expect(r.level).toBe('medium');
    expect(r.label).toBe('Sedang');
  });
  it('marks all four criteria as strong', () => {
    const r = scorePassword('Abcd123!');
    expect(r.passed).toBe(4);
    expect(r.level).toBe('strong');
    expect(r.label).toBe('Kuat');
  });
  it('detects a symbol', () => {
    expect(scorePassword('a!').checks.symbol).toBe(true);
  });
});
