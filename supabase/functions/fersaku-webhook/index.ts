// ============================================================
// FixMaster — Edge Function: fersaku-webhook
// Receives Fersaku payment notifications and extends the subscription
// by calling apply_payment (idempotent). This endpoint is PUBLIC
// (Fersaku calls it, not a logged-in user), so it is gated by an
// HMAC-style signature and only acts on the `payment.paid` event.
//
// Public access is declared in supabase/config.toml (verify_jwt = false),
// so a plain `supabase functions deploy fersaku-webhook` is enough.
//
// Env (set via `supabase secrets set`):
//   FERSAKU_WEBHOOK_SECRET — the webhook secret from the Fersaku dashboard.
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Signature (per Fersaku docs):
//   sha256_hex(payment_id + order_id + status + amount + secret)
// compared against the X-Webhook-Signature header (timing-safe).
//
// We acknowledge-then-verify: non-POST gets 200 (health/test pings); the
// privileged apply_payment only runs for a verified `payment.paid` event.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Hex SHA-256 of the given string (Web Crypto, available in Deno).
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string compare to avoid leaking the signature via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  // Health/connectivity checks may use GET/HEAD — acknowledge with 200.
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  let body: {
    event?: string;
    payment_id?: string;
    order_id?: string;
    status?: string;
    amount?: number;
    mode?: string;
  };
  let raw = '';
  try {
    raw = await req.text();
    body = JSON.parse(raw);
  } catch {
    body = {};
  }

  const secret = Deno.env.get('FERSAKU_WEBHOOK_SECRET');
  const signature = req.headers.get('X-Webhook-Signature') ?? '';

  // Verify the signature. If the secret is unset we skip (test only).
  let signatureOk = !secret;
  if (secret && body.payment_id != null) {
    const signString =
      String(body.payment_id) +
      String(body.order_id ?? '') +
      String(body.status ?? '') +
      String(body.amount ?? '') +
      secret;
    const expected = await sha256Hex(signString);
    signatureOk = timingSafeEqual(expected, signature);
  }

  // Acknowledge everything with 200 (keeps Fersaku's test ping + retries
  // happy), but only a VERIFIED, paid event triggers the plan extension.
  if (!signatureOk || body.event !== 'payment.paid') {
    if (secret && !signatureOk) {
      console.warn('fersaku-webhook: signature mismatch', {
        event: body.event,
        mode: body.mode,
        hasSig: !!signature,
      });
    }
    return new Response('ok', { status: 200 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Correlate to our invoice via provider_ref (= Fersaku payment id stored
  // at creation time). Fersaku webhooks do not echo external_id.
  const { data: invoice } = await admin
    .from('invoices')
    .select('id')
    .eq('provider_ref', body.payment_id)
    .maybeSingle();

  if (!invoice?.id) {
    console.error('fersaku-webhook: could not correlate payment', body.payment_id);
    return new Response('no matching invoice', { status: 200 });
  }

  // Idempotent: a second notification for an already-paid invoice is a no-op.
  const { error } = await admin.rpc('apply_payment', { p_invoice_id: invoice.id });
  if (error) {
    console.error('fersaku-webhook: apply_payment failed', error.message);
    return new Response('apply_payment failed', { status: 500 });
  }

  console.log('fersaku-webhook: payment applied', { invoiceId: invoice.id, mode: body.mode });
  return new Response('ok', { status: 200 });
});
