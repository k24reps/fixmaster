import { describe, it, expect } from 'vitest';
import {
  daysUntil,
  periodEnd,
  subscriptionPhase,
  canWrite,
  isOrgActive,
  REMINDER_DAYS,
  GRACE_DAYS,
} from './billing';

const NOW = new Date('2026-06-06T12:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86400_000).toISOString();

describe('daysUntil', () => {
  it('is positive for the future, negative for the past', () => {
    expect(daysUntil(inDays(5), NOW)).toBe(5);
    expect(daysUntil(inDays(-2), NOW)).toBe(-2);
  });
});

describe('periodEnd', () => {
  it('advances one month by default', () => {
    expect(periodEnd('2026-01-15T00:00:00.000Z')).toBe(
      new Date('2026-02-15T00:00:00.000Z').toISOString(),
    );
  });
  it('supports multi-month periods', () => {
    expect(periodEnd('2026-01-15T00:00:00.000Z', 3)).toBe(
      new Date('2026-04-15T00:00:00.000Z').toISOString(),
    );
  });
});

describe('subscriptionPhase', () => {
  it('null expiry is active', () => {
    expect(subscriptionPhase(null, NOW)).toBe('active');
  });
  it('active when more than REMINDER_DAYS remain', () => {
    expect(subscriptionPhase(inDays(REMINDER_DAYS + 1), NOW)).toBe('active');
  });
  it('reminder within the H-N window', () => {
    expect(subscriptionPhase(inDays(REMINDER_DAYS), NOW)).toBe('reminder');
    expect(subscriptionPhase(inDays(1), NOW)).toBe('reminder');
  });
  it('grace just after expiry through GRACE_DAYS', () => {
    expect(subscriptionPhase(inDays(0), NOW)).toBe('grace');
    expect(subscriptionPhase(inDays(-GRACE_DAYS), NOW)).toBe('grace');
  });
  it('expired past the grace window', () => {
    expect(subscriptionPhase(inDays(-GRACE_DAYS - 1), NOW)).toBe('expired');
  });
});

describe('canWrite', () => {
  it('allows everything except expired', () => {
    expect(canWrite('active')).toBe(true);
    expect(canWrite('reminder')).toBe(true);
    expect(canWrite('grace')).toBe(true);
    expect(canWrite('expired')).toBe(false);
  });
});

describe('isOrgActive', () => {
  it('false when suspended', () => {
    expect(isOrgActive({ plan: 'suspended', expiry: inDays(30), outletCount: 1, now: NOW })).toBe(
      false,
    );
  });
  it('false when over outlet quota', () => {
    // standard (Solo) allows 1 outlet
    expect(isOrgActive({ plan: 'standard', expiry: inDays(30), outletCount: 2, now: NOW })).toBe(
      false,
    );
  });
  it('false when past grace', () => {
    expect(
      isOrgActive({ plan: 'standard', expiry: inDays(-GRACE_DAYS - 1), outletCount: 1, now: NOW }),
    ).toBe(false);
  });
  it('true within quota and not expired', () => {
    expect(isOrgActive({ plan: 'enterprise', expiry: inDays(10), outletCount: 5, now: NOW })).toBe(
      true,
    );
    // grace still counts as active for access
    expect(isOrgActive({ plan: 'standard', expiry: inDays(-1), outletCount: 1, now: NOW })).toBe(
      true,
    );
  });
});
