/**
 * PIN hashing for employee sessions.
 * Salted SHA-256: format "s2:<hex>" where hash = SHA-256("fmpin:v2:" + empId + ":" + pin).
 * Per-employee salt (empId) defeats rainbow-table attacks on a data dump.
 * Async because it uses the Web Crypto SubtleCrypto API.
 */

const PREFIX = 's2:';

export async function hashPin(pin: string, empId: string): Promise<string> {
  const payload = `fmpin:v2:${empId}:${pin}`;
  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return PREFIX + hex;
}

export async function verifyPin(
  pin: string,
  empId: string,
  storedHash: string,
): Promise<boolean> {
  if (!storedHash?.startsWith(PREFIX)) return false;
  const computed = await hashPin(pin, empId);
  return constantTimeEqual(computed, storedHash);
}

/** Constant-time string comparison to avoid timing leaks. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Validate PIN format: exactly 4 digits. */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
