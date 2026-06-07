// ============================================================
// FixMaster — Edge Function: create-invoice
// Server-side bridge to Fersaku. The Fersaku secret key MUST stay
// here (never in the browser). Flow:
//   1. Verify the caller (JWT via getUser) and reuse start_subscription
//      RPC to create a PENDING invoice row (RPC checks manager).
//   2. Create a Fersaku payment (POST /payments) carrying external_id =
//      our invoice id. Fersaku returns a checkout_url + provider id.
//   3. Store provider_ref (= Fersaku payment id) + checkout link on our
//      invoice row. The webhook correlates back via provider_ref because
//      Fersaku webhooks carry payment_id (not external_id).
//   4. Return the hosted checkout link for the client to open.
//
// Env (set via `supabase secrets set`):
//   FERSAKU_API_KEY   — Fersaku secret key. sk_test_* = sandbox,
//                       sk_live_* = production (the key's prefix selects
//                       the environment; the base URL is the same).
//   FERSAKU_API_BASE  — optional, default https://fersaku.com/api/v1
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js functions.invoke sends apikey + x-client-info in addition to
  // authorization/content-type. All must be allowed or the browser blocks the
  // POST after the OPTIONS preflight (symptom: OPTIONS 200 in logs, no POST,
  // client silently falls back to mock).
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('FERSAKU_API_KEY');
    const apiBase = Deno.env.get('FERSAKU_API_BASE') ?? 'https://fersaku.com/api/v1';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    console.log('create-invoice: start', { apiBase, hasApiKey: !!apiKey });

    if (!apiKey) return json({ error: 'FERSAKU_API_KEY belum diset' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    let payload: { plan?: string; amount?: number; redirectUrl?: string };
    try {
      payload = await req.json();
    } catch {
      return json({ error: 'Body JSON tidak valid' }, 400);
    }
    const { plan, amount, redirectUrl } = payload;
    console.log('create-invoice: payload', { plan, amount });
    if (!plan || typeof amount !== 'number') {
      return json({ error: 'plan dan amount wajib diisi' }, 400);
    }

    // Act as the caller so start_subscription's manager check applies.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      console.error('create-invoice: getUser failed', userErr?.message);
      return json({ error: 'Unauthorized' }, 401);
    }
    console.log('create-invoice: user ok', { userId: user.id });

    // 1. Create the pending invoice via the existing RPC (returns invoice id).
    const { data: invoiceId, error: rpcErr } = await userClient.rpc('start_subscription', {
      p_plan: plan,
      p_amount: amount,
    });
    if (rpcErr || !invoiceId) {
      console.error('create-invoice: start_subscription failed', rpcErr?.message);
      return json({ error: rpcErr?.message ?? 'Gagal membuat invoice' }, 400);
    }
    console.log('create-invoice: invoice created', { invoiceId });

    // Service-role client for trusted reads/writes after the auth gate.
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: invoice } = await admin
      .from('invoices')
      .select('id, org_id, plan')
      .eq('id', invoiceId)
      .single();
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', invoice?.org_id)
      .single();

    // 2. Create the Fersaku payment. external_id ties it to our invoice; the
    //    webhook only sends payment_id back, so we also persist provider_ref
    //    (= Fersaku id) below for correlation.
    const fersakuBody = {
      amount,
      customer_name: org?.name ?? 'FixMaster',
      customer_email: user.email,
      description: `Langganan FixMaster ${plan} (1 bulan)`,
      external_id: invoiceId,
      expired_minutes: 60 * 24, // 24h window to pay
      finish_url: redirectUrl ?? supabaseUrl,
    };

    console.log('create-invoice: calling Fersaku', `${apiBase}/payments`);
    const fersakuRes = await fetch(`${apiBase}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fersakuBody),
    });
    const fersakuText = await fersakuRes.text();
    console.log('create-invoice: Fersaku response', {
      status: fersakuRes.status,
      body: fersakuText.slice(0, 500),
    });
    let fersakuJson:
      | { id?: string; checkout_url?: string; qr_image_url?: string; error?: string }
      | null = null;
    try {
      fersakuJson = JSON.parse(fersakuText);
    } catch {
      fersakuJson = null;
    }
    if (!fersakuRes.ok || !fersakuJson?.checkout_url) {
      // Roll the invoice back to canceled so it doesn't linger as pending.
      await admin.from('invoices').update({ status: 'canceled' }).eq('id', invoiceId);
      return json(
        {
          error:
            fersakuJson?.error ??
            `Fersaku error (${fersakuRes.status}): ${fersakuText.slice(0, 300)}`,
        },
        502,
      );
    }

    // 3. Persist provider details. provider_ref = Fersaku payment id (the
    //    correlation key the webhook will send back).
    await admin
      .from('invoices')
      .update({
        provider: 'fersaku',
        provider_ref: fersakuJson.id ?? null,
        qris_url: fersakuJson.checkout_url,
      })
      .eq('id', invoiceId);

    // 4. Return the hosted checkout link.
    return json({ invoiceId, link: fersakuJson.checkout_url });
  } catch (err) {
    console.error('create-invoice: unhandled error', err instanceof Error ? err.stack : err);
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
