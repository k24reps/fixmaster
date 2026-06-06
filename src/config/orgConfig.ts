import { useSessionStore } from '@/stores/session';
import type { MonthlyTarget } from '@/data/types';

/**
 * Org-scoped config persisted locally (categories + monthly targets).
 * In the Supabase phase these move into the organization row.
 */

function orgId(): string {
  return useSessionStore.getState().org?.id ?? '';
}

export function getCategories(): string[] {
  const raw = localStorage.getItem(`fixmaster-categories-${orgId()}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function setCategories(categories: string[]): void {
  localStorage.setItem(`fixmaster-categories-${orgId()}`, JSON.stringify(categories));
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
