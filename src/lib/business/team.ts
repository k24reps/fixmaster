import type { Employee, Role } from '@/data/types';

/**
 * Pure team-management rules (Fase 1A). These mirror the server-side guards in
 * the security-definer RPCs (`set_member_role`, `deactivate_member`) so the UI
 * can disable invalid actions early — but the RPC remains the real boundary.
 */

/** Basic email shape check for the invite form. */
export function isValidInviteEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

/** Count active owners in a member list. */
export function activeOwnerCount(members: Pick<Employee, 'role' | 'active'>[]): number {
  return members.filter((m) => m.role === 'owner' && m.active).length;
}

/**
 * Whether `member` may be deactivated given the full member list. Refuses the
 * last active owner (matches the RPC guard).
 */
export function canDeactivate(
  member: Pick<Employee, 'id' | 'role' | 'active'>,
  members: Pick<Employee, 'role' | 'active'>[],
): boolean {
  if (!member.active) return false;
  if (member.role === 'owner' && activeOwnerCount(members) <= 1) return false;
  return true;
}

/**
 * Whether `member`'s role may change to `next` given the full member list.
 * Refuses demoting the last active owner.
 */
export function canChangeRole(
  member: Pick<Employee, 'role' | 'active'>,
  next: Role,
  members: Pick<Employee, 'role' | 'active'>[],
): boolean {
  if (member.role === next) return false;
  if (member.role === 'owner' && next !== 'owner' && activeOwnerCount(members) <= 1) return false;
  return true;
}
