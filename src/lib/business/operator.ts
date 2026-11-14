import { normalizePhone } from './customers';

interface SearchableOrganization {
  orgId: string;
  name: string;
  phone?: string;
}

/**
 * Status toko untuk konsol vendor. Sejak harga per unit (0101) plan_type
 * hanya membedakan toko aktif dan yang ditangguhkan; label paket lama
 * (Solo/Pro/Trial) tidak lagi berarti apa pun bagi operator.
 */
export function operatorPlanLabel(plan: string): string {
  return plan === 'suspended' ? 'Ditangguhkan' : 'Aktif';
}

/**
 * Perkiraan hari sampai tiket baru tertahan, dari laju pemakaian 30 hari.
 * null bila belum ada pemakaian (tidak bisa diperkirakan).
 */
export function daysUntilBlocked(
  balance: number,
  unitsUsed30d: number,
  floor: number,
): number | null {
  const headroom = balance - floor;
  if (headroom <= 0) return 0;
  if (unitsUsed30d <= 0) return null;
  return Math.floor(headroom / (unitsUsed30d / 30));
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
