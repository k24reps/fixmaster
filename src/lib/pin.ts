/**
 * PIN hashing for employee sessions.
 *
 * A 4-digit PIN has only 10,000 possibilities, so a single unsalted/unstretched
 * hash is recovered in milliseconds from a leaked record. We stretch with
 * PBKDF2-HMAC-SHA256 and a random per-record salt:
 *   "s3:<iterations>:<saltHex>:<hashHex>"
 *
 * Legacy "s2:<hex>" hashes (single salted SHA-256) are still VERIFIABLE so
 * existing PINs keep working; callers should rehash to v3 on the next
 * successful login (see needsRehash). Async because it uses Web Crypto.
 */

const PREFIX_V2 = 's2:';
const PREFIX_V3 = 's3:';
// OWASP 2023 guidance for PBKDF2-HMAC-SHA256. Bump over time; the iteration
// count is stored per-hash so old hashes still verify after a raise.
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

export async function hashPin(pin: string, empId: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hashHex = await pbkdf2(pin, empId, salt, PBKDF2_ITERATIONS);
  return `${PREFIX_V3}${PBKDF2_ITERATIONS}:${toHex(salt)}:${hashHex}`;
}

export async function verifyPin(
  pin: string,
  empId: string,
  storedHash: string,
): Promise<boolean> {
  if (storedHash?.startsWith(PREFIX_V3)) {
    const [, iterStr, saltHex, hashHex] = storedHash.split(':');
    const iterations = Number(iterStr);
    if (!iterations || !saltHex || !hashHex) return false;
    const computed = await pbkdf2(pin, empId, fromHex(saltHex), iterations);
    return constantTimeEqual(computed, hashHex);
  }
  if (storedHash?.startsWith(PREFIX_V2)) {
    const computed = await legacyHashV2(pin, empId);
    return constantTimeEqual(computed, storedHash);
  }
  return false;
}

/** True when the stored hash is an older format that should be re-hashed to v3. */
export function needsRehash(storedHash: string): boolean {
  return !storedHash?.startsWith(PREFIX_V3);
}

/** Validate PIN format: exactly 4 digits. */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

// ---- internals ----

async function pbkdf2(
  pin: string,
  empId: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<string> {
  // empId is folded into the input too, so a hash can't be replayed against a
  // different employee even if the (random) salt were reused.
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`fmpin:v3:${empId}:${pin}`),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  );
  return toHex(new Uint8Array(bits));
}

/** Legacy v2: single salted SHA-256 of "fmpin:v2:<empId>:<pin>". */
async function legacyHashV2(pin: string, empId: string): Promise<string> {
  const data = new TextEncoder().encode(`fmpin:v2:${empId}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return PREFIX_V2 + toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
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
