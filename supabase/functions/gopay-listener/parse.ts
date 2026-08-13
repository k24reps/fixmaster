// ============================================================
// FixMaster — GoPay notification parsing (pure, no Deno APIs)
//
// Lives server-side ON PURPOSE: the notification wording is the most fragile
// part of this integration, and GoPay can change it in any app update. Keeping
// the parser here means a format change is fixed with a function redeploy —
// the Android listener stays a dumb forwarder that never needs reshipping.
//
// Unit-tested in parse.test.ts (vitest picks up supabase/functions/**).
// ============================================================

/**
 * Words that mark money COMING IN. Deliberately narrow: a false negative
 * costs one manual confirmation, a false positive credits a subscription
 * nobody paid for.
 */
const INCOMING = /\b(menerima|diterima|masuk)\b/i;

/**
 * Outgoing/refund wording that must never be treated as income, even if an
 * INCOMING word also appears somewhere in the text.
 */
const OUTGOING = /\b(mengirim|kirim|bayar ke|pembayaran ke|transfer ke|keluar|refund|dibatalkan)\b/i;

/** "Rp49.037" / "Rp 49.037,00" / "RP49037" */
const AMOUNT = /rp\s*([\d.,]+)/i;

/**
 * Extract the rupiah amount from a GoPay notification.
 * Returns null when the text is not an incoming-payment notification, or when
 * no plausible amount can be read — the caller treats null as "ignore".
 */
export function parseGopayAmount(text: string): number | null {
  if (!text) return null;
  if (OUTGOING.test(text)) return null;
  if (!INCOMING.test(text)) return null;

  const match = text.match(AMOUNT);
  if (!match) return null;

  // Indonesian formatting: "." groups thousands, "," precedes the (unused)
  // decimals. Drop a trailing decimal pair first, then all separators.
  const digits = match[1].replace(/,\d{1,2}$/, '').replace(/\D/g, '');
  if (!digits) return null;

  const amount = Number(digits);
  // Guard against a mangled parse producing an absurd number. Upper bound is
  // far above any plan price but well below what a glued-together string
  // would yield.
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000_000) return null;

  return amount;
}
