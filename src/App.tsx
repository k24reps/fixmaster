import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { ToastContainer } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

// The public demo runs its OWN MemoryRouter, so it must NOT live inside the
// app's BrowserRouter (React Router forbids nested routers). We branch on the
// path here, before any RouterProvider mounts. This serves both direct visits
// to /demo and the landing page's <iframe src="/demo">.
const DemoApp = lazy(() =>
  import('./features/demo/DemoApp').then((m) => ({ default: m.DemoApp })),
);

export function App() {
  const isDemo =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/demo');

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
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
