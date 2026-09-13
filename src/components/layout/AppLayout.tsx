import { Suspense, useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileBottomNav } from './MobileBottomNav';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NAV_ITEMS } from '@/config/navigation';
import { useT, type TranslationKey } from '@/i18n';
import { useBackupStore } from '@/stores/backup';
import { useSessionStore } from '@/stores/session';
import { applyDeviceDensityDefault } from '@/stores/zoom';
import { isBackupDue } from '@/lib/business/backup';
import { toast } from '@/stores/toast';
import styles from './AppLayout.module.css';

/**
 * Show a one-time "backup is due" nudge when the app opens. A web app can't run
 * scheduled jobs while closed, so this honest reminder-on-open is the local-mode
 * substitute for true scheduling (cloud users have Supabase backups).
 */
let densityDefaultApplied = false;
/**
 * Kerapatan awal shell mengikuti kelas perangkat (mouse -> padat). Sekali per
 * sesi, dan hanya di app shell — landing dan demo tetap 100%. Lihat zoom.ts.
 */
function useDeviceDensityDefault() {
  useEffect(() => {
    if (densityDefaultApplied) return;
    densityDefaultApplied = true;
    applyDeviceDensityDefault();
  }, []);
}

let backupReminderShown = false;
function useBackupReminder() {
  const planType = useSessionStore((s) => s.org?.planType);
  useEffect(() => {
    // Tunggu org termuat. Trial tidak bisa backup (lihat BackupCard), jadi
    // jangan disuruh melakukan sesuatu yang tombolnya terkunci.
    if (backupReminderShown || !planType) return;
    backupReminderShown = true;
    if (planType === 'trial') return;
    const { frequency, lastBackupAt } = useBackupStore.getState();
    if (isBackupDue(lastBackupAt, frequency)) {
      toast.warning('Waktunya backup data. Buka Pengaturan → Sistem → Backup & Restore.');
    }
  }, [planType]);
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
  const contentRef = useRef<HTMLElement>(null);
  const t = useT();
  useDeviceDensityDefault();
  useBackupReminder();

  useEffect(() => {
    // React Router does not reset custom scroll containers. The demo runs the
    // real app inside one, so reset both it and the document on every route.
    let parent = contentRef.current?.parentElement;
    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
        parent.scrollTo({ top: 0, behavior: 'auto' });
      }
      parent = parent.parentElement;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  const current = NAV_ITEMS.find((n) =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
  );
  const title = current ? t(current.labelKey) : 'FixMaster';
  const subtitleKey = current ? PAGE_SUBTITLE_KEY[current.to] : undefined;
  const subtitle = subtitleKey ? t(subtitleKey) : '';
  const hasMobileNav = !/^\/services\/[^/]+/.test(location.pathname);

  return (
    <div className={[styles.layout, collapsed ? styles.collapsed : '', hasMobileNav ? styles.hasMobileNav : ''].join(' ')}>
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
        <main ref={contentRef} className={styles.content}>
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
      {hasMobileNav && <MobileBottomNav key={location.pathname} />}
    </div>
  );
}
