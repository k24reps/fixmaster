import { useEffect } from 'react';
import { Icon } from '@/components/ui';
import { useSessionStore } from '@/stores/session';
import { repository } from '@/data';
import { Wizard } from '@/features/onboarding/Wizard';
import { PinLogin } from '@/features/auth/PinLogin';
import styles from './AuthGate.module.css';

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Orchestrates the boot flow:
 *   loading      → splash
 *   needs-setup  → onboarding wizard
 *   needs-pin    → employee PIN login
 *   ready        → the app
 */
export function AuthGate({ children }: AuthGateProps) {
  const boot = useSessionStore((s) => s.boot);
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const setOrg = useSessionStore((s) => s.setOrg);
  const loadEmployees = useSessionStore((s) => s.loadEmployees);
  const signInEmployee = useSessionStore((s) => s.signInEmployee);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleSetupComplete = async (orgId: string, ownerId: string) => {
    repository.setScope(orgId, null);
    const org = await repository.getSingleton('organization');
    if (org) setOrg(org);
    await loadEmployees();
    const owner = useSessionStore
      .getState()
      .employees.find((e) => e.id === ownerId);
    if (owner) signInEmployee(owner);
  };

  if (boot === 'loading') {
    return (
      <div className={styles.splash}>
        <div className={styles.logoMark}>
          <Icon name="screwdriver-wrench" aria-hidden />
        </div>
        <div className={styles.spinner} aria-label="Memuat" />
      </div>
    );
  }

  if (boot === 'needs-setup') {
    return <Wizard onComplete={(orgId, ownerId) => void handleSetupComplete(orgId, ownerId)} />;
  }

  if (boot === 'needs-pin') {
    return <PinLogin />;
  }

  return <>{children}</>;
}
