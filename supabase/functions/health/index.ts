// ============================================================
// FixMaster — Edge Function: health
// Lightweight liveness/readiness probe for external uptime monitors
// (e.g. UptimeRobot, Better Stack). Returns 200 + JSON when the DB is
// reachable, 503 when it isn't.
//
// Public (no JWT) — declare in supabase/config.toml: verify_jwt = false.
// Deploy: supabase functions deploy health
//
// It runs a trivial, cheap query (count over a tiny table with LIMIT 1)
// to confirm Postgres connectivity without touching tenant data.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERSION = '1.0.0';

Deno.serve(async (req) => {
  // Only GET/HEAD make sense for a health probe.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 });
  }

  const startedAt = Date.now();
  let dbOk = false;
  let dbError: string | null = null;

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // Cheap connectivity check: head-count on organizations (no rows returned).
    const { error } = await admin
      .from('organizations')
      .select('id', { count: 'exact', head: true });
    dbOk = !error;
    dbError = error?.message ?? null;
  } catch (e) {
    dbOk = false;
    dbError = e instanceof Error ? e.message : String(e);
  }

  const body = {
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'up' : 'down',
    version: VERSION,
    time: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    ...(dbError ? { error: dbError } : {}),
  };

  return new Response(JSON.stringify(body), {
    status: dbOk ? 200 : 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
});
