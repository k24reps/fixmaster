import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { AuthSplash } from './AuthSplash';

const AuthPage = lazy(() =>
  import('@/features/auth/AuthPage').then((module) => ({ default: module.AuthPage })),
);
const LandingPageV2 = lazy(() =>
  import('@/features/landing/LandingPageV2').then((module) => ({ default: module.LandingPageV2 })),
);
const WorkspaceGate = lazy(() =>
  import('./WorkspaceGate').then((module) => ({ default: module.WorkspaceGate })),
);

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Resolves the lightweight cloud-account gate first. The heavier tenant
 * repository, onboarding, PIN picker, and authenticated shell live behind
 * WorkspaceGate so signed-out visitors only download the marketing path.
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

  // Resolve the cloud-account session first.
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  if (authStatus === 'loading') {
    return <AuthSplash />;
  }

  // Cloud mode: marketing landing first, then the account login on CTA.
  if (authStatus === 'signed-out') {
    return (
      <Suspense fallback={<AuthSplash />}>
        {showAuth ? (
          <AuthPage onBack={() => setShowAuth(false)} />
        ) : (
          <LandingPageV2 onStart={() => setShowAuth(true)} />
        )}
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<AuthSplash />}>
      <WorkspaceGate>{children}</WorkspaceGate>
    </Suspense>
  );
}
