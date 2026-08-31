import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { AuthSplash } from './AuthSplash';
import {
  authIntentFromSearch,
  authIntentHref,
  type AuthIntent,
} from '@/features/auth/auth-intent';

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
  // reveals the auth form. Public CTAs deep-link here with an explicit
  // login/signup intent and, when
  // applicable, the plan selected on the pricing plate.
  const [authIntent, setAuthIntent] = useState<AuthIntent | null>(() => {
    if (typeof window === 'undefined') return null;
    return authIntentFromSearch(window.location.search);
  });

  const openAuth = (intent: AuthIntent) => {
    window.history.replaceState(null, '', authIntentHref(intent));
    setAuthIntent(intent);
  };

  const closeAuth = () => {
    window.history.replaceState(null, '', '/');
    setAuthIntent(null);
  };

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
        {authIntent ? (
          <AuthPage
            initialMode={authIntent.mode}
            signupPlan={authIntent.plan}
            source={authIntent.source}
            onBack={closeAuth}
          />
        ) : (
          <LandingPageV2 onStart={openAuth} />
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
