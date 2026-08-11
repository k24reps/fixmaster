import { NAV_ITEMS, type NavItem } from '@/config/navigation';
import { isManager, isOwner, planAllows } from '@/config/plans';
import type { PlanType, Role } from '@/data/types';

export const MOBILE_NAV_SLOT_COUNT = 4;
export const DEFAULT_MOBILE_NAV_PATHS = ['/', '/services', '/pos', '/inventory'];

export interface ResolvedNavItem {
  item: NavItem;
  locked: boolean;
}

/** Navigation visible to a role, with plan locks kept visible for upgrade discovery. */
export function getVisibleNavigation(role: Role, plan: PlanType): ResolvedNavItem[] {
  const manager = isManager(role);
  const owner = isOwner(role);

  return NAV_ITEMS.filter(
    (item) => (!item.managerOnly || manager) && (!item.ownerOnly || owner),
  ).map((item) => ({
    item,
    locked: !!item.feature && !planAllows(plan, item.feature),
  }));
}

/**
 * Keep an owner-defined mobile layout valid after role/plan/navigation changes.
 * Invalid and duplicate paths are dropped, then empty slots receive predictable
 * defaults so every user still has four useful primary destinations.
 */
export function sanitizeMobileNavPaths(
  configured: readonly string[] | undefined,
  allowedPaths: readonly string[] = NAV_ITEMS.map((item) => item.to),
): string[] {
  const allowed = new Set(allowedPaths);
  const result: string[] = [];

  const append = (path: string) => {
    if (allowed.has(path) && !result.includes(path) && result.length < MOBILE_NAV_SLOT_COUNT) {
      result.push(path);
    }
  };

  configured?.forEach(append);
  DEFAULT_MOBILE_NAV_PATHS.forEach(append);
  allowedPaths.forEach(append);

  return result;
}

export function resolveMobileNavigation(
  configured: readonly string[] | undefined,
  visibleItems: readonly ResolvedNavItem[],
): ResolvedNavItem[] {
  const paths = sanitizeMobileNavPaths(
    configured,
    visibleItems.map(({ item }) => item.to),
  );
  return paths
    .map((path) => visibleItems.find(({ item }) => item.to === path))
    .filter((entry): entry is ResolvedNavItem => !!entry);
}
