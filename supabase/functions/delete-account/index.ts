// ============================================================
// FixMaster — Edge Function: delete-account
// Permanently deletes the CALLER'S OWN business data AND auth credential.
// This requires the service_role key (RLS/admin), which must never ship
// to the client.
//
// Security model (defence against deleting someone else's account/data):
//   1. The caller proves identity with their own JWT (Authorization
//      header). getUser() validates it and yields THEIR user id.
//   2. We delete organizations where THIS user is an active OWNER (role
//      checked server-side — never trusted from the client), which
//      cascades to every business table. Then we delete ONLY this user's
//      auth id. A caller can therefore only ever erase their own shop
//      and their own credential.
//
// Why data is erased here (not the client): repository.clearAll() is a
// deliberate no-op in cloud mode (multi-tenant safety), so the client
// cannot wipe tenant data — it must happen server-side with the org
// cascade. Fail-closed: if the data delete fails we do NOT delete the
// credential, leaving the account intact for a retry.
//
// Public (verify_jwt = false in config.toml) because we verify the token
// INSIDE the function via getUser(); the platform gate can reject some
// valid session tokens, which would make the function unreachable.
//
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY
// Deploy: supabase functions deploy delete-account
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    // 1. Identify the caller from THEIR token. This is the only id we'll act
    //    on, so a user can never target another account.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      console.error('delete-account: getUser failed', userErr?.message);
      return json({ error: 'Unauthorized' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 2. Erase the tenant DATA the caller OWNS. Look up orgs where this user is
    //    an ACTIVE OWNER (verified server-side — never trust the client) and
    //    delete those organizations. Every business table FK-references
    //    organizations(id) ON DELETE CASCADE, so this wipes services, sales,
    //    customers, finance, wallets, memberships, invoices, etc. Non-owner
    //    accounts own no org → only their membership is removed in step 3's
    //    auth-user cascade.
    const { data: ownedOrgs, error: mErr } = await admin
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .eq('active', true);
    if (mErr) {
      console.error('delete-account: owner lookup failed', mErr.message);
      return json({ error: mErr.message }, 500);
    }
    const orgIds = [...new Set((ownedOrgs ?? []).map((m) => m.org_id))];
    if (orgIds.length > 0) {
      const { error: orgErr } = await admin.from('organizations').delete().in('id', orgIds);
      if (orgErr) {
        // Fail closed: data NOT erased → keep the credential so the user can
        // retry with the account still fully intact.
        console.error('delete-account: org delete failed', orgErr.message);
        return json({ error: orgErr.message }, 500);
      }
    }

    // 3. Delete the caller's own auth credential (email + password).
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('delete-account: deleteUser failed', delErr.message);
      return json({ error: delErr.message }, 500);
    }

    console.log('delete-account: account + data deleted', { userId: user.id, orgs: orgIds.length });
    return json({ ok: true });
  } catch (err) {
    console.error('delete-account: unhandled error', err instanceof Error ? err.stack : err);
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
