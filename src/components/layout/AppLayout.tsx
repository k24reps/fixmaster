import { Suspense, useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NAV_ITEMS } from '@/config/navigation';
import { useT, type TranslationKey } from '@/i18n';
import { useBackupStore } from '@/stores/backup';
import { isBackupDue } from '@/lib/business/backup';
import { toast } from '@/stores/toast';
import styles from './AppLayout.module.css';

/**
 * Show a one-time "backup is due" nudge when the app opens. A web app can't run
 * scheduled jobs while closed, so this honest reminder-on-open is the local-mode
 * substitute for true scheduling (cloud users have Supabase backups).
 */
let backupReminderShown = false;
function useBackupReminder() {
  useEffect(() => {
    if (backupReminderShown) return;
    backupReminderShown = true;
    const { frequency, lastBackupAt } = useBackupStore.getState();
    if (isBackupDue(lastBackupAt, frequency)) {
      toast.warning('Waktunya backup data. Buka Pengaturan → Sistem → Backup & Restore.');
    }
  }, []);
}

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
  '/activity': 'subtitle.activity',
  '/settings': 'subtitle.settings',
};

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const t = useT();
  useBackupReminder();

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
