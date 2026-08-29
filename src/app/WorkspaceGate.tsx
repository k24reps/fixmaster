import { useEffect } from 'react';
import { repository } from '@/data';
import { PinLogin } from '@/features/auth/PinLogin';
import { Wizard } from '@/features/onboarding/Wizard';
import { logActivity } from '@/lib/activity';
import { consumeLoginAudit, useAuthStore } from '@/stores/auth';
import { useSessionStore } from '@/stores/session';
import { AuthSplash } from './AuthSplash';

interface WorkspaceGateProps {
  children: React.ReactNode;
}

/** Loads the tenant workspace only after cloud authentication has settled. */
export function WorkspaceGate({ children }: WorkspaceGateProps) {
  const authStatus = useAuthStore((state) => state.status);
  const boot = useSessionStore((state) => state.boot);
  const bootstrap = useSessionStore((state) => state.bootstrap);
  const setOrg = useSessionStore((state) => state.setOrg);
  const loadEmployees = useSessionStore((state) => state.loadEmployees);
  const signInEmployee = useSessionStore((state) => state.signInEmployee);
  const currentEmployee = useSessionStore((state) => state.currentEmployee);

  useEffect(() => {
    if (authStatus === 'signed-in' || authStatus === 'local') {
      void bootstrap();
    }
  }, [authStatus, bootstrap]);

  useEffect(() => {
    if (authStatus === 'signed-in' && boot === 'ready' && currentEmployee && consumeLoginAudit()) {
      logActivity({ action: 'auth.login', entityType: 'session', entityLabel: currentEmployee.name });
    }
  }, [authStatus, boot, currentEmployee]);

  const handleSetupComplete = async (orgId: string, ownerId: string) => {
    repository.setScope(orgId, null);
    const org = await repository.getSingleton('organization');
    if (org) setOrg(org);
    await loadEmployees();
    const owner = useSessionStore.getState().employees.find((employee) => employee.id === ownerId);
    if (owner) signInEmployee(owner);
  };

  if (boot === 'loading') {
    return <AuthSplash />;
  }

  if (boot === 'needs-setup') {
    return <Wizard onComplete={(orgId, ownerId) => void handleSetupComplete(orgId, ownerId)} />;
  }

  if (boot === 'needs-pin') {
    return <PinLogin />;
  }

  return <>{children}</>;
}
