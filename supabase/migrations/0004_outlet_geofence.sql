-- ============================================================
-- FixMaster — Outlet attendance geofence (Fase 0E)
-- Adds optional location + radius to outlets so clock-in can be
-- validated server-side. Backward-compatible: NULL = no geofence
-- (clock-in allowed anywhere, legacy behavior).
-- ============================================================

alter table outlets add column if not exists lat               double precision;
alter table outlets add column if not exists lng               double precision;
alter table outlets add column if not exists geofence_radius_m  int;
alter table outlets add column if not exists require_selfie     boolean not null default false;

-- ------------------------------------------------------------
-- clock_in: record attendance with server-side geofence validation.
-- Distance computed via the haversine formula (meters). Rejects when
-- the outlet has a geofence and the device position is outside it.
-- Mirrors the pure client check in src/lib/business/attendance.ts.
-- ------------------------------------------------------------
create or replace function clock_in(
  p_org_id uuid,
  p_outlet_id uuid,
  p_employee_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_selfie_url text default null
) returns uuid
language plpgsql security definer as $$
declare
  v_outlet outlets%rowtype;
  v_dist double precision;
  v_att_id uuid;
  v_emp memberships%rowtype;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;

  select * into v_emp from memberships where id = p_employee_id and org_id = p_org_id;
  if not found then raise exception 'Employee not found'; end if;

  select * into v_outlet from outlets where id = p_outlet_id and org_id = p_org_id;
  if not found then raise exception 'Outlet not found'; end if;

  -- Geofence check (only when outlet has lat/lng + positive radius).
  if v_outlet.lat is not null and v_outlet.lng is not null
     and v_outlet.geofence_radius_m is not null and v_outlet.geofence_radius_m > 0 then
    if p_lat is null or p_lng is null then
      raise exception 'Lokasi wajib untuk absensi di outlet ini';
    end if;
    v_dist := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_outlet.lat) / 2), 2) +
      cos(radians(v_outlet.lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_outlet.lng) / 2), 2)
    ));
    if v_dist > v_outlet.geofence_radius_m then
      raise exception 'Di luar radius absensi (% m dari % m)',
        round(v_dist), v_outlet.geofence_radius_m;
    end if;
  end if;

  -- Selfie requirement.
  if v_outlet.require_selfie and (p_selfie_url is null or p_selfie_url = '') then
    raise exception 'Selfie wajib untuk absensi di outlet ini';
  end if;

  insert into attendance (org_id, outlet_id, employee_id, employee_name, date, status, check_in, note)
  values (p_org_id, p_outlet_id, p_employee_id, v_emp.name, current_date, 'hadir',
          to_char(now(), 'HH24:MI'),
          case when p_selfie_url is not null then 'selfie:' || p_selfie_url else '' end)
  returning id into v_att_id;

  return v_att_id;
end;
$$;
