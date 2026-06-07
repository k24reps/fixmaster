import { describe, it, expect } from 'vitest';
import { emptyWizardData, validateStep } from './wizard-logic';

describe('validateStep', () => {
  it('step 1 requires a shop name', () => {
    const data = emptyWizardData();
    expect(validateStep(1, data)).toHaveLength(1);
    data.shopName = 'TechFix';
    expect(validateStep(1, data)).toHaveLength(0);
  });

  it('step 2 requires at least one named wallet', () => {
    const data = emptyWizardData();
    expect(validateStep(2, data)).toHaveLength(0); // default "Tunai" exists
    data.wallets = [{ name: '', balance: 0 }];
    expect(validateStep(2, data)).toHaveLength(1);
  });

  it('step 3 requires at least one category', () => {
    const data = emptyWizardData();
    expect(validateStep(3, data)).toHaveLength(0);
    data.categories = [];
    expect(validateStep(3, data)).toHaveLength(1);
  });

  it('step 4 requires an owner with a valid 4-digit PIN', () => {
    const data = emptyWizardData();
    // default owner has empty name + empty pin → 2 errors
    expect(validateStep(4, data).length).toBeGreaterThanOrEqual(2);
    data.employees = [{ name: 'Budi', role: 'owner', pin: '1234' }];
    expect(validateStep(4, data)).toHaveLength(0);
  });

  it('step 4 rejects non-4-digit PINs', () => {
    const data = emptyWizardData();
    data.employees = [{ name: 'Budi', role: 'owner', pin: '12' }];
    const errors = validateStep(4, data);
    expect(errors.some((e) => e.field === 'emp-pin-0')).toBe(true);
  });

  it('step 4 requires at least one owner role', () => {
    const data = emptyWizardData();
    data.employees = [{ name: 'Budi', role: 'karyawan', pin: '1234' }];
    const errors = validateStep(4, data);
    expect(errors.some((e) => e.field === 'employees')).toBe(true);
  });

  it('step 6 accepts the default single outlet (name inherited from shop)', () => {
    const data = emptyWizardData();
    // default has one outlet with blank name → valid (inherits shop name)
    expect(validateStep(6, data)).toHaveLength(0);
  });

  it('step 6 requires named additional outlets', () => {
    const data = emptyWizardData();
    data.outlets = [
      { name: '', address: '' },
      { name: '', address: '' }, // second branch must be named
    ];
    const errors = validateStep(6, data);
    expect(errors.some((e) => e.field === 'outlet-name-1')).toBe(true);
  });

  it('step 6 requires at least one outlet', () => {
    const data = emptyWizardData();
    data.outlets = [];
    expect(validateStep(6, data).some((e) => e.field === 'outlets')).toBe(true);
  });
});
