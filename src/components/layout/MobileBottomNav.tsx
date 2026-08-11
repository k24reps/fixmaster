import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { useNavSignals } from '@/hooks/useNavSignals';
import { useSessionStore } from '@/stores/session';
import { useAuthStore } from '@/stores/auth';
import { demoGuard } from '@/stores/demo';
import { isSupabaseConfigured } from '@/data/supabase-client';
import { getVisibleNavigation, resolveMobileNavigation, type ResolvedNavItem } from '@/lib/business/navigation';
import { useSettingsStore } from '@/stores/settings';
import { useT } from '@/i18n';
import styles from './MobileBottomNav.module.css';

const ROLE_LABEL: Record<string, Record<string, string>> = {
  id: { owner: 'Pemilik', admin: 'Admin', karyawan: 'Karyawan' },
  en: { owner: 'Owner', admin: 'Admin', karyawan: 'Staff' },
};

function pathIsActive(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

export function MobileBottomNav() {
  const location = useLocation();
  const org = useSessionStore((state) => state.org);
  const employee = useSessionStore((state) => state.currentEmployee);
  const activeOutletId = useSessionStore((state) => state.activeOutletId);
  const allowedOutletIds = useSessionStore((state) => state.allowedOutletIds);
  const setActiveOutlet = useSessionStore((state) => state.setActiveOutlet);
  const signOutEmployee = useSessionStore((state) => state.signOutEmployee);
  const authSignOut = useAuthStore((state) => state.signOut);
  const language = useSettingsStore((state) => state.language);
  const { data: outlets } = useCollection('outlets');
  const signals = useNavSignals();
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const visibleNavigation = useMemo(
    () => employee ? getVisibleNavigation(employee.role, org?.planType ?? 'trial') : [],
    [employee, org?.planType],
  );
  const primaryNavigation = useMemo(
    () => resolveMobileNavigation(org?.settings?.mobileNavigation, visibleNavigation),
    [org?.settings?.mobileNavigation, visibleNavigation],
  );
  const primaryPaths = new Set(primaryNavigation.map(({ item }) => item.to));
  const moreNavigation = visibleNavigation.filter(({ item }) => !primaryPaths.has(item.to));
  const moreIsActive = moreNavigation.some(({ item }) => pathIsActive(item.to, location.pathname));
  const reachableOutlets = allowedOutletIds.length
    ? outlets.filter((outlet) => allowedOutletIds.includes(outlet.id))
    : outlets;

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

  const handleLogout = () => {
    if (demoGuard('Keluar dinonaktifkan di demo. Daftar gratis untuk memakai akunmu sendiri.')) return;
    setMoreOpen(false);
    if (isSupabaseConfigured) void authSignOut();
    else signOutEmployee();
  };

  const renderSignal = (path: string) => {
    const signal = signals[path];
    if (!signal || signal.tone === 'idle') return null;
    return (
      <span
        className={[styles.signal, styles[`tone_${signal.tone}`], signal.pulse ? styles.pulse : ''].join(' ')}
        aria-label={`${signal.count}`}
      >
        {signal.count}
      </span>
    );
  };

  const destinationFor = ({ item, locked }: ResolvedNavItem) => locked ? '/settings' : item.to;
  const mobileLabelFor = (item: ResolvedNavItem['item']) =>
    item.to === '/' ? t('nav.home') : t(item.labelKey);

  return (
    <>
      {moreOpen && (
        <>
          <button
            className={styles.backdrop}
            type="button"
            aria-label={t('common.close')}
            onClick={() => setMoreOpen(false)}
          />
          <section id="mobile-more-sheet" className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
            <span className={styles.sheetHandle} aria-hidden />
            <div className={styles.sheetHeader}>
              <div>
                <span className={styles.sheetKicker}>{t('nav.mobile.panel')}</span>
                <h3 id="mobile-more-title">{t('nav.mobile.moreTitle')}</h3>
              </div>
              <button
                ref={closeRef}
                type="button"
                className={styles.closeButton}
                aria-label={t('common.close')}
                onClick={() => setMoreOpen(false)}
              >
                <Icon name="times" aria-hidden />
              </button>
            </div>

            <div className={styles.moreGrid}>
              {moreNavigation.map((entry) => {
                const { item, locked } = entry;
                const active = pathIsActive(item.to, location.pathname);
                return (
                  <Link
                    key={item.to}
                    to={destinationFor(entry)}
                    className={[styles.moreItem, active ? styles.moreItemActive : '', locked ? styles.locked : ''].join(' ')}
                    onClick={() => setMoreOpen(false)}
                  >
                    <span className={styles.moreIcon}>
                      <Icon name={item.icon} aria-hidden />
                    </span>
                    <span className={styles.moreLabel}>{t(item.labelKey)}</span>
                    {locked ? (
                      <span className={styles.proBadge}><span aria-hidden />PRO</span>
                    ) : renderSignal(item.to)}
                  </Link>
                );
              })}
            </div>

            <div className={styles.controlDeck}>
              <div className={styles.businessReadout}>
                <span className={styles.businessMark} aria-hidden>
                  {org?.logoDataUrl ? <img src={org.logoDataUrl} alt="" /> : (org?.name ?? 'F').charAt(0).toUpperCase()}
                </span>
                <span>
                  <small>{t('nav.mobile.businessUnit')}</small>
                  <strong>{org?.name ?? '—'}</strong>
                </span>
              </div>

              {reachableOutlets.length > 0 && (
                <label className={styles.outletControl}>
                  <span><span className={styles.outletLed} aria-hidden />{t('nav.mobile.activeOutlet')}</span>
                  <select
                    value={activeOutletId ?? ''}
                    onChange={(event) => setActiveOutlet(event.target.value || null)}
                  >
                    <option value="">{t('nav.mobile.allOutlets')}</option>
                    {reachableOutlets.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className={styles.operatorRow}>
                <span className={styles.avatar}>
                  {employee?.name.charAt(0).toUpperCase() ?? '—'}
                  <span aria-hidden />
                </span>
                <span className={styles.operatorInfo}>
                  <strong>{employee?.name ?? '—'}</strong>
                  <small>{employee ? ROLE_LABEL[language][employee.role] : ''}</small>
                </span>
                <button type="button" className={styles.logoutButton} onClick={handleLogout}>
                  <Icon name="right-from-bracket" aria-hidden />
                  {t('auth.logout')}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      <nav className={styles.bottomNav} aria-label={t('nav.mobile.primary')}>
        {primaryNavigation.map((entry) => {
          const { item, locked } = entry;
          const active = pathIsActive(item.to, location.pathname);
          return (
            <Link
              key={item.to}
              to={destinationFor(entry)}
              className={[styles.navItem, active ? styles.active : '', locked ? styles.locked : ''].join(' ')}
              aria-current={active ? 'page' : undefined}
              title={locked ? `${t(item.labelKey)} — PRO` : t(item.labelKey)}
            >
              <span className={styles.navIcon}>
                <Icon name={item.icon} weight={active ? 'fill' : 'regular'} aria-hidden />
                {locked ? <span className={styles.lockLed} aria-hidden /> : renderSignal(item.to)}
              </span>
              <span className={styles.navLabel}>{mobileLabelFor(item)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={[styles.navItem, moreOpen || moreIsActive ? styles.active : ''].join(' ')}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span className={styles.navIcon}><Icon name="bars" aria-hidden /></span>
          <span className={styles.navLabel}>{t('nav.more')}</span>
        </button>
      </nav>
    </>
  );
}
