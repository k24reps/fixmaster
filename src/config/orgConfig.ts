import { repository } from '@/data';
import { useSessionStore } from '@/stores/session';
import type { ID, MonthlyTarget, OrgSettings, OutletRent } from '@/data/types';
import { sanitizeMobileNavPaths } from '@/lib/business/navigation';
import { resolveServiceColumns, type ServiceColumnId } from '@/lib/business/serviceColumns';

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
 * Sensible starter device categories for the "new service" dropdown, used when
 * an org has no configured list yet — a brand-new cloud org (settings '{}',
 * deviceCategories undefined) or a pre-0032 org with no local data. Mirrors the
 * onboarding wizard's initial list. Deterministic, so the fallback is identical
 * on every device.
 */
export const DEFAULT_DEVICE_CATEGORIES = ['Laptop', 'HP / Smartphone', 'Printer', 'PC / Komputer'];

/**
 * Device categories for the "new service" dropdown. Reads from the org row
 * (cloud-synced, 0032). Falls back to the legacy per-device localStorage list,
 * then to {@link DEFAULT_DEVICE_CATEGORIES} so the form is never empty. An empty
 * configured list is treated as "unconfigured" (the service form always needs
 * at least one category; onboarding enforces ≥1). The owner can customize in
 * Settings, which persists the chosen list to the cloud.
 */
export function getCategories(): string[] {
  const cloud = useSessionStore.getState().org?.settings?.deviceCategories;
  if (Array.isArray(cloud) && cloud.length > 0) return cloud;
  const local = readLocalCategories();
  if (local.length > 0) return local;
  return DEFAULT_DEVICE_CATEGORIES;
}

/**
 * Persist device categories to the org row (synced across devices) and refresh
 * the session store so readers (service form, filters) react immediately.
 * Manager-only at the data layer (RLS on organizations UPDATE).
 */
export async function setCategories(categories: string[]): Promise<void> {
  if (!useSessionStore.getState().org) {
    // No active org (shouldn't happen in-app); keep a local copy as fallback.
    localStorage.setItem(`fixmaster-categories-${orgId()}`, JSON.stringify(categories));
    return;
  }
  await patchSettings({ deviceCategories: categories });
}

/** Simpan kolom tabel Servis ke baris organisasi (tersinkron antar perangkat). */
export async function saveServiceColumns(columns: ServiceColumnId[]): Promise<void> {
  await patchSettings({ serviceColumns: resolveServiceColumns(columns) });
}

/** Mobile primary navigation shared by every device in this organization. */
export function getMobileNavigation(): string[] {
  return sanitizeMobileNavPaths(useSessionStore.getState().org?.settings?.mobileNavigation);
}

/** Persist the owner's four-slot mobile navigation layout to the org row. */
export async function setMobileNavigation(paths: string[]): Promise<void> {
  await patchSettings({ mobileNavigation: sanitizeMobileNavPaths(paths) });
}

/** Batas catatan publik toko: cukup untuk jam buka + syarat garansi, tapi
 *  masih muat di nota termal 58mm tanpa menghabiskan gulungan kertas. */
export const PUBLIC_NOTE_MAX = 280;

/** Catatan bebas toko yang tampil di nota cetak dan halaman lacak publik. */
export function getPublicNote(): string {
  return (useSessionStore.getState().org?.settings?.publicNote ?? '').trim();
}

