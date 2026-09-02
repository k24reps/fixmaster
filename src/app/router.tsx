import { Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AuthGate } from './AuthGate';
import { AuthSplash } from './AuthSplash';
import { appChildRoutes } from './appChildRoutes';
import { RouteError } from './RouteError';
import { lazyChunk } from '@/lib/lazyChunk';

// Route pages and the authenticated shell are code-split. Signed-out visitors
// do not download AppLayout, while authenticated users do not pay for the
// marketing surface until they explicitly open its preview route.
const AppLayout = lazyChunk(() =>
  import('@/components/layout/AppLayout').then((module) => ({ default: module.AppLayout })),
);
const LandingPageV2 = lazyChunk(() =>
  import('@/features/landing/LandingPageV2').then((module) => ({ default: module.LandingPageV2 })),
);
const TrackingPage = lazyChunk(() =>
  import('@/features/tracking/TrackingPage').then((m) => ({ default: m.TrackingPage })),
);
const RepairTicketPrototype = lazyChunk(() =>
  import('@/features/prototype/RepairTicketPrototype').then((m) => ({
    default: m.RepairTicketPrototype,
  })),
);
const PrivacyPage = lazyChunk(() =>
  import('@/features/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazyChunk(() =>
  import('@/features/legal/TermsPage').then((m) => ({ default: m.TermsPage })),
);
const ResetPasswordPage = lazyChunk(() =>
  import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const OperatorPage = lazyChunk(() =>
  import('@/features/operator/OperatorPage').then((m) => ({ default: m.OperatorPage })),
);
export const router = createBrowserRouter([
  {
    // Stable preview alias for the live signed-out landing page. Keeping this
    // route makes design review links durable while AuthGate serves V2 at `/`.
    path: '/landing-preview',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<AuthSplash />}>
        <LandingPageV2 />
      </Suspense>
    ),
  },
  {
    // Operator dashboard (vendor-only, CROSS-TENANT). Deliberately OUTSIDE
    // AuthGate: AuthGate runs getMyMembership() and pushes an account with no
    // membership into the setup Wizard — and the operator account has none by
    // design. The page handles its own auth init, sign-in, and admin gate.
    // Real enforcement is server-side (is_platform_admin() in every RPC, 0045).
    path: '/operator',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={null}>
        <OperatorPage />
      </Suspense>
    ),
  },
  {
    // Public design prototype (no auth) — for visual evaluation only.
    path: '/prototype/ticket',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={null}>
        <RepairTicketPrototype />
      </Suspense>
    ),
  },
  {
    // Public, no-login service tracking.
    path: '/track',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={null}>
        <TrackingPage />
      </Suspense>
    ),
  },
  {
    // Public legal pages — linkable from signup consent, payment gateway,
    // and app store listings (no auth required).
    path: '/privacy',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={null}>
        <PrivacyPage />
      </Suspense>
    ),
  },
  {
    path: '/terms',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={null}>
        <TermsPage />
      </Suspense>
    ),
  },
  {
    // Password recovery landing (email link target). Public — outside AuthGate
    // — so supabase-js can parse the recovery token and authorize the update.
    path: '/reset-password',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={null}>
        <ResetPasswordPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    errorElement: <RouteError />,
    element: (
      <AuthGate>
        <Suspense fallback={<AuthSplash />}>
          <AppLayout />
        </Suspense>
      </AuthGate>
    ),
    children: appChildRoutes,
  },
]);
