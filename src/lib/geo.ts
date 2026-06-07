/**
 * Thin promise wrapper around the browser Geolocation API. Kept separate from
 * the pure geofence math (lib/business/attendance.ts) because it touches a
 * browser-only API. Returns a rejected promise with a human-readable Indonesian
 * message when permission is denied or the position is unavailable.
 */
export interface DevicePosition {
  lat: number;
  lng: number;
  accuracyM: number;
}

export function getCurrentPosition(): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Perangkat tidak mendukung lokasi (GPS)'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Izin lokasi ditolak. Aktifkan GPS untuk absensi.'
            : 'Gagal mengambil lokasi. Coba lagi.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}
