import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { ToastContainer } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { sanitizeAnalyticsEvent } from './lib/analytics';

const queryClient = new QueryClient({
  defaultOptions: {
    // refetchOnReconnect: when the browser regains connectivity (the `online`
    // event), refetch active queries. This is the safety net for the case where
    // the realtime channel died silently while offline/asleep — see
    // subscribeOrgTables auto-reconnect. 'always' refetches even if data is
    // still within staleTime, since "we were offline" implies possibly-stale.
    //
    // staleTime 5 min (was 30 s): freshness here does NOT depend on this timer
    // — useCollection invalidates on realtime change events, and realtime
    // egress is negligible (KB) next to PostgREST (MB). A 30 s timer just made
    // navigating back to a page re-pull whole tables for data that had not
    // changed. refetchOnReconnect stays the safety net for a dead channel.
    queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: false, refetchOnReconnect: 'always' },
  },
});

// The public demo runs its OWN MemoryRouter, so it must NOT live inside the
// app's BrowserRouter (React Router forbids nested routers). We branch on the
// path here, before any RouterProvider mounts. This serves both direct visits
// to /demo. Keep this exact so lookalike unknown paths can resolve as a real 404.
const DemoApp = lazy(() =>
  import('./features/demo/DemoApp').then((m) => ({ default: m.DemoApp })),
);

export function App() {
  const isDemo = typeof window !== 'undefined' && window.location.pathname === '/demo';

  return (
    <ErrorBoundary root>
      <QueryClientProvider client={queryClient}>
        {isDemo ? (
          <Suspense fallback={null}>
            <DemoApp />
          </Suspense>
        ) : (
          <RouterProvider router={router} />
        )}
        <ToastContainer />
        <Analytics beforeSend={sanitizeAnalyticsEvent} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