/** Simpan catatan publik ke baris organisasi (ikut tersinkron antar perangkat). */
export async function setPublicNote(note: string): Promise<void> {
  await patchSettings({ publicNote: note.trim().slice(0, PUBLIC_NOTE_MAX) });
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

/**
 * Tulis sebagian setelan ke BARIS ORGANISASI, lalu segarkan sesi supaya
 * pembacanya (form servis, StatusModal, NotifyModal) langsung ikut berubah.
 * Salinan localStorage tetap ditulis pemanggil sebagai cadangan mode lokal.
 */
export async function patchSettings(patch: Partial<OrgSettings>): Promise<void> {
  const org = useSessionStore.getState().org;
  if (!org) return;
  const saved = await repository.setSingleton('organization', {
    ...org,
    settings: { ...(org.settings ?? {}), ...patch },
  });
  useSessionStore.setState({ org: saved });
}

function settings(): OrgSettings {
  return useSessionStore.getState().org?.settings ?? {};
}

/** Default service/labor warranty length (days) prefilled when a job is finished. */
export function getWarrantyServiceDays(): number {
  const cloud = settings().warrantyServiceDays;
  if (typeof cloud === 'number' && cloud >= 0) return cloud;
  const raw = localStorage.getItem(`fixmaster-warranty-service-days-${orgId()}`);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

/** Default spare-part warranty length (days) prefilled when a job is finished. */
export function getWarrantyPartsDays(): number {
  const cloud = settings().warrantyPartsDays;
  if (typeof cloud === 'number' && cloud >= 0) return cloud;
  const raw = localStorage.getItem(`fixmaster-warranty-parts-days-${orgId()}`);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 7;
}
/**
 * Kedua default garansi disimpan bersama: keduanya diubah dari satu tombol,
 * dan dua tulisan berurutan berarti dua kali menulis seluruh baris organisasi
 * plus satu jeda di mana hanya separuh pasangannya tersimpan.
 */
export async function setWarrantyDays(service: number, parts: number): Promise<void> {
  const svc = Math.max(0, Math.round(service));
  const prt = Math.max(0, Math.round(parts));
  localStorage.setItem(`fixmaster-warranty-service-days-${orgId()}`, String(svc));
  localStorage.setItem(`fixmaster-warranty-parts-days-${orgId()}`, String(prt));
  await patchSettings({ warrantyServiceDays: svc, warrantyPartsDays: prt });
}

const DEFAULT_WARRANTY_PRESETS = [3, 7, 14, 30, 90];

/** Quick-pick warranty duration presets (days), shown as chips in StatusModal. */
export function getWarrantyPresets(): number[] {
  const cloud = settings().warrantyPresets;
  if (Array.isArray(cloud) && cloud.length > 0) return cloud;
  const raw = localStorage.getItem(`fixmaster-warranty-presets-${orgId()}`);
  if (!raw) return DEFAULT_WARRANTY_PRESETS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const nums = parsed.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
      return nums.length
        ? Array.from(new Set(nums)).sort((a, b) => a - b)
        : DEFAULT_WARRANTY_PRESETS;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_WARRANTY_PRESETS;
}
export async function setWarrantyPresets(presets: number[]): Promise<void> {
  const clean = Array.from(new Set(presets.map((n) => Math.max(0, Math.round(n))))).sort(
    (a, b) => a - b,
  );
  localStorage.setItem(`fixmaster-warranty-presets-${orgId()}`, JSON.stringify(clean));
  await patchSettings({ warrantyPresets: clean });
}

/** Daftar teks org-scoped: baris organisasi dulu, localStorage sebagai cadangan. */
function getStringList(key: string, cloud: string[] | undefined): string[] {
  if (Array.isArray(cloud) && cloud.length > 0) return cloud;
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
  return getStringList('complaints', settings().complaintTemplates);
}
export async function setComplaintTemplates(list: string[]): Promise<void> {
  setStringList('complaints', list);
  await patchSettings({ complaintTemplates: list });
}

/** Reusable accessory/kelengkapan templates for the service form. */
export function getAccessoryTemplates(): string[] {
  return getStringList('accessories', settings().accessoryTemplates);
}
export async function setAccessoryTemplates(list: string[]): Promise<void> {
  setStringList('accessories', list);
  await patchSettings({ accessoryTemplates: list });
}

/**
 * WhatsApp message template overrides (per key). Only customized keys are
 * stored; missing keys fall back to DEFAULT_WA_TEMPLATES via resolveWaTemplates.
 */
export function getWaTemplateOverrides(): Record<string, string> {
  const cloud = settings().waTemplates;
  if (cloud && Object.keys(cloud).length > 0) return cloud;
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
export async function setWaTemplateOverrides(
  overrides: Record<string, string>,
): Promise<void> {
  localStorage.setItem(`fixmaster-wa-templates-${orgId()}`, JSON.stringify(overrides));
  await patchSettings({ waTemplates: overrides });
}

/**
 * Kapan backup manual terakhir diunduh. Disimpan di baris organisasi supaya
 * pemilik dengan dua perangkat tidak melihat dua kebenaran berbeda tentang
 * kapan terakhir ia mengamankan datanya. Pengingat backup-nya sendiri tetap
 * per-perangkat — itu memang preferensi alat, bukan fakta tentang toko.
 */
export function getLastBackupAt(): string | null {
  return settings().lastBackupAt ?? null;
}
export async function setLastBackupAt(at: string): Promise<void> {
  await patchSettings({ lastBackupAt: at });
}

export async function setBackupEmail(on: boolean): Promise<void> {
  await patchSettings({ backupEmail: on });
}

const NO_TARGET: MonthlyTarget = { revenue: 0, serviceCount: 0, overheadBudget: 0 };

/**
 * Target bulanan & overhead budget. Dibaca dari baris organisasi supaya sama di
 * semua perangkat; salinan localStorage lama tetap dipakai sebagai cadangan
 * untuk toko yang belum sempat menyimpan ulang. Dulu HANYA localStorage, jadi
 * Indikator Break-Even di Laporan berbeda antara laptop dan HP — dan hilang
 * begitu data browser dibersihkan.
 */
/** Target bulanan & anggaran overhead — dulu hanya bisa diisi saat onboarding. */
export async function setMonthlyTarget(target: MonthlyTarget): Promise<void> {
  try {
    localStorage.setItem(`fixmaster-target-${orgId()}`, JSON.stringify(target));
  } catch {
    /* salinan lokal hanya cadangan */
  }
  await patchSettings({ monthlyTarget: target });
}

export function getTarget(): MonthlyTarget {
  const cloud = settings().monthlyTarget;
  if (cloud) return cloud;
  const raw = localStorage.getItem(`fixmaster-target-${orgId()}`);
  if (!raw) return NO_TARGET;
  try {
    return JSON.parse(raw) as MonthlyTarget;
  } catch {
    return NO_TARGET;
  }
}

/** Sewa per cabang (bulanan/tahunan) untuk overhead Laporan. */
export function getRent(): Record<ID, OutletRent> {
  return settings().rent ?? {};
}
export async function setRent(rent: Record<ID, OutletRent>): Promise<void> {
  await patchSettings({ rent });
}

/**
 * Bulan mulai memakai FixMaster ('YYYY-MM'): bulan itu hampir pasti tercatat
 * setengah jalan, jadi tidak ikut rata-rata overhead. Organisasi tak menyimpan
 * tanggal dibuat; awal trial adalah tanggal daftar. ponytail: null untuk toko
 * tanpa trial — overhead lalu menganggap bulan kosong sebagai belum tercatat.
 */
export function getStartMonth(): string | null {
  return useSessionStore.getState().org?.trialStartedAt?.slice(0, 7) ?? null;
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
