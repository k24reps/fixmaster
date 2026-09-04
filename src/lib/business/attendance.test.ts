import { describe, it, expect } from 'vitest';
import {
  distanceMeters,
  hasGeofence,
  checkWithinGeofence,
  monthlyHoursByEmployee,
  isWorkedDay,
} from './attendance';
import type { Outlet } from '@/data/types';

// Two reference points in Jakarta ~1.5km apart (Monas ↔ Istiqlal area).
const MONAS = { lat: -6.1754, lng: 106.8272 };
const NEARBY = { lat: -6.1758, lng: 106.8276 }; // ~60m away
const FAR = { lat: -6.2, lng: 106.85 }; // a few km away

const mkOutlet = (over: Partial<Outlet>): Pick<Outlet, 'lat' | 'lng' | 'geofenceRadiusM'> => ({
  lat: over.lat,
  lng: over.lng,
  geofenceRadiusM: over.geofenceRadiusM,
});

describe('distanceMeters', () => {
  it('is ~0 for identical points', () => {
    expect(distanceMeters(MONAS.lat, MONAS.lng, MONAS.lat, MONAS.lng)).toBeCloseTo(0, 5);
  });

  it('computes a small distance for nearby points', () => {
    const d = distanceMeters(MONAS.lat, MONAS.lng, NEARBY.lat, NEARBY.lng);
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(120);
  });

  it('computes kilometers for far points', () => {
    const d = distanceMeters(MONAS.lat, MONAS.lng, FAR.lat, FAR.lng);
    expect(d).toBeGreaterThan(2000);
  });

  it('is symmetric', () => {
    const a = distanceMeters(MONAS.lat, MONAS.lng, FAR.lat, FAR.lng);
    const b = distanceMeters(FAR.lat, FAR.lng, MONAS.lat, MONAS.lng);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('hasGeofence', () => {
  it('false when coordinates unset', () => {
    expect(hasGeofence(mkOutlet({}))).toBe(false);
    expect(hasGeofence(mkOutlet({ lat: -6.1, lng: 106.8 }))).toBe(false); // no radius
  });

  it('false when radius is zero or negative', () => {
    expect(hasGeofence(mkOutlet({ lat: -6.1, lng: 106.8, geofenceRadiusM: 0 }))).toBe(false);
  });

  it('true when fully configured', () => {
    expect(hasGeofence(mkOutlet({ lat: -6.1, lng: 106.8, geofenceRadiusM: 100 }))).toBe(true);
  });
});

describe('isWorkedDay', () => {
  it('counts only a `hadir` row that has a check-in', () => {
    expect(isWorkedDay({ status: 'hadir', checkIn: '08:00' })).toBe(true);
    expect(isWorkedDay({ status: 'hadir', checkIn: null })).toBe(false);
  });

  it('rejects izin/sakit/alpha even when a time is left over', () => {
    // Ini kasus nyatanya: baris sudah punya jam masuk dari check-in pagi, lalu
    // manager mengoreksi statusnya jadi izin. Jamnya tidak ikut terhapus.
    expect(isWorkedDay({ status: 'izin', checkIn: '08:00' })).toBe(false);
    expect(isWorkedDay({ status: 'sakit', checkIn: '08:00' })).toBe(false);
    expect(isWorkedDay({ status: 'alpha', checkIn: '08:00' })).toBe(false);
  });
});

describe('monthlyHoursByEmployee', () => {
  const rows: Parameters<typeof monthlyHoursByEmployee>[0] = [
    { employeeId: 'e1', employeeName: 'Budi', date: '2026-08-01', status: 'hadir', checkIn: '08:00', totalHours: 8 },
    { employeeId: 'e1', employeeName: 'Budi', date: '2026-08-02', status: 'hadir', checkIn: '08:00', totalHours: 7.5 },
    { employeeId: 'e1', employeeName: 'Budi', date: '2026-08-03', status: 'hadir', checkIn: '08:00', totalHours: 0 }, // shift terbuka
    { employeeId: 'e2', employeeName: 'Ani', date: '2026-08-01', status: 'hadir', checkIn: '09:00', totalHours: 6 },
    { employeeId: 'e2', employeeName: 'Ani', date: '2026-07-31', status: 'hadir', checkIn: '09:00', totalHours: 9 }, // bulan lain
    { employeeId: 'e3', employeeName: 'Cici', date: '2026-08-04', status: 'izin', checkIn: null, totalHours: 0 },
  ];

  it('sums hours per employee within the month only', () => {
    const res = monthlyHoursByEmployee(rows, '2026-08');
    expect(res.map((r) => [r.employeeName, r.totalHours, r.days])).toEqual([
      ['Budi', 15.5, 3],
      ['Ani', 6, 1],
      ['Cici', 0, 0],
    ]);
  });

  it('counts absences separately instead of folding them into work days', () => {
    const res = monthlyHoursByEmployee(rows, '2026-08');
    const cici = res.find((r) => r.employeeName === 'Cici')!;
    expect([cici.days, cici.izin, cici.sakit, cici.alpha]).toEqual([0, 1, 0, 0]);
  });

  it('does NOT count a leave day as present even when its times survived', () => {
    // Bug yang diperbaiki: rekap dulu memakai `if (r.checkIn)` saja, jadi baris
    // izin dengan jam sisa terhitung sebagai hari hadir — dan jamnya ikut
    // dijumlahkan. Angka rekapnya condong ke arah yang menguntungkan karyawan.
    const res = monthlyHoursByEmployee(
      [
        { employeeId: 'e9', employeeName: 'Dedi', date: '2026-08-05', status: 'izin', checkIn: '08:00', totalHours: 8 },
      ],
      '2026-08',
    );
    expect([res[0].days, res[0].totalHours, res[0].izin]).toEqual([0, 0, 1]);
  });

  it('returns nothing for a month with no rows', () => {
    expect(monthlyHoursByEmployee(rows, '2026-01')).toEqual([]);
  });
});

describe('checkWithinGeofence', () => {
  it('allows clock-in when no geofence is configured (legacy)', () => {
    const res = checkWithinGeofence(mkOutlet({}), FAR);
    expect(res.ok).toBe(true);
    expect(res.distanceM).toBeNull();
  });

  it('allows clock-in inside the radius', () => {
    const outlet = mkOutlet({ ...MONAS, geofenceRadiusM: 150 });
    const res = checkWithinGeofence(outlet, NEARBY);
    expect(res.ok).toBe(true);
    expect(res.distanceM).toBeGreaterThan(0);
  });

  it('rejects clock-in outside the radius with a reason', () => {
    const outlet = mkOutlet({ ...MONAS, geofenceRadiusM: 100 });
    const res = checkWithinGeofence(outlet, FAR);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/luar radius/i);
    expect(res.distanceM).toBeGreaterThan(100);
  });

  it('treats the boundary as inclusive', () => {
    // Use a generous radius that clearly contains the nearby point.
    const outlet = mkOutlet({ ...MONAS, geofenceRadiusM: 500 });
    expect(checkWithinGeofence(outlet, NEARBY).ok).toBe(true);
  });
});
