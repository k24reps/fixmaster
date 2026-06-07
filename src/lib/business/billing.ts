import type { PlanType } from '@/data/types';
import { PLANS, withinOutletQuota } from '@/config/plans';

/**
 * Pure subscription/billing logic (Fase 1B). No I/O — mirrors the server-side
 * enforcement (`is_org_active`, reminder/grace cron) so the UI can show the
 * right banner and the same rules stay testable. Server RPC remains the real
 * boundary.
 *
 * Locked policy (default, user-confirmable):
 *  - Reminder banner starts H-REMINDER_DAYS before expiry.
 *  - After expiry, a GRACE_DAYS window still allows full access.
 *  - Past grace → 'expired' (org should be suspended; writes blocked).
 */
export const REMINDER_DAYS = 3;
export const GRACE_DAYS = 3;

export type SubscriptionPhase = 'active' | 'reminder' | 'grace' | 'expired';

/** Whole days from `now` until `date` (negative = in the past). */
export function daysUntil(date: string, now: Date = new Date()): number {
  const ms = new Date(date).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** ISO timestamp one billing period (default 1 month) after `start`. */
export function periodEnd(start: string, months = 1): string {
  const d = new Date(start);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * Subscription phase from expiry + now. A null expiry is treated as active
 * (e.g. not yet on a paid clock).
 */
export function subscriptionPhase(
  expiry: string | null,
  now: Date = new Date(),
): SubscriptionPhase {
  if (!expiry) return 'active';
  const days = daysUntil(expiry, now);
  if (days > REMINDER_DAYS) return 'active';
  if (days > 0) return 'reminder';
  if (days >= -GRACE_DAYS) return 'grace';
  return 'expired';
}

/** Writes are blocked only once fully expired (grace still allows access). */
export function canWrite(phase: SubscriptionPhase): boolean {
  return phase !== 'expired';
}

/**
 * Whether an org is currently "active" (usable for writes): not suspended,
 * within its outlet quota, and not past grace. Mirrors server `is_org_active`.
 */
export function isOrgActive(args: {
  plan: PlanType;
  expiry: string | null;
  outletCount: number;
  now?: Date;
}): boolean {
  if (args.plan === 'suspended') return false;
  if (!withinOutletQuota(args.plan, args.outletCount)) return false;
  return canWrite(subscriptionPhase(args.expiry, args.now));
}

/** Human-readable Indonesian label for a phase (for the billing banner). */
export function phaseLabel(phase: SubscriptionPhase): string {
  switch (phase) {
    case 'active':
      return 'Aktif';
    case 'reminder':
      return 'Akan jatuh tempo';
    case 'grace':
      return 'Masa tenggang';
    case 'expired':
      return 'Kedaluwarsa';
  }
}

/** Display price for a plan (placeholder numbers until launch). */
export function planPrice(plan: PlanType): string {
  return PLANS[plan].priceLabel;
}
