// ============================================================
// FixMaster — Edge Function: mayar-webhook
// Receives Mayar payment notifications and extends the subscription
// by calling apply_payment (idempotent). This endpoint is PUBLIC
// (Mayar calls it, not a logged-in user), so it is gated by a shared
// webhook token and only acts on the `payment.received` event.
//
// This endpoint is PUBLIC (Mayar calls it, not a logged-in user). Its
// public access is declared in supabase/config.toml (verify_jwt = false),
// so a plain `supabase functions deploy mayar-webhook` is enough.
//
// Env (set via `supabase secrets set`):
//   MAYAR_WEBHOOK_TOKEN  — the Webhook Token from the Mayar dashboard.
//                          Mayar sends it so we can verify authenticity.
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// NOTE: Mayar's docs do not pin down the exact header carrying the
// token, so we check the common candidates (Authorization bearer +
// x-callback-token / x-webhook-token). If MAYAR_WEBHOOK_TOKEN is set,
// a matching token is REQUIRED; unset = token check skipped (test only).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const expectedToken = Deno.env.get('MAYAR_WEBHOOK_TOKEN');
  if (expectedToken) {
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const candidates = [
      bearer,
      req.headers.get('x-callback-token') ?? '',
      req.headers.get('x-webhook-token') ?? '',
    ];
    if (!candidates.includes(expectedToken)) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  let body: {
    event?: string;
    data?: { status?: boolean; extraData?: { invoiceId?: string }; id?: string };
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Only a completed payment should extend the plan.
  if (body.event !== 'payment.received') {
    return new Response('ignored', { status: 200 });
  }

  const invoiceId = body.data?.extraData?.invoiceId;
  const providerRef = body.data?.id;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Resolve our invoice: prefer the correlation id we embedded, fall back
  // to the provider reference stored at creation time.
  let targetId = invoiceId ?? null;
  if (!targetId && providerRef) {
    const { data } = await admin
      .from('invoices')
      .select('id')
      .eq('provider_ref', providerRef)
      .maybeSingle();
    targetId = data?.id ?? null;
  }
  if (!targetId) {
    // Acknowledge so Mayar doesn't retry forever, but log for debugging.
    console.error('mayar-webhook: could not correlate payment', JSON.stringify(body));
    return new Response('no matching invoice', { status: 200 });
  }

  // Idempotent: a second notification for an already-paid invoice is a no-op.
  const { error } = await admin.rpc('apply_payment', { p_invoice_id: targetId });
  if (error) {
    console.error('mayar-webhook: apply_payment failed', error.message);
    return new Response('apply_payment failed', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
