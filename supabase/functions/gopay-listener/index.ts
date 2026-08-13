// ============================================================
// FixMaster — Edge Function: gopay-listener
// Receives forwarded GoPay notifications from the paired Android device and
// extends the subscription by calling claim_gopay_payment → apply_payment
// (idempotent). PUBLIC endpoint (the device has no Supabase session), gated
// by a shared secret in the X-Listener-Secret header.
//
// Public access is declared in supabase/config.toml (verify_jwt = false),
// so a plain `supabase functions deploy gopay-listener` is enough.
//
// Env (set via `supabase secrets set`):
//   GOPAY_LISTENER_SECRET — long random string, also stored on the device.
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// WHY REAL ERROR CODES: the retired gateway webhooks acknowledged everything
// with 200 to keep provider retries happy. Here the caller is our OWN device,
// so failures are reported honestly — a silent 200 on a misconfigured device
// would hide a payment pipeline that is quietly dead.
//
// KNOWN CEILING (accepted when choosing a listener over a licensed gateway):
// notifications are fire-and-forget. If this function is down when a payment
// lands, nothing retries it and that invoice stays pending until confirmed by
// hand. See docs/gopay-listener-android.md.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseGopayAmount } from './parse.ts';

// A forwarded notification older than this is refused, so a captured request
// cannot be replayed later against a future invoice that happens to reuse the
// amount. The device posts immediately; this is pure slack for retries.
const MAX_AGE_MS = 15 * 60 * 1000;

// Constant-time compare so the secret cannot be recovered via response timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  // Health/connectivity checks from the device use GET.
  if (req.method !== 'POST') return json({ ok: true }, 200);

  // FAIL CLOSED: without a configured secret the request is unverifiable, and
  // this function acts via service_role (bypasses RLS). Never let it through.
  const secret = Deno.env.get('GOPAY_LISTENER_SECRET');
  if (!secret) {
    console.error('gopay-listener: GOPAY_LISTENER_SECRET belum diset — menolak (fail-closed)');
    return json({ error: 'not configured' }, 503);
  }
  if (!timingSafeEqual(secret, req.headers.get('X-Listener-Secret') ?? '')) {
    console.warn('gopay-listener: secret mismatch');
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { text?: string; postedAt?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  // Replay guard. Missing postedAt is treated as stale rather than trusted.
  const age = Date.now() - Number(body.postedAt ?? 0);
  if (!Number.isFinite(age) || age > MAX_AGE_MS || age < -MAX_AGE_MS) {
    console.warn('gopay-listener: stale or undated notification', { postedAt: body.postedAt });
    return json({ error: 'stale notification' }, 400);
  }

  const amount = parseGopayAmount(body.text ?? '');
  if (amount === null) {
    // Not an incoming-payment notification (promo, chat, outgoing transfer).
    return json({ matched: false, reason: 'not an incoming payment' }, 200);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Match + apply happen inside one RPC so two concurrent notifications for
  // the same amount cannot both claim the invoice.
  const { data: invoiceId, error } = await admin.rpc('claim_gopay_payment', {
    p_amount: amount,
  });
  if (error) {
    console.error('gopay-listener: claim_gopay_payment failed', error.message);
    return json({ error: 'claim failed' }, 500);
  }

  if (!invoiceId) {
    // Real money arrived that no open invoice expects — someone paid the wrong
    // amount, or it is unrelated income. Needs a human, so log it loudly.
    console.warn('gopay-listener: incoming payment with no matching invoice', { amount });
    return json({ matched: false, amount }, 200);
  }

  console.log('gopay-listener: payment applied', { invoiceId, amount });
  return json({ matched: true, invoiceId, amount }, 200);
});
