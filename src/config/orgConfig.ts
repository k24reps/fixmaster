import { repository } from '@/data';
import { useSessionStore } from '@/stores/session';
import type { MonthlyTarget } from '@/data/types';

/**
 * Org-scoped config. Most keys are persisted locally (per-device localStorage),
 * but DEVICE CATEGORIES live on the organization row (`settings.deviceCategories`,
 * migration 0032) so they sync across devices — a category added on desktop must
 * appear on the phone for the same org.
 */

function orgId(): string {
  return useSessionStore.getState().org?.id ?? '';
}

/** Legacy per-device categories key (pre-0032). Read-only fallback now. */
function readLocalCategories(): string[] {
  const raw = localStorage.getItem(`fixmaster-categories-${orgId()}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Device categories for the "new service" dropdown. Reads from the org row
 * (cloud-synced). Falls back to the legacy per-device localStorage list when
 * the org has no cloud categories yet (pre-0032 data, until an owner re-saves
 * which seeds the cloud copy — see seedCategoriesFromLocal).
 */
export function getCategories(): string[] {
  const cloud = useSessionStore.getState().org?.settings?.deviceCategories;
  if (Array.isArray(cloud)) return cloud;
  return readLocalCategories();
}

/**
 * Persist device categories to the org row (synced across devices) and refresh
 * the session store so readers (service form, filters) react immediately.
 * Manager-only at the data layer (RLS on organizations UPDATE).
 */
export async function setCategories(categories: string[]): Promise<void> {
  const org = useSessionStore.getState().org;
  if (!org) {
    // No active org (shouldn't happen in-app); keep a local copy as fallback.
    localStorage.setItem(`fixmaster-categories-${orgId()}`, JSON.stringify(categories));
    return;
  }
  const saved = await repository.setSingleton('organization', {
    ...org,
    settings: { ...(org.settings ?? {}), deviceCategories: categories },
  });
  // setOrg() would reset the outlet scope; update the org slice directly.
  useSessionStore.setState({ org: saved });
}

/**
 * One-time migration helper: if the org has no cloud categories yet but this
 * device has a legacy localStorage list, copy it to the cloud. No-op when the
 * cloud copy already exists or there is nothing local to seed.
 */
export async function seedCategoriesFromLocal(): Promise<boolean> {
  const org = useSessionStore.getState().org;
  if (!org || Array.isArray(org.settings?.deviceCategories)) return false;
  const local = readLocalCategories();
  if (local.length === 0) return false;
  await setCategories(local);
  return true;
}

/** Default service/labor warranty length (days) prefilled when a job is finished. */
export function getWarrantyServiceDays(): number {
  const raw = localStorage.getItem(`fixmaster-warranty-service-days-${orgId()}`);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 30;
}
export function setWarrantyServiceDays(days: number): void {
  localStorage.setItem(`fixmaster-warranty-service-days-${orgId()}`, String(Math.max(0, Math.round(days))));
}

/** Default spare-part warranty length (days) prefilled when a job is finished. */
export function getWarrantyPartsDays(): number {
  const raw = localStorage.getItem(`fixmaster-warranty-parts-days-${orgId()}`);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 7;
}
export function setWarrantyPartsDays(days: number): void {
  localStorage.setItem(`fixmaster-warranty-parts-days-${orgId()}`, String(Math.max(0, Math.round(days))));
}

/** Quick-pick warranty duration presets (days), shown as chips in StatusModal. */
export function getWarrantyPresets(): number[] {
  const raw = localStorage.getItem(`fixmaster-warranty-presets-${orgId()}`);
  if (!raw) return [3, 7, 14, 30, 90];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const nums = parsed.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
      return nums.length ? Array.from(new Set(nums)).sort((a, b) => a - b) : [3, 7, 14, 30, 90];
    }
  } catch {
    /* fall through */
  }
  return [3, 7, 14, 30, 90];
}
export function setWarrantyPresets(presets: number[]): void {
  const clean = Array.from(new Set(presets.map((n) => Math.max(0, Math.round(n))))).sort((a, b) => a - b);
  localStorage.setItem(`fixmaster-warranty-presets-${orgId()}`, JSON.stringify(clean));
}

/** Generic list-of-strings getter for org-scoped config keys. */
function getStringList(key: string): string[] {
  const raw = localStorage.getItem(`fixmaster-${key}-${orgId()}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as string[]) : [];
  } catch {
    return [];
  }
}

function setStringList(key: string, list: string[]): void {
  localStorage.setItem(`fixmaster-${key}-${orgId()}`, JSON.stringify(list));
}

/** Reusable complaint templates shown as quick-picks in the service form. */
export function getComplaintTemplates(): string[] {
  return getStringList('complaints');
}
export function setComplaintTemplates(list: string[]): void {
  setStringList('complaints', list);
}

/** Reusable accessory/kelengkapan templates for the service form. */
export function getAccessoryTemplates(): string[] {
  return getStringList('accessories');
}
export function setAccessoryTemplates(list: string[]): void {
  setStringList('accessories', list);
}

/**
 * WhatsApp message template overrides (per key). Only customized keys are
 * stored; missing keys fall back to DEFAULT_WA_TEMPLATES via resolveWaTemplates.
 */
export function getWaTemplateOverrides(): Record<string, string> {
  const raw = localStorage.getItem(`fixmaster-wa-templates-${orgId()}`);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    /* fall through */
  }
  return {};
}
export function setWaTemplateOverrides(overrides: Record<string, string>): void {
  localStorage.setItem(`fixmaster-wa-templates-${orgId()}`, JSON.stringify(overrides));
}

export function getTarget(): MonthlyTarget {
  const raw = localStorage.getItem(`fixmaster-target-${orgId()}`);
  if (!raw) return { revenue: 0, serviceCount: 0, overheadBudget: 0 };
  try {
    return JSON.parse(raw) as MonthlyTarget;
  } catch {
    return { revenue: 0, serviceCount: 0, overheadBudget: 0 };
  }
}

export function setTarget(target: MonthlyTarget): void {
  localStorage.setItem(`fixmaster-target-${orgId()}`, JSON.stringify(target));
}

/**
 * Last wallet used for an ad-hoc "modal dadakan" expense (per-device memory).
 * Powers the "remember last" default on the service detail cost entry, with a
 * caller-side fallback to the first wallet when empty.
 */
export function getLastExpenseWallet(): string {
  return localStorage.getItem(`fixmaster-last-modal-wallet-${orgId()}`) ?? '';
}
export function setLastExpenseWallet(walletId: string): void {
  localStorage.setItem(`fixmaster-last-modal-wallet-${orgId()}`, walletId);
}
