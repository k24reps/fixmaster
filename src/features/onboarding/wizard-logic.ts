import type {
  Organization,
  Employee,
  Wallet,
  FixedCost,
  Outlet,
  Role,
  ID,
} from '@/data/types';
import { repository } from '@/data';
import { getSupabase, isSupabaseConfigured } from '@/data/supabase-client';
import { newId, derivePrefix } from '@/lib/id';
import { hashPin } from '@/lib/pin';

export interface WizardWalletDraft {
  name: string;
  balance: number;
}
export interface WizardEmployeeDraft {
  name: string;
  role: Role;
  pin: string;
}
export interface WizardCostDraft {
  name: string;
  amount: number;
}
export interface WizardOutletDraft {
  name: string;
  address: string;
}

export interface WizardData {
  shopName: string;
  address: string;
  phone: string;
  servicePrefix: string;
  wallets: WizardWalletDraft[];
  categories: string[];
  employees: WizardEmployeeDraft[];
  fixedCosts: WizardCostDraft[];
  /** Physical locations. First entry is the primary outlet. */
  outlets: WizardOutletDraft[];
  targetRevenue: number;
  targetServiceCount: number;
  overheadBudget: number;
}

export function emptyWizardData(): WizardData {
  return {
    shopName: '',
    address: '',
    phone: '',
    servicePrefix: '',
    wallets: [{ name: 'Tunai', balance: 0 }],
    categories: ['Laptop', 'HP / Smartphone', 'Printer', 'PC / Komputer'],
    employees: [{ name: '', role: 'owner', pin: '' }],
    fixedCosts: [],
    outlets: [{ name: '', address: '' }],
    targetRevenue: 0,
    targetServiceCount: 0,
    overheadBudget: 0,
  };
}

export interface StepError {
  field: string;
  message: string;
}

/** Validate a single wizard step. Returns [] when valid. */
export function validateStep(step: number, data: WizardData): StepError[] {
  const errors: StepError[] = [];
  if (step === 1) {
    if (!data.shopName.trim()) errors.push({ field: 'shopName', message: 'Nama usaha wajib diisi' });
  }
  if (step === 2) {
    const valid = data.wallets.filter((w) => w.name.trim());
    if (valid.length === 0)
      errors.push({ field: 'wallets', message: 'Minimal 1 wallet/kas diperlukan' });
  }
  if (step === 3) {
    if (data.categories.length === 0)
      errors.push({ field: 'categories', message: 'Minimal 1 kategori perangkat' });
  }
  if (step === 4) {
    const owners = data.employees.filter((e) => e.role === 'owner');
    if (owners.length === 0)
      errors.push({ field: 'employees', message: 'Minimal 1 Owner diperlukan' });
    data.employees.forEach((e, i) => {
      if (!e.name.trim()) errors.push({ field: `emp-name-${i}`, message: 'Nama wajib diisi' });
      if (!/^\d{4}$/.test(e.pin))
        errors.push({ field: `emp-pin-${i}`, message: 'PIN harus 4 digit' });
    });
  }
  // Step 6 = Outlet. The first outlet's name falls back to the shop name, so
  // only additional outlets must be named. Always need at least one.
  if (step === 6) {
    if (data.outlets.length === 0)
      errors.push({ field: 'outlets', message: 'Minimal 1 outlet diperlukan' });
    data.outlets.forEach((o, i) => {
      if (i > 0 && !o.name.trim())
        errors.push({ field: `outlet-name-${i}`, message: 'Nama outlet wajib diisi' });
    });
  }
  return errors;
}

/**
 * Map outlet drafts to records. The first outlet is primary and inherits the
 * shop name/address when left blank (single-outlet shops need not retype it).
 */
