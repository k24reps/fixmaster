import { normalizePhone } from './customers';

interface SearchableOrganization {
  orgId: string;
  name: string;
  phone?: string;
}

export type OperatorPaidPlan = 'standard' | 'enterprise';

/** Human-facing plan names for the vendor console. */
export function operatorPlanLabel(plan: string): string {
  const labels: Record<string, string> = {
    standard: 'Solo',
    enterprise: 'Pro',
    trial: 'Trial',
    suspended: 'Ditangguhkan',
    free: 'Legacy',
  };
  return labels[plan] ?? plan;
}

/** Monthly amount accepted by the manual-payment RPC. */
export function operatorMonthlyAmount(
  plan: OperatorPaidPlan,
  outletCount: number,
): number {
  if (plan === 'standard') return 99_000;
  const extraOutlets = Math.max(0, outletCount - 2);
  return Math.min(199_000 + extraOutlets * 50_000, 349_000);
}

/** Exact transfer amount expected for a verified manual payment. */
export function expectedManualPayment(
  plan: OperatorPaidPlan,
  outletCount: number,
  months: number,
): number {
  return operatorMonthlyAmount(plan, outletCount) * months;
}

/**
 * Preview the expiry produced by Postgres `timestamp + make_interval(months)`.
 * Calendar-month addition clamps month-end (31 Jan + 1 month = 28/29 Feb),
 * unlike Date#setMonth which can overflow into March.
 */
export function projectedManualExpiry(
  expiresAt: string | null,
  months: number,
  now: Date = new Date(),
): string {
  const existing = expiresAt ? new Date(expiresAt) : null;
  const start = existing && existing.getTime() > now.getTime() ? existing : now;
  const targetMonthIndex = start.getUTCMonth() + months;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(start.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  ).toISOString();
}

/** Compact, unambiguous status copy for an organization's remaining access. */
export function accessRemainingLabel(days: number | null): string {
  if (days === null) return 'Tanpa batas';
  if (days < 0) return `Kedaluwarsa ${Math.abs(days)} hari`;
  if (days === 0) return 'Berakhir hari ini';
  return `${days} hari lagi`;
}

/** Stable, readable organization number derived from the immutable UUID. */
export function organizationNumber(orgId: string): string {
  const compact = orgId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `ORG-${compact || 'UNKNOWN'}`;
}

/** Match an operator query against organization name, short number, or UUID. */
export function matchesOrganization(
  organization: SearchableOrganization,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase('id-ID');
  if (!needle) return true;

  const byText = [
    organization.name,
    organization.orgId,
    organizationNumber(organization.orgId),
  ].some((value) => value.toLocaleLowerCase('id-ID').includes(needle));
  if (byText) return true;

  // Nomor toko: bandingkan digit ternormalisasi, jadi "+62 812-34", "0812 34", dan
  // "081234" saling menemukan. Minimal 4 digit supaya "2026" tak mencocokkan semua.
  const digits = normalizePhone(query);
  return digits.length >= 4 && !!organization.phone && normalizePhone(organization.phone).includes(digits);
}
