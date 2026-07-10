import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, needsRehash, isValidPin } from './pin';

const EMP = 'emp-123';

/** Legacy v2 hash builder (single salted SHA-256) — mirrors the old format. */
async function legacyV2(pin: string, empId: string): Promise<string> {
  const data = new TextEncoder().encode(`fmpin:v2:${empId}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return 's2:' + hex;
}

describe('pin hashing', () => {
  it('round-trips a v3 hash and rejects the wrong PIN', async () => {
    const h = await hashPin('1234', EMP);
    expect(h.startsWith('s3:')).toBe(true);
    expect(await verifyPin('1234', EMP, h)).toBe(true);
    expect(await verifyPin('0000', EMP, h)).toBe(false);
  });

  it('salts randomly: same PIN → different hashes, both verify', async () => {
    const a = await hashPin('1234', EMP);
    const b = await hashPin('1234', EMP);
    expect(a).not.toBe(b);
    expect(await verifyPin('1234', EMP, a)).toBe(true);
    expect(await verifyPin('1234', EMP, b)).toBe(true);
  });

  it('binds the hash to the employee id', async () => {
    const h = await hashPin('1234', EMP);
    expect(await verifyPin('1234', 'other-emp', h)).toBe(false);
  });

  it('still verifies legacy v2 hashes (backward compat)', async () => {
    const legacy = await legacyV2('4321', EMP);
    expect(await verifyPin('4321', EMP, legacy)).toBe(true);
    expect(await verifyPin('9999', EMP, legacy)).toBe(false);
  });

  it('flags legacy hashes for rehash but not v3', async () => {
    expect(needsRehash(await legacyV2('4321', EMP))).toBe(true);
    expect(needsRehash(await hashPin('1234', EMP))).toBe(false);
  });

  it('rejects malformed/empty stored hashes', async () => {
    expect(await verifyPin('1234', EMP, '')).toBe(false);
    expect(await verifyPin('1234', EMP, 's3:bad')).toBe(false);
  });

  it('validates PIN format', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
});
