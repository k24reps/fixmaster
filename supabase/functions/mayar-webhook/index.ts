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
// NOTE: Mayar's docs do not pin down the header name carrying the token,
// so we match MAYAR_WEBHOOK_TOKEN by VALUE across all incoming headers.
// We always reply 200 (so Mayar's "Test URL" ping and retries succeed) but
// only call apply_payment when the token matches AND the event is
// `payment.received` — the privileged action stays gated. If
// MAYAR_WEBHOOK_TOKEN is unset, the token check is skipped (test only).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // Health/connectivity checks (incl. Mayar's "Test URL") may use GET/HEAD.
  // Acknowledge any non-POST with 200 so the test passes; only POST carries
  // real event payloads.
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  let body: {
    event?: string;
    data?: { status?: boolean; extraData?: { invoiceId?: string }; id?: string };
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Verify authenticity by matching the configured token against ALL header
  // values (Mayar's header name is undocumented). Log header names — never
  // values — so we can confirm what Mayar actually sends.
  const expectedToken = Deno.env.get('MAYAR_WEBHOOK_TOKEN');
  let tokenOk = !expectedToken;
  if (expectedToken) {
    for (const value of req.headers.values()) {
      if (value.replace(/^Bearer\s+/i, '') === expectedToken) {
        tokenOk = true;
        break;
      }
    }
  }

  // Acknowledge everything with 200 (keeps Mayar's Test URL + retries happy),
  // but only a VERIFIED, completed payment triggers the plan extension.
  if (!tokenOk || body.event !== 'payment.received') {
    if (expectedToken && !tokenOk) {
      console.warn(
        'mayar-webhook: no header matched token; headers =',
        [...req.headers.keys()].join(', '),
      );
    }
    return new Response('ok', { status: 200 });
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
