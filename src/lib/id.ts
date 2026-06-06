/**
 * Pure ID + document-number utilities.
 * No DOM/state dependencies → unit-testable.
 */

/** Generate a UUID (browser crypto, falls back to a v4-ish polyfill). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Next sequential document number given existing numbers sharing a prefix.
 * e.g. prefix "FM", existing ["FM-0007","FM-0003"] → "FM-0008".
 * Width defaults to 4 (zero-padded).
 */
export function nextDocNumber(prefix: string, existing: string[], width = 4): string {
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
  let max = 0;
  for (const code of existing) {
    const m = re.exec(code ?? '');
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

/** Derive an uppercase initials prefix from a shop name, e.g. "Tech Fix Center" → "TFC". */
export function derivePrefix(name: string, maxLen = 3): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'FM';
  const initials = words.map((w) => w[0]?.toUpperCase() ?? '').join('');
  return initials.slice(0, maxLen) || 'FM';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
