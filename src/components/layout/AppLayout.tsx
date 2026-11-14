import { Suspense, useState, useEffect, useId, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileBottomNav } from './MobileBottomNav';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NAV_ITEMS } from '@/config/navigation';
import { useT, type TranslationKey } from '@/i18n';
import { useBackupStore } from '@/stores/backup';
import { useSessionStore } from '@/stores/session';
import { useZoomStore, zoomShortcut } from '@/stores/zoom';
import { useZoomRail } from './useZoomRail';
import { isBackupDue } from '@/lib/business/backup';
import { toast } from '@/stores/toast';
import styles from './AppLayout.module.css';

/**
 * Pintasan pembesaran (lihat `zoomShortcut`). Tidak aktif di kolom isian: di
 * Windows Ctrl+Alt sama dengan AltGr, yang di sebagian tata letak keyboard
 * mengetik karakter seperti } atau =.
 */
function useZoomShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = zoomShortcut(e);
      if (step === null) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      e.preventDefault();
      const zoom = useZoomStore.getState();
      if (step === 0) zoom.resetZoom();
      else zoom.stepZoom(step);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * Show a one-time "backup is due" nudge when the app opens. A web app can't run
 * scheduled jobs while closed, so this honest reminder-on-open is the local-mode
 * substitute for true scheduling (cloud users have Supabase backups).
 */
let backupReminderShown = false;
function useBackupReminder() {
  const orgLoaded = useSessionStore((s) => !!s.org);
  useEffect(() => {
    // Tunggu org termuat. Backup terbuka untuk semua toko sejak harga per
    // unit, jadi tidak ada lagi paket yang dikecualikan dari pengingat.
    if (backupReminderShown || !orgLoaded) return;
    backupReminderShown = true;
    const { frequency, lastBackupAt } = useBackupStore.getState();
    if (isBackupDue(lastBackupAt, frequency)) {
      toast.warning('Waktunya backup data. Buka Pengaturan → Sistem → Backup & Restore.');
    }
  }, [orgLoaded]);
}

const PAGE_SUBTITLE_KEY: Record<string, TranslationKey> = {
  '/': 'subtitle.dashboard',
  '/services': 'subtitle.services',
  '/calculator': 'subtitle.calculator',
  '/pos': 'subtitle.pos',
  '/customers': 'subtitle.customers',
  '/suppliers': 'subtitle.suppliers',
  '/finance': 'subtitle.finance',
  '/tasks': 'subtitle.tasks',
  '/attendance': 'subtitle.attendance',
  '/reports': 'subtitle.reports',
  '/activity': 'subtitle.activity',
  '/settings': 'subtitle.settings',
};

export function AppLayout() {
  const [collapsed, toggleCollapsed] = useZoomRail();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Tombol menu dan laci saling merujuk: aria-controls, dan fokus kembali ke
  // tombol saat laci ditutup (useDrawerFocus).
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const contentRef = useRef<HTMLElement>(null);
  const t = useT();
  useZoomShortcuts();
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
  // Kamus Istilah tidak ada di NAV_ITEMS (sengaja di luar sidebar).
  const glossary = location.pathname.startsWith('/istilah');
  const serviceDetail = /^\/services\/[^/]+/.test(location.pathname);
  // Detail tiket memberi judulnya sendiri: dulu topbar tetap "Servis", sama
  // dengan daftar, sehingga judul tak memberi tahu di halaman mana kita berada.
  const title = serviceDetail
    ? t('serviceDetail.pageTitle')
    : current
      ? t(current.labelKey)
      : glossary
        ? t('glossary.title')
        : 'FixMaster';
  const subtitleKey = current ? PAGE_SUBTITLE_KEY[current.to] : glossary ? 'glossary.subtitle' : undefined;
  const subtitle = subtitleKey ? t(subtitleKey) : '';
  const hasMobileNav = !serviceDetail;

  return (
    <div className={[styles.layout, collapsed ? styles.collapsed : '', hasMobileNav ? styles.hasMobileNav : ''].join(' ')}>
      {/* Pertama di urutan Tab: sidebar berisi belasan tautan sebelum isi halaman. */}
      <a href="#konten" className={styles.skip}>
        {t('common.skipToContent')}
      </a>
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
        drawerId={drawerId}
        toggleRef={toggleRef}
      />
      <div className={styles.main}>
        <Topbar
          title={title}
          subtitle={subtitle}
          onToggleMobile={() => setMobileOpen((o) => !o)}
          mobileOpen={mobileOpen}
          drawerId={drawerId}
          toggleRef={toggleRef}
        />
        <main ref={contentRef} id="konten" tabIndex={-1} className={styles.content}>
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
