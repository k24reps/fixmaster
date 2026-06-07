import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NAV_ITEMS } from '@/config/navigation';
import { useT, type TranslationKey } from '@/i18n';
import styles from './AppLayout.module.css';

const PAGE_SUBTITLE_KEY: Record<string, TranslationKey> = {
  '/': 'subtitle.dashboard',
  '/services': 'subtitle.services',
  '/pos': 'subtitle.pos',
  '/customers': 'subtitle.customers',
  '/inventory': 'subtitle.inventory',
  '/suppliers': 'subtitle.suppliers',
  '/finance': 'subtitle.finance',
  '/tasks': 'subtitle.tasks',
  '/attendance': 'subtitle.attendance',
  '/reports': 'subtitle.reports',
  '/settings': 'subtitle.settings',
};

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const t = useT();

  const current = NAV_ITEMS.find((n) =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
  );
  const title = current ? t(current.labelKey) : 'FixMaster';
  const subtitleKey = current ? PAGE_SUBTITLE_KEY[current.to] : undefined;
  const subtitle = subtitleKey ? t(subtitleKey) : '';

  return (
    <div className={[styles.layout, collapsed ? styles.collapsed : ''].join(' ')}>
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={styles.main}>
        <Topbar
          title={title}
          subtitle={subtitle}
          onToggleMobile={() => setMobileOpen((o) => !o)}
        />
        <main className={styles.content}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense
              fallback={
                <div className={styles.routeFallback} aria-label="Memuat halaman" role="status">
                  <span className={styles.routeSpinner} />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
