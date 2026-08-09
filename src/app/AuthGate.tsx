import { useEffect, useState } from 'react';
import { useSessionStore } from '@/stores/session';
import { useAuthStore, consumeLoginAudit } from '@/stores/auth';
import { logActivity } from '@/lib/activity';
import { repository } from '@/data';
import { Wizard } from '@/features/onboarding/Wizard';
import { PinLogin } from '@/features/auth/PinLogin';
import { AuthPage } from '@/features/auth/AuthPage';
import { LandingPageV2 } from '@/features/landing/LandingPageV2';
import styles from './AuthGate.module.css';

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Orchestrates the boot flow across TWO sessions:
 *   - Cloud account (Supabase Auth)  → useAuthStore
 *   - Workspace/employee             → useSessionStore
 *
 * Cloud mode:  loading → needs-auth (AuthPage) → needs-setup (Wizard) → ready
 * Local mode:  loading → needs-setup → needs-pin (PinLogin) → ready
 *
 * In cloud mode the authenticated account *is* the employee, so the PIN step
 * is skipped. In local mode (no Supabase) there is no account auth, so the
 * legacy PIN picker remains for shared-device dev/demo.
 */
export function AuthGate({ children }: AuthGateProps) {
  const authStatus = useAuthStore((s) => s.status);
  const initAuth = useAuthStore((s) => s.init);

  // In cloud signed-out state, show the marketing landing page first; the CTA
  // reveals the auth form. This is the public "front door" for selling. The
  // demo's "Daftar Gratis" CTA deep-links here via /?auth=1, so honor it.
  const [showAuth, setShowAuth] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('auth') === '1';
  });

  const boot = useSessionStore((s) => s.boot);
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const setOrg = useSessionStore((s) => s.setOrg);
  const loadEmployees = useSessionStore((s) => s.loadEmployees);
  const signInEmployee = useSessionStore((s) => s.signInEmployee);

  // Resolve the cloud-account session first.
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  // Once auth is settled (signed-in OR local), boot the workspace session.
  useEffect(() => {
    if (authStatus === 'signed-in' || authStatus === 'local') {
      void bootstrap();
    }
  }, [authStatus, bootstrap]);

  // Audit cloud sign-ins (parity with PinLogin's local 'auth.login' entry).
  // consumeLoginAudit is true only after an explicit signIn — a page reload
  // restoring the session must NOT spam the trail. Runs once the workspace is
  // ready because logActivity needs the org/employee context bootstrap resolves.
  const currentEmployee = useSessionStore((s) => s.currentEmployee);
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
    const owner = useSessionStore.getState().employees.find((e) => e.id === ownerId);
    if (owner) signInEmployee(owner);
  };

  // Splash while either session is still resolving.
  if (authStatus === 'loading' || (authStatus !== 'signed-out' && boot === 'loading')) {
    return (
      <div className={styles.splash}>
        <div className={styles.logoMark}>
          <img src="/logo.svg" alt="FixMaster" width="64" height="64" />
        </div>
        <div className={styles.spinner} aria-label="Memuat" />
      </div>
    );
  }

  // Cloud mode: marketing landing first, then the account login on CTA.
  if (authStatus === 'signed-out') {
    return showAuth ? (
      <AuthPage onBack={() => setShowAuth(false)} />
    ) : (
      <LandingPageV2 onStart={() => setShowAuth(true)} />
    );
  }

  if (boot === 'needs-setup') {
    return <Wizard onComplete={(orgId, ownerId) => void handleSetupComplete(orgId, ownerId)} />;
  }

  // PIN picker only applies to local mode (cloud account = the employee).
  if (boot === 'needs-pin') {
    return <PinLogin />;
  }

  return <>{children}</>;
}
