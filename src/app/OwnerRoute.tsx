import { Navigate } from 'react-router-dom';
import { useSessionStore } from '@/stores/session';
import { isOwner } from '@/config/plans';

interface OwnerRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard for owner-only pages (reports, activity log). Defense-in-depth:
 * the sidebar already hides these for non-owners, but admin/karyawan could
 * still type the URL. The REAL protection is server RLS — this just avoids a
 * confusing empty page. Redirects non-owners to the dashboard.
 */
export function OwnerRoute({ children }: OwnerRouteProps) {
  const employee = useSessionStore((s) => s.currentEmployee);
  if (!employee || !isOwner(employee.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
