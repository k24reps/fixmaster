import { useEffect, useMemo } from 'react';
import { useRouteError } from 'react-router-dom';
import { ErrorFallback } from '@/components/ErrorBoundary';
import { reportError } from '@/lib/report';

/**
 * `errorElement` untuk seluruh rute.
 *
 * React Router menangkap galat di dalam pohon rutenya SENDIRI — galat itu tidak
 * pernah sampai ke ErrorBoundary React di App. Tanpa errorElement, router
 * memakai layar bawaannya yang menampilkan "Unexpected Application Error!",
 * jejak galat mentah, dan sapaan "Hey developer" lengkap dengan saran memasang
 * errorElement. Itu benar-benar tampil ke pengguna di produksi.
 *
 * Varian `root` dipakai karena di sini tidak ada boundary yang bisa di-reset:
 * satu-satunya pemulihan yang jujur adalah memuat ulang aplikasi.
 */
export function RouteError() {
  const raw = useRouteError();
  // useMemo supaya galat non-Error tidak dibungkus ulang tiap render, yang
  // akan membuat effect pelaporan menyala berulang.
  const error = useMemo(() => (raw instanceof Error ? raw : new Error(String(raw))), [raw]);

  useEffect(() => {
    reportError(error, { source: 'router' });
  }, [error]);

  return <ErrorFallback error={error} root />;
}
