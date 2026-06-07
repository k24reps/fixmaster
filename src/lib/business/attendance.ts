/**
 * Pure attendance geofence logic. No DOM/repository dependencies →
 * unit-testable. The same distance check runs client-side (UX hint) and is
 * re-validated server-side in the clock_in RPC (the real security boundary).
 */
import type { Outlet } from '@/data/types';

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two lat/lng points in meters (Haversine).
 * Accurate enough for geofences of tens-to-hundreds of meters.
 */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** Whether an outlet has an active geofence configured. */
export function hasGeofence(outlet: Pick<Outlet, 'lat' | 'lng' | 'geofenceRadiusM'>): boolean {
  return (
    typeof outlet.lat === 'number' &&
    typeof outlet.lng === 'number' &&
    typeof outlet.geofenceRadiusM === 'number' &&
    outlet.geofenceRadiusM > 0
  );
}

export interface GeofenceCheck {
  /** True when clock-in is allowed at this position. */
  ok: boolean;
  /** Distance to the outlet in meters, or null when no geofence is set. */
  distanceM: number | null;
  reason?: string;
}

/**
 * Validate a clock-in position against an outlet's geofence.
 * - No geofence configured → always ok (legacy/unrestricted behavior).
 * - Geofence set → ok only when within radius.
 */
export function checkWithinGeofence(
  outlet: Pick<Outlet, 'lat' | 'lng' | 'geofenceRadiusM'>,
  pos: { lat: number; lng: number },
): GeofenceCheck {
  if (!hasGeofence(outlet)) return { ok: true, distanceM: null };
  const dist = distanceMeters(outlet.lat!, outlet.lng!, pos.lat, pos.lng);
  const radius = outlet.geofenceRadiusM!;
  if (dist <= radius) return { ok: true, distanceM: dist };
  return {
    ok: false,
    distanceM: dist,
    reason: `Di luar radius absensi (${Math.round(dist)}m dari ${radius}m)`,
  };
}
