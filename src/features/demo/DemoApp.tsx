import { useEffect, useMemo, useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { appChildRoutes } from '@/app/appChildRoutes';
import { InMemoryAdapter } from '@/data/in-memory-adapter';
import { installRepository, resetRepository } from '@/data';
import { useDemoStore } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import { useZoomStore } from '@/stores/zoom';
import { DEMO_SHOP_NAME, seedDemoWorkspace } from '@/dev/seed';
import { Icon } from '@/components/ui';
import { trackEvent } from '@/lib/analytics';
import { useT } from '@/i18n';
import { readDemoVisitor, type DemoVisitor } from '@/lib/demoVisitor';
import { DemoGate } from '@/features/landing/DemoGate';
import { DemoChrome } from './DemoChrome';
import styles from './DemoApp.module.css';

/**
 * Pengunjung yang sudah lolos gerbang di perangkat ini. Probe Playwright di
 * dev server (puluhan skrip `scripts/*.mjs` membuka /demo langsung) dilewatkan
 * dengan nama toko demo bawaan; `?gate` memaksa gerbangnya tampil untuk difoto.
 * Build produksi tidak punya jalan pintas ini.
 */
function initialVisitor(): DemoVisitor | null {
  const visitor = readDemoVisitor();
  if (visitor) return visitor;
  if (
    import.meta.env.DEV &&
    navigator.webdriver &&
    !new URLSearchParams(window.location.search).has('gate')
  ) {
    return { shopName: DEMO_SHOP_NAME };
  }
  return null;
}

/**
 * Public interactive product demo (`/demo`). Lets an anonymous visitor use the
 * REAL FixMaster app — every menu, hands-on — without signing up.
 *
 * How it stays isolated:
 *  - Swaps the global `repository` for an {@link InMemoryAdapter} (RAM-only;
 *    zero disk trace, never touches the visitor's real IndexedDB).
 *  - Seeds the curated demo workspace under the visitor's own shop name and
 *    signs in as the owner.
 *  - Runs the app under its own `MemoryRouter`, so in-app navigation (sidebar
 *    links to `/services`, etc.) stays inside the demo and the browser URL
 *    remains `/demo`.
 *  - On unmount, restores the real repository + clears the session.
 *
 * Guarded by the demo gate (shop name + WhatsApp number, migration 0102): the
 * landing gate passes straight through, a direct visit shows the same gate
 * first, and a returning visitor on this device skips it.
 */
export function DemoApp() {
  const t = useT();
  const [visitor, setVisitor] = useState<DemoVisitor | null>(initialVisitor);
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

  // Berlaku juga untuk gerbangnya: sandbox, bukan konten, dan selalu 100% +
  // Lapang (mengabaikan zoom tersimpan di origin yang sama) sampai keluar.
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    const endTransientView = useZoomStore.getState().beginTransientView();
    return () => {
      robots.remove();
      endTransientView();
    };
  }, []);

  useEffect(() => {
    if (!visitor) return;
    let cancelled = false;
    trackEvent('demo_started', { entry: 'public_route' });
    document.body.classList.add('fm-demo-active');

    installRepository(new InMemoryAdapter());
    useDemoStore.getState().enter();
    void seedDemoWorkspace(visitor.shopName).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      document.body.classList.remove('fm-demo-active');
      useDemoStore.getState().exit();
      useSessionStore.getState().reset();
      resetRepository();
    };
  }, [visitor]);

  // Re-seed back to the curated starting dataset (Reset Demo button).
  const handleReset = async () => {
    await seedDemoWorkspace(visitor?.shopName);
  };

  if (!visitor) {
    return (
      <main className={styles.gatePage}>
        <a className={styles.gateBack} href="/">
          <Icon name="arrow-left" aria-hidden />
          {t('demoGate.backHome')}
        </a>
        <div className={styles.gateColumn}>
          <div className={styles.gateBrand}>
            <img src="/logo.svg" alt="" width="40" height="40" />
            <strong>FixMaster</strong>
          </div>
          <DemoGate
            source="demo"
            title="demoGate.titleDemoRoute"
            privacyHref="/privacy"
            onPassed={(shopName) => setVisitor({ shopName })}
          />
        </div>
      </main>
    );
  }

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