function buildOutlets(
  drafts: WizardOutletDraft[],
  orgId: ID,
  shopName: string,
  shopAddress: string,
  now: string,
): Outlet[] {
  return drafts.map((o, i) => ({
    id: newId(),
    orgId,
    outletId: null,
    name: o.name.trim() || (i === 0 ? shopName.trim() : `Outlet ${i + 1}`),
    address: o.address.trim() || (i === 0 ? shopAddress.trim() : ''),
    isPrimary: i === 0,
    lat: null,
    lng: null,
    geofenceRadiusM: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
}

/**
 * Persist the wizard result: organization profile, employees (with hashed
 * PINs), wallets, fixed costs, and category/target config. Returns the
 * created org + the owner employee for auto-login.
 */
export async function commitWizard(
  data: WizardData,
): Promise<{ org: Organization; owner: Employee }> {
  if (isSupabaseConfigured) return commitWizardCloud(data);

  const orgId = newId();
  const now = new Date().toISOString();
  const prefix = data.servicePrefix.trim().toUpperCase() || derivePrefix(data.shopName);

  const org: Organization = {
    id: orgId,
    name: data.shopName.trim(),
    address: data.address.trim(),
    phone: data.phone.trim(),
    logoDataUrl: null,
    servicePrefix: prefix,
    planType: 'trial',
    trialStartedAt: now,
    planExpiredAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    maxOutlets: 5,
    maxUsers: -1,
    createdAt: now,
  };

  // Scope the repository to the new org before writing.
  repository.setScope(orgId, null);
  await repository.setSingleton('organization', org);

  // Employees with salted PIN hashes.
  const employees: Employee[] = [];
  for (const draft of data.employees) {
    const empId = newId();
    const pinHash = await hashPin(draft.pin, empId);
    employees.push({
      id: empId,
      orgId,
      outletId: null,
      name: draft.name.trim(),
      role: draft.role,
      pinHash,
      active: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }
  await repository.putMany('employees', employees);

  // Wallets.
  const wallets: Wallet[] = data.wallets
    .filter((w) => w.name.trim())
    .map((w, i) => ({
      id: newId(),
      orgId,
      outletId: null,
      name: w.name.trim(),
      balance: w.balance,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
  await repository.putMany('wallets', wallets);

  // Outlets (≥1; first is primary). Empty array = caller opts out (dev seed).
  const outlets = buildOutlets(data.outlets, orgId, data.shopName, data.address, now);
  if (outlets.length) await repository.putMany('outlets', outlets);

  // Fixed costs.
  const fixedCosts: FixedCost[] = data.fixedCosts
    .filter((c) => c.name.trim())
    .map((c) => ({
      id: newId(),
      orgId,
      outletId: null,
      name: c.name.trim(),
      amount: c.amount,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
  if (fixedCosts.length) await repository.putMany('fixedCosts', fixedCosts);

  // Categories + targets persisted as org config singletons.
  localStorage.setItem(`fixmaster-categories-${orgId}`, JSON.stringify(data.categories));
  localStorage.setItem(
    `fixmaster-target-${orgId}`,
    JSON.stringify({
      revenue: data.targetRevenue,
      serviceCount: data.targetServiceCount,
      overheadBudget: data.overheadBudget,
    }),
  );

  const owner = employees.find((e) => e.role === 'owner') ?? employees[0];
  return { org, owner };
}

/**
 * Cloud onboarding (Option B): the signed-in account becomes the org owner.
 * The org + owner membership are created server-side via the
 * `create_organization` RPC (which reads auth.uid()), so the org id is
 * generated by Postgres. Wallets + fixed costs are then written through the
 * Supabase adapter under the new org scope. Non-owner employees are NOT
 * created here — they join later via the invite flow (Fase 1). PINs are unused
 * in cloud mode (each person signs in with their own account).
 */
async function commitWizardCloud(
  data: WizardData,
): Promise<{ org: Organization; owner: Employee }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase tidak tersedia');

  const now = new Date().toISOString();
  const prefix = data.servicePrefix.trim().toUpperCase() || derivePrefix(data.shopName);
  const ownerDraft = data.employees.find((e) => e.role === 'owner') ?? data.employees[0];

  // Atomic: creates the org + owner membership (org id generated server-side).
  const { data: orgId, error } = await supabase.rpc('create_organization', {
    p_name: data.shopName.trim(),
    p_owner_name: ownerDraft?.name.trim() || 'Owner',
    p_address: data.address.trim(),
    p_phone: data.phone.trim(),
    p_service_prefix: prefix,
  });
  if (error) throw error;
  const newOrgId = orgId as ID;

  repository.setScope(newOrgId, null);

  // Wallets.
  const wallets: Wallet[] = data.wallets
    .filter((w) => w.name.trim())
    .map((w, i) => ({
      id: newId(),
      orgId: newOrgId,
      outletId: null,
      name: w.name.trim(),
      balance: w.balance,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
  if (wallets.length) await repository.putMany('wallets', wallets);

  // Outlets (≥1; first is primary). Empty array = caller opts out (dev seed).
  const outlets = buildOutlets(data.outlets, newOrgId, data.shopName, data.address, now);
  if (outlets.length) await repository.putMany('outlets', outlets);

  // Fixed costs.
  const fixedCosts: FixedCost[] = data.fixedCosts
    .filter((c) => c.name.trim())
    .map((c) => ({
      id: newId(),
      orgId: newOrgId,
      outletId: null,
      name: c.name.trim(),
      amount: c.amount,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
  if (fixedCosts.length) await repository.putMany('fixedCosts', fixedCosts);

  // Categories + targets (per-device for now; revisit with an org_config table).
  localStorage.setItem(`fixmaster-categories-${newOrgId}`, JSON.stringify(data.categories));
  localStorage.setItem(
    `fixmaster-target-${newOrgId}`,
    JSON.stringify({
      revenue: data.targetRevenue,
      serviceCount: data.targetServiceCount,
      overheadBudget: data.overheadBudget,
    }),
  );

  const org = await repository.getSingleton('organization');
  if (!org) throw new Error('Gagal memuat organisasi yang baru dibuat');
  const employees = await repository.list('employees');
  const owner = employees.find((e) => e.role === 'owner') ?? employees[0];
  return { org, owner };
}

export function findOwnerId(employees: Employee[]): ID | null {
  return employees.find((e) => e.role === 'owner')?.id ?? null;
}
