// ============================================================
// FixMaster — Edge Function: duitku-webhook
// Receives Duitku payment callbacks and extends the subscription by
// calling apply_payment (idempotent). PUBLIC endpoint (Duitku calls it,
// not a logged-in user), gated by Duitku's MD5 signature; only a verified
// success (resultCode "00") unlocks the privileged apply_payment.
//
// Public access is declared in supabase/config.toml (verify_jwt = false),
// so a plain `supabase functions deploy duitku-webhook` is enough.
//
// Env (set via `supabase secrets set`):
//   DUITKU_MERCHANT_CODE, DUITKU_API_KEY (same secrets as create-invoice)
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Callback signature (Duitku v2):
//   md5(merchantCode + amount + merchantOrderId + apiKey)
// Duitku POSTs application/x-www-form-urlencoded. We acknowledge-then-verify:
// non-POST gets 200 (health/test pings); apply_payment only runs for a
// verified "00" (success) callback.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import md5 from 'https://esm.sh/js-md5@0.8.3';

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

  // Duitku sends application/x-www-form-urlencoded. Parse that first, then fall
  // back to JSON just in case.
  const fields: Record<string, string> = {};
  try {
    const raw = await req.text();
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      Object.assign(fields, JSON.parse(raw));
    } else {
      for (const [k, v] of new URLSearchParams(raw)) fields[k] = v;
    }
  } catch {
    /* leave fields empty → signature check fails below */
  }

  const merchantCode = Deno.env.get('DUITKU_MERCHANT_CODE');
  const apiKey = Deno.env.get('DUITKU_API_KEY');
  const { amount, merchantOrderId, resultCode, reference, signature } = fields;

  // Verify the signature. FAIL CLOSED: without configured secrets the request
  // is unverifiable, so it must NEVER unlock a privileged state change (the
  // webhook acts via service_role, which bypasses RLS).
  let signatureOk = false;
  if (!merchantCode || !apiKey) {
    console.error('duitku-webhook: secrets belum diset — menolak (fail-closed)');
  } else if (merchantOrderId && amount != null && signature) {
    const expected = md5(merchantCode + String(amount) + String(merchantOrderId) + apiKey);
    signatureOk = timingSafeEqual(expected, String(signature).toLowerCase());
  }

  // Acknowledge everything with 200 (keeps Duitku's test ping + retries happy).
  // Only a VERIFIED signature unlocks any state change.
  if (!signatureOk) {
    if (merchantCode && apiKey) {
      console.warn('duitku-webhook: signature mismatch', { merchantOrderId, hasSig: !!signature });
    }
    return new Response('ok', { status: 200 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Correlate to our invoice: merchantOrderId IS the invoice id (set at
  // creation). Fall back to provider_ref (= Duitku reference) if needed.
  let { data: invoice } = await admin
    .from('invoices')
    .select('id, status')
    .eq('id', merchantOrderId)
    .maybeSingle();
  if (!invoice?.id && reference) {
    ({ data: invoice } = await admin
      .from('invoices')
      .select('id, status')
      .eq('provider_ref', reference)
      .maybeSingle());
  }

  if (!invoice?.id) {
    console.error('duitku-webhook: could not correlate', { merchantOrderId, reference });
    return new Response('no matching invoice', { status: 200 });
  }

  // Duitku resultCode: "00" = success, "01" = failed/pending.
  if (resultCode === '00') {
    // Idempotent: a second notification for an already-paid invoice is a no-op.
    const { error } = await admin.rpc('apply_payment', { p_invoice_id: invoice.id });
    if (error) {
      console.error('duitku-webhook: apply_payment failed', error.message);
      return new Response('apply_payment failed', { status: 500 });
    }
    console.log('duitku-webhook: payment applied', { invoiceId: invoice.id });
    return new Response('ok', { status: 200 });
  }

  // Non-success: mark canceled, but ONLY if still pending — never override a
  // paid invoice (race-safe + idempotent).
  if (invoice.status === 'pending') {
    const { error } = await admin
      .from('invoices')
      .update({ status: 'canceled' })
      .eq('id', invoice.id)
      .eq('status', 'pending');
    if (error) {
      console.error('duitku-webhook: status update failed', error.message);
      return new Response('status update failed', { status: 500 });
    }
    console.log('duitku-webhook: invoice canceled', { invoiceId: invoice.id });
  }
  return new Response('ok', { status: 200 });
});
