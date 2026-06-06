// ============================================================
// FixMaster — Edge Function: create-invoice
// Server-side bridge to Mayar. The Mayar API key MUST stay here
// (never in the browser). Flow:
//   1. Verify the caller (JWT) and reuse start_subscription RPC to
//      create a PENDING invoice row (RPC already checks manager).
//   2. Create a Mayar invoice carrying extraData.invoiceId so the
//      webhook can correlate the payment back to our row.
//   3. Store provider_ref + payment link on our invoice row.
//   4. Return the hosted payment link for the client to open.
//
// Env (set via `supabase secrets set`):
//   MAYAR_API_KEY        — Mayar API key (Read & Write)
//   MAYAR_API_BASE       — optional, default https://api.mayar.id/hl/v1
//                          (use https://api.mayar.club/hl/v1 for sandbox)
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
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

  const apiKey = Deno.env.get('MAYAR_API_KEY');
  const apiBase = Deno.env.get('MAYAR_API_BASE') ?? 'https://api.mayar.id/hl/v1';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!apiKey) return json({ error: 'MAYAR_API_KEY belum diset' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  let payload: { plan?: string; amount?: number; redirectUrl?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body JSON tidak valid' }, 400);
  }
  const { plan, amount, redirectUrl } = payload;
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
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

  // 1. Create the pending invoice via the existing RPC (returns invoice id).
  const { data: invoiceId, error: rpcErr } = await userClient.rpc('start_subscription', {
    p_plan: plan,
    p_amount: amount,
  });
  if (rpcErr || !invoiceId) {
    return json({ error: rpcErr?.message ?? 'Gagal membuat invoice' }, 400);
  }

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

  // 2. Create the Mayar invoice. extraData.invoiceId is our correlation key.
  const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const mayarBody = {
    name: org?.name ?? 'FixMaster',
    email: user.email,
    mobile: '08000000000', // Mayar requires a value; real number not needed for QRIS
    redirectUrl: redirectUrl ?? supabaseUrl,
    description: `Langganan FixMaster ${plan}`,
    expiredAt,
    items: [{ quantity: 1, rate: amount, description: `Langganan ${plan} (1 bulan)` }],
    extraData: { invoiceId, orgId: invoice?.org_id },
  };

  const mayarRes = await fetch(`${apiBase}/invoice/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mayarBody),
  });
  const mayarJson = await mayarRes.json().catch(() => null);
  if (!mayarRes.ok || !mayarJson?.data?.link) {
    // Roll the invoice back to canceled so it doesn't linger as pending.
    await admin.from('invoices').update({ status: 'canceled' }).eq('id', invoiceId);
    return json(
      { error: mayarJson?.messages ?? `Mayar error (${mayarRes.status})` },
      502,
    );
  }

  // 3. Persist provider details.
  await admin
    .from('invoices')
    .update({
      provider: 'mayar',
      provider_ref: mayarJson.data.id ?? mayarJson.data.transactionId ?? null,
      qris_url: mayarJson.data.link,
    })
    .eq('id', invoiceId);

  // 4. Return the payment link.
  return json({ invoiceId, link: mayarJson.data.link });
});
