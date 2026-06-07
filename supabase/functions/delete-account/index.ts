// ============================================================
// FixMaster — Edge Function: delete-account
// Permanently deletes the CALLER'S OWN auth credential (the
// auth.users record: email + password). This is the one action the
// browser cannot do itself — it requires the service_role key, which
// must never ship to the client.
//
// Security model (defence against deleting someone else's account):
//   1. The caller proves identity with their own JWT (Authorization
//      header). getUser() validates it and yields THEIR user id.
//   2. We delete ONLY that id with the service-role admin client. The
//      client never names a target id, so a user can only ever delete
//      themselves.
//
// Tenant DATA is erased separately by the client (repository.clearAll)
// BEFORE calling this — see SettingsPage. This function is intentionally
// scoped to the credential only (single responsibility).
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

    // 2. Delete that user with the privileged admin client.
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('delete-account: deleteUser failed', delErr.message);
      return json({ error: delErr.message }, 500);
    }

    console.log('delete-account: credential deleted', { userId: user.id });
    return json({ ok: true });
  } catch (err) {
    console.error('delete-account: unhandled error', err instanceof Error ? err.stack : err);
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
