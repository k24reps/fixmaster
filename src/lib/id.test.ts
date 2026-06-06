import { describe, it, expect } from 'vitest';
import { newId, nextDocNumber, derivePrefix } from './id';

describe('newId', () => {
  it('generates unique ids', () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });
});

describe('nextDocNumber', () => {
  it('increments from the max existing number', () => {
    expect(nextDocNumber('FM', ['FM-0007', 'FM-0003'])).toBe('FM-0008');
  });
  it('starts at 0001 when none exist', () => {
    expect(nextDocNumber('FM', [])).toBe('FM-0001');
  });
  it('ignores codes with a different prefix', () => {
    expect(nextDocNumber('FM', ['XX-0099', 'FM-0002'])).toBe('FM-0003');
  });
  it('respects custom width', () => {
    expect(nextDocNumber('PO', ['PO-005'], 3)).toBe('PO-006');
  });
});

describe('derivePrefix', () => {
  it('derives initials from a multi-word name', () => {
    expect(derivePrefix('Tech Fix Center')).toBe('TFC');
  });
  it('caps at max length', () => {
    expect(derivePrefix('Aneka Servis Komputer Jaya')).toBe('ASK');
  });
  it('falls back to FM when empty', () => {
    expect(derivePrefix('')).toBe('FM');
  });
});
