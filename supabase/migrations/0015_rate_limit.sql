-- ============================================================
-- FixMaster — Server-side rate limiting
-- A generic sliding-window limiter, applied first to the one truly
-- public, unauthenticated surface: the `track_service` RPC. Protects
-- the DB from being hammered by automated lookups.
--
-- The payment webhook is already protected by HMAC signature verification
-- (see supabase/functions/fersaku-webhook), and create-invoice requires a
-- JWT — so this focuses where it matters most.
-- ============================================================

-- Event log keyed by an arbitrary bucket string. Self-cleaning (the RPC
-- deletes expired rows per key on each call) so it stays bounded.
create table if not exists rate_events (
  id          bigserial primary key,
  bucket_key  text        not null,
  created_at  timestamptz not null default now()
);
create index if not exists rate_events_key_time on rate_events (bucket_key, created_at);

-- Lock the table down: no client may read/write it directly. Only the
-- security-definer RPC below touches it.
alter table rate_events enable row level security;

-- ------------------------------------------------------------
-- check_rate_limit: sliding-window counter.
--   Returns TRUE if the action is allowed (and records it),
--   FALSE if the caller has hit `p_max` within `p_window_seconds`.
-- ------------------------------------------------------------
create or replace function check_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql security definer as $$
declare
  v_count int;
begin
  -- Drop expired events for this key (keeps the table bounded).
  delete from rate_events
   where bucket_key = p_key
     and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count from rate_events where bucket_key = p_key;

  if v_count >= p_max then
    return false; -- limit reached → block
  end if;

  insert into rate_events (bucket_key) values (p_key);
  return true; -- allowed
end;
$$;

grant execute on function check_rate_limit(text, int, int) to anon, authenticated;

-- ------------------------------------------------------------
-- track_service (PUBLIC) — re-defined to apply a coarse per-org throttle
-- before doing the lookup. Same return shape as 0003; now plpgsql so it
-- can branch. Limit is generous (60/min per org) so real customers never
-- hit it, while automated enumeration is throttled.
--
-- Tradeoff (documented honestly): this is per-ORG, not per-IP. Per-IP
-- limiting would need an edge proxy (the client IP isn't reliably available
-- inside Postgres). Org-level is a pragmatic DB-side safeguard.
-- ------------------------------------------------------------
create or replace function track_service(p_org_id uuid, p_service_no text)
returns table (
  service_no text,
  device text,
  category text,
  status service_status,
  org_name text,
  public_history jsonb
)
language plpgsql security definer as $$
begin
  if not check_rate_limit('track:' || p_org_id::text, 60, 60) then
    return; -- over the limit → return no rows (graceful, no error leak)
  end if;

  return query
  select
    s.service_no,
    s.device,
    s.category,
    s.status,
    o.name as org_name,
    coalesce(
      (select jsonb_agg(h) from jsonb_array_elements(s.history) h
       where coalesce((h->>'internal')::boolean, false) = false),
      '[]'::jsonb
    ) as public_history
  from services s
  join organizations o on o.id = s.org_id
  where s.org_id = p_org_id
    and lower(s.service_no) = lower(p_service_no)
  limit 1;
end;
$$;

grant execute on function track_service(uuid, text) to anon, authenticated;
