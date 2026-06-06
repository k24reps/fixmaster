import { describe, it, expect } from 'vitest';
import {
  calcHours,
  localDateStr,
  localTimeStr,
  fmtDate,
  parseISODate,
  isInRange,
  addDays,
  daysBetween,
} from './time';

describe('calcHours', () => {
  it('computes a normal same-day shift', () => {
    expect(calcHours('08:00', '17:00')).toBe(9);
  });
  it('handles a fractional shift', () => {
    expect(calcHours('09:15', '12:45')).toBe(3.5);
  });
  it('handles an overnight shift (checkout earlier than checkin)', () => {
    expect(calcHours('22:00', '06:00')).toBe(8);
  });
  it('returns 0 for invalid input', () => {
    expect(calcHours('', '')).toBe(0);
    expect(calcHours('25:00', '10:00')).toBe(0);
    expect(calcHours('8:00', 'abc')).toBe(0);
  });
});

describe('localDateStr', () => {
  it('formats a date as YYYY-MM-DD without UTC shift', () => {
    expect(localDateStr(new Date(2026, 5, 2))).toBe('2026-06-02');
    expect(localDateStr(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('localTimeStr', () => {
  it('formats time as HH:MM (no platform bug)', () => {
    expect(localTimeStr(new Date(2026, 5, 2, 11, 5))).toBe('11:05');
    expect(localTimeStr(new Date(2026, 5, 2, 23, 0))).toBe('23:00');
  });
});

describe('fmtDate', () => {
  it('formats ISO date to Indonesian short form', () => {
    expect(fmtDate('2026-06-02')).toBe('2 Jun 2026');
  });
  it('returns input unchanged when invalid', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date');
  });
});

describe('parseISODate', () => {
  it('parses valid ISO date at local noon', () => {
    const d = parseISODate('2026-06-02');
    expect(d?.getHours()).toBe(12);
    expect(d?.getFullYear()).toBe(2026);
  });
  it('returns null for invalid', () => {
    expect(parseISODate('2026/06/02')).toBeNull();
  });
});

describe('isInRange', () => {
  it('is inclusive of both bounds', () => {
    expect(isInRange('2026-06-02', '2026-06-01', '2026-06-30')).toBe(true);
    expect(isInRange('2026-06-01', '2026-06-01', '2026-06-30')).toBe(true);
    expect(isInRange('2026-06-30', '2026-06-01', '2026-06-30')).toBe(true);
  });
  it('excludes out-of-range dates', () => {
    expect(isInRange('2026-07-01', '2026-06-01', '2026-06-30')).toBe(false);
  });
});

describe('addDays / daysBetween', () => {
  it('adds days across month boundary', () => {
    expect(addDays('2026-06-30', 2)).toBe('2026-07-02');
  });
  it('subtracts with negative days', () => {
    expect(addDays('2026-06-02', -2)).toBe('2026-05-31');
  });
  it('counts whole days between dates', () => {
    expect(daysBetween('2026-06-01', '2026-06-11')).toBe(10);
  });
});
