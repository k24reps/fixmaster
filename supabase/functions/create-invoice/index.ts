// ============================================================
// FixMaster — Edge Function: create-invoice
// Server-side bridge to Duitku (v2 / MD5). The Duitku API key MUST stay
// here (never in the browser). Flow:
//   1. Verify the caller (JWT via getUser) and reuse start_subscription
//      RPC to create a PENDING invoice row (RPC checks manager).
//   2. Create a Duitku transaction (POST /inquiry) carrying merchantOrderId
//      = our invoice id. Duitku returns a paymentUrl + reference.
//   3. Store provider_ref (= Duitku reference) + checkout link on our invoice.
//   4. Return the hosted paymentUrl for the client to open.
//
// Env (set via `supabase secrets set`):
//   DUITKU_MERCHANT_CODE — sandbox/prod merchant code (e.g. DSxxxx).
//   DUITKU_API_KEY       — merchant API key (the "merchantKey" in the docs).
//   DUITKU_API_BASE      — optional. Default SANDBOX
//                          https://sandbox.duitku.com/webapi/api/merchant/v2
//                          Production: https://passport.duitku.com/webapi/api/merchant/v2
//                          (the BASE URL selects the environment, not the key.)
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY
//
// Signature (Duitku v2 inquiry):
//   md5(merchantCode + merchantOrderId + paymentAmount + apiKey)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import md5 from 'https://esm.sh/js-md5@0.8.3';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js functions.invoke sends apikey + x-client-info in addition to
  // authorization/content-type. All must be allowed or the browser blocks the
  // POST after the OPTIONS preflight.
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
    const merchantCode = Deno.env.get('DUITKU_MERCHANT_CODE');
    const apiKey = Deno.env.get('DUITKU_API_KEY');
    const apiBase =
      Deno.env.get('DUITKU_API_BASE') ?? 'https://sandbox.duitku.com/webapi/api/merchant/v2';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    console.log('create-invoice: start', { apiBase, hasMerchant: !!merchantCode, hasKey: !!apiKey });

    if (!merchantCode || !apiKey) {
      return json({ error: 'DUITKU_MERCHANT_CODE / DUITKU_API_KEY belum diset' }, 500);
    }

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

    // 2. Create the Duitku transaction. merchantOrderId = our invoice id so the
    //    callback correlates back directly (it echoes merchantOrderId).
    const paymentAmount = Math.round(amount);
    const merchantOrderId = String(invoiceId);
    const signature = md5(merchantCode + merchantOrderId + String(paymentAmount) + apiKey);
    // customerVaName: alphanumeric/space, kept short (Duitku VA name limit).
    const vaName = (org?.name ?? 'FixMaster').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20) || 'FixMaster';

    const duitkuBody = {
      merchantCode,
      paymentAmount,
      merchantOrderId,
      productDetails: `Langganan FixMaster ${plan} (1 bulan)`,
      email: user.email,
      customerVaName: vaName,
      callbackUrl: `${supabaseUrl}/functions/v1/duitku-webhook`,
      returnUrl: redirectUrl ?? supabaseUrl,
      signature,
      expiryPeriod: 30, // minutes
    };

    console.log('create-invoice: calling Duitku', `${apiBase}/inquiry`);
    const duitkuRes = await fetch(`${apiBase}/inquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duitkuBody),
    });
    const duitkuText = await duitkuRes.text();
    console.log('create-invoice: Duitku response', {
      status: duitkuRes.status,
      body: duitkuText.slice(0, 500),
    });
    let duitkuJson:
      | { statusCode?: string; statusMessage?: string; reference?: string; paymentUrl?: string }
      | null = null;
    try {
      duitkuJson = JSON.parse(duitkuText);
    } catch {
      duitkuJson = null;
    }
    // Duitku signals success with statusCode "00" AND a paymentUrl.
    if (!duitkuRes.ok || duitkuJson?.statusCode !== '00' || !duitkuJson?.paymentUrl) {
      // Roll the invoice back to canceled so it doesn't linger as pending.
      await admin.from('invoices').update({ status: 'canceled' }).eq('id', invoiceId);
      return json(
        {
          error:
            duitkuJson?.statusMessage ??
            `Duitku error (${duitkuRes.status}): ${duitkuText.slice(0, 300)}`,
        },
        502,
      );
    }

    // 3. Persist provider details. provider_ref = Duitku reference.
    await admin
      .from('invoices')
      .update({
        provider: 'duitku',
        provider_ref: duitkuJson.reference ?? null,
        qris_url: duitkuJson.paymentUrl,
      })
      .eq('id', invoiceId);

    // 4. Return the hosted payment page link.
    return json({ invoiceId, link: duitkuJson.paymentUrl });
  } catch (err) {
    console.error('create-invoice: unhandled error', err instanceof Error ? err.stack : err);
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
