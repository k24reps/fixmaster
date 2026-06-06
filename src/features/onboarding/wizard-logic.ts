import type {
  Organization,
  Employee,
  Wallet,
  FixedCost,
  Role,
  ID,
} from '@/data/types';
import { repository } from '@/data';
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

export interface WizardData {
  shopName: string;
  address: string;
  phone: string;
  servicePrefix: string;
  wallets: WizardWalletDraft[];
  categories: string[];
  employees: WizardEmployeeDraft[];
  fixedCosts: WizardCostDraft[];
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
  return errors;
}

/**
 * Persist the wizard result: organization profile, employees (with hashed
 * PINs), wallets, fixed costs, and category/target config. Returns the
 * created org + the owner employee for auto-login.
 */
export async function commitWizard(
  data: WizardData,
): Promise<{ org: Organization; owner: Employee }> {
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

export function findOwnerId(employees: Employee[]): ID | null {
  return employees.find((e) => e.role === 'owner')?.id ?? null;
}
