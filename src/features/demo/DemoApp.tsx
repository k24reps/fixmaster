import { useEffect, useMemo, useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { appChildRoutes } from '@/app/appChildRoutes';
import { InMemoryAdapter } from '@/data/in-memory-adapter';
import { installRepository, resetRepository } from '@/data';
import { useDemoStore } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import { useZoomStore } from '@/stores/zoom';
import { seedDemoWorkspace } from '@/dev/seed';
import { Icon } from '@/components/ui';
import { DemoChrome } from './DemoChrome';
import styles from './DemoApp.module.css';

/**
 * Public interactive product demo (`/demo`). Lets an anonymous visitor use the
 * REAL FixMaster app — every menu, hands-on — without signing up.
 *
 * How it stays isolated:
 *  - Swaps the global `repository` for an {@link InMemoryAdapter} (RAM-only;
 *    zero disk trace, never touches the visitor's real IndexedDB).
 *  - Seeds the existing curated demo workspace and signs in as the owner.
 *  - Runs the app under its own `MemoryRouter`, so in-app navigation (sidebar
 *    links to `/services`, etc.) stays inside the demo and the browser URL
 *    remains `/demo`.
 *  - On unmount, restores the real repository + clears the session.
 *
 * Embedded on the landing page via `<iframe src="/demo">` (full JS isolation)
 * and also reachable directly as a full-screen page (mobile / shareable link).
 */
export function DemoApp() {
  const [ready, setReady] = useState(false);

  // The demo's private router reuses the real app's child routes verbatim, so
  // the two never drift. Created once per mount.
  const demoRouter = useMemo(
    () =>
      createMemoryRouter([{ path: '/', element: <AppLayout />, children: appChildRoutes }], {
        initialEntries: ['/'],
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    // Keep the demo route out of search engines (it's a sandbox, not content).
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);

    // Keep the public demo visually faithful and readable regardless of an
    // existing app preference on the same origin. This session is temporary:
    // zoom controls work, but the saved preference is restored on exit.
    const endTransientZoom = useZoomStore.getState().beginTransientZoom(1);
    document.body.classList.add('fm-demo-active');

    installRepository(new InMemoryAdapter());
    useDemoStore.getState().enter();
    void seedDemoWorkspace().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      robots.remove();
      document.body.classList.remove('fm-demo-active');
      endTransientZoom();
      useDemoStore.getState().exit();
      useSessionStore.getState().reset();
      resetRepository();
    };
  }, []);

  // Re-seed back to the curated starting dataset (Reset Demo button).
  const handleReset = async () => {
    await seedDemoWorkspace();
  };

  if (!ready) {
    return (
      <div className={styles.boot}>
        <div className={styles.bootMark}>
          <Icon name="screwdriver-wrench" aria-hidden />
        </div>
        <span className={styles.bootSpinner} aria-label="Menyiapkan demo" />
        <p className={styles.bootText}>Menyiapkan bench demo…</p>
      </div>
    );
  }

  return (
    <div className={styles.demoRoot}>
      <DemoChrome onReset={() => void handleReset()} />
      <div className={styles.demoStage}>
        <RouterProvider router={demoRouter} />
      </div>
    </div>
  );
}
