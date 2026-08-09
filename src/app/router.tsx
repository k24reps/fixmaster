/* eslint-disable react-refresh/only-export-components -- router config module: lazy() route components live here by design, not a fast-refreshed component file. */
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { LandingPageV2 } from '@/features/landing/LandingPageV2';
import { AuthGate } from './AuthGate';
import { appChildRoutes } from './appChildRoutes';

// Route pages are code-split: each becomes its own chunk loaded on demand,
// keeping the initial bundle small. The shell (AppLayout/AuthGate) and the
// tiny NotFoundPage stay eager. The authenticated app's child routes live in
// appChildRoutes so the public demo (MemoryRouter) can reuse them verbatim.
const TrackingPage = lazy(() =>
  import('@/features/tracking/TrackingPage').then((m) => ({ default: m.TrackingPage })),
);
const RepairTicketPrototype = lazy(() =>
  import('@/features/prototype/RepairTicketPrototype').then((m) => ({
    default: m.RepairTicketPrototype,
  })),
);
const PrivacyPage = lazy(() =>
  import('@/features/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import('@/features/legal/TermsPage').then((m) => ({ default: m.TermsPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
export const router = createBrowserRouter([
  {
    // Stable preview alias for the live signed-out landing page. Keeping this
    // route makes design review links durable while AuthGate serves V2 at `/`.
    path: '/landing-preview',
    element: <LandingPageV2 />,
  },
  {
    // Public design prototype (no auth) — for visual evaluation only.
    path: '/prototype/ticket',
    element: (
      <Suspense fallback={null}>
        <RepairTicketPrototype />
      </Suspense>
    ),
  },
  {
    // Public, no-login service tracking.
    path: '/track',
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
    element: (
      <Suspense fallback={null}>
        <PrivacyPage />
      </Suspense>
    ),
  },
  {
    path: '/terms',
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
    element: (
      <Suspense fallback={null}>
        <ResetPasswordPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <AuthGate>
        <AppLayout />
      </AuthGate>
    ),
    children: appChildRoutes,
  },
]);
