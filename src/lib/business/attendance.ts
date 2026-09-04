/**
 * Logika absensi murni — tanpa DOM, tanpa repository, jadi bisa diuji unit.
 *
 * Cek jarak yang sama berjalan di klien (sekadar petunjuk UX) dan diulang di
 * server oleh RPC `clock_in`/`clock_out`. Yang perlu diingat: geofence hanya
 * menjaga DETIK penulisan. Yang menjaga sisanya adalah trigger
 * `attendance_enforce` (migrasi 0053) — ia menghitung ulang `total_hours` dan
 * melarang karyawan menulis ulang jamnya sendiri lewat REST. Tanpa trigger
 * itu, geofence hanya menentukan di mana baris LAHIR, bukan apa isinya.
 */
import type { Attendance, AttendanceStatus, Outlet } from '@/data/types';

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

/** Label Indonesia untuk tiap status — satu sumber, dipakai modal dan tabel. */
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpha: 'Alpha',
};

/**
 * Apakah baris ini mewakili hari kerja yang benar-benar dijalani.
 *
 * Bukan sekadar "punya jam masuk": baris izin/sakit/alpha bisa saja punya
 * jam yang terlanjur terisi sebelum statusnya dikoreksi, dan menghitungnya
 * sebagai hari hadir membuat rekap bulanan berbohong ke arah yang
 * menguntungkan karyawan.
 */
export function isWorkedDay(
  r: Pick<Attendance, 'status' | 'checkIn'>,
): boolean {
  return r.status === 'hadir' && !!r.checkIn;
}

/**
 * Jam kerja di atas ambang ini hampir pasti salah ketik — biasanya jam masuk
 * dan keluar tertukar, yang oleh calcHours() dibaca sebagai shift semalaman.
 * Dipakai untuk memperingatkan, bukan menolak: shift malam itu nyata.
 */
export const IMPLAUSIBLE_HOURS = 16;

export interface EmployeeMonthHours {
  employeeId: string;
  employeeName: string;
  /** Hari kerja betulan: berstatus `hadir` dan punya jam masuk. */
  days: number;
  /** Hari tidak masuk, dipecah per alasan — tiga angka ini yang dipakai
   *  pemilik untuk menghitung potongan, dan dulu tidak ada sama sekali. */
  izin: number;
  sakit: number;
  alpha: number;
  totalHours: number;
}

/**
 * Rekap satu bulan ("YYYY-MM") per karyawan, jam terbanyak dulu.
 * Menjumlahkan `totalHours` yang tersimpan, jadi shift yang belum di-checkout
 * terhitung sebagai hari hadir dengan nol jam — persis seperti di tabel.
 * ponytail: karyawan tanpa baris bulan itu tidak muncul di hasil.
 */
export function monthlyHoursByEmployee(
  rows: Pick<Attendance, 'employeeId' | 'employeeName' | 'date' | 'status' | 'checkIn' | 'totalHours'>[],
  month: string,
): EmployeeMonthHours[] {
  const acc = new Map<string, EmployeeMonthHours>();
  for (const r of rows) {
    if (!r.date?.startsWith(month)) continue;
    const cur = acc.get(r.employeeId) ?? {
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      days: 0,
      izin: 0,
      sakit: 0,
      alpha: 0,
      totalHours: 0,
    };
    cur.employeeName = r.employeeName; // baris terbaru menang saat ganti nama
    if (isWorkedDay(r)) {
      cur.days += 1;
      cur.totalHours += r.totalHours || 0;
    } else if (r.status === 'izin') cur.izin += 1;
    else if (r.status === 'sakit') cur.sakit += 1;
    else if (r.status === 'alpha') cur.alpha += 1;
    acc.set(r.employeeId, cur);
  }
  return [...acc.values()]
    .map((e) => ({ ...e, totalHours: Math.round(e.totalHours * 100) / 100 }))
    .sort((a, b) => b.totalHours - a.totalHours || a.employeeName.localeCompare(b.employeeName));
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
