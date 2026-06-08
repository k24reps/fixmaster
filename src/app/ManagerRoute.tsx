import { Navigate } from 'react-router-dom';
import { useSessionStore } from '@/stores/session';
import { isManager } from '@/config/plans';

interface ManagerRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard for manager-only pages (finance, reports). Defense-in-depth:
 * the sidebar already hides these for karyawan, but a staff member could still
 * type the URL. The REAL protection is server RLS (migration 0016) — this just
 * avoids a confusing empty page. Redirects non-managers to the dashboard.
 */
export function ManagerRoute({ children }: ManagerRouteProps) {
  const employee = useSessionStore((s) => s.currentEmployee);
  if (!employee || !isManager(employee.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
