import { NavLink } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui';
import { NAV_ITEMS } from '@/config/navigation';
import { planAllows, PLANS, isManager, isOwner } from '@/config/plans';
import { useSessionStore } from '@/stores/session';
import { useAuthStore } from '@/stores/auth';
import { isSupabaseConfigured } from '@/data/supabase-client';
import { useCollection } from '@/hooks/useCollection';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { useNavSignals } from '@/hooks/useNavSignals';
import type { Outlet, ID } from '@/data/types';
import styles from './Sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}

const ROLE_LABEL: Record<string, Record<string, string>> = {
  id: { owner: 'Pemilik', admin: 'Admin', karyawan: 'Karyawan' },
  en: { owner: 'Owner', admin: 'Admin', karyawan: 'Staff' },
};

export function Sidebar({
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: SidebarProps) {
  const org = useSessionStore((s) => s.org);
  const employee = useSessionStore((s) => s.currentEmployee);
  const signOut = useSessionStore((s) => s.signOutEmployee);
  const authSignOut = useAuthStore((s) => s.signOut);
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const setActiveOutlet = useSessionStore((s) => s.setActiveOutlet);
  const { data: outlets } = useCollection('outlets');
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const signals = useNavSignals();

  // Cloud: true sign-out of the Supabase account (→ AuthPage).
  // Local: switch user (re-enter PIN) — there is no cloud account.
  const handleLogout = () => {
    if (isSupabaseConfigured) void authSignOut();
    else signOut();
  };

  const plan = org?.planType ?? 'trial';
  const isMgr = employee ? isManager(employee.role) : false;
  const isOwn = employee ? isOwner(employee.role) : false;
  const visibleNav = NAV_ITEMS.filter(
    (item) =>
      (!item.feature || planAllows(plan, item.feature)) &&
      (!item.managerOnly || isMgr) &&
      (!item.ownerOnly || isOwn),
  );

  return (
    <>
      <div
        className={[styles.overlay, mobileOpen ? styles.overlayOpen : ''].join(' ')}
        onClick={onCloseMobile}
      />
      <aside
        className={[
          styles.sidebar,
          collapsed ? styles.collapsed : '',
          mobileOpen ? styles.mobileOpen : '',
        ].join(' ')}
      >
        {/* ---------- Product identity (FixMaster) ---------- */}
        <div className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden>
              <span className={styles.brandMono}>FM</span>
              <span className={styles.powerLed} />
            </span>
            <span className={styles.brandText}>
              <strong>
                Fix<span className={styles.brandAccent}>Master</span>
              </strong>
              <small className={styles.unitLine}>
                <span className={styles.unitId}>BENCH OS</span>
                <span className={styles.planBadge}>{PLANS[plan].name}</span>
              </small>
            </span>
          </div>
          <button
            className={styles.collapseBtn}
            onClick={onToggleCollapse}
            aria-label="Lipat sidebar"
          >
            <Icon name="angles-left" aria-hidden />
          </button>
        </div>

        {/* ---------- Diagnostic rail ---------- */}
        <nav className={styles.nav} aria-label="Navigasi utama">
          {visibleNav.map((item) => {
            const sig = signals[item.to];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  [styles.navItem, isActive ? styles.active : ''].join(' ')
                }
                title={t(item.labelKey)}
              >
                <Icon
                  name={item.icon}
                  className={styles.navIcon}
                  style={{ color: item.color }}
                  aria-hidden
                />
                <span className={styles.navLabel}>{t(item.labelKey)}</span>
                {sig && sig.tone !== 'idle' ? (
                  <span
                    className={[
                      styles.readout,
                      styles[`tone_${sig.tone}`],
                      sig.pulse ? styles.pulse : '',
                    ].join(' ')}
                    aria-label={`${sig.count}`}
                  >
                    <span className={styles.readoutLed} aria-hidden />
                    <span className={styles.readoutNum}>{sig.count}</span>
                  </span>
                ) : (
                  <span className={[styles.readout, styles.tone_idle].join(' ')} aria-hidden>
                    <span className={styles.readoutLed} />
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* ---------- Business unit (shop identity + branch selector) ---------- */}
        <div className={styles.bizBlock}>
          <div className={styles.bizIdentity}>
            <span className={styles.bizLogo}>
              {org?.logoDataUrl ? (
                <img src={org.logoDataUrl} alt="" />
              ) : (
                <span className={styles.bizLogoFallback}>
                  {(org?.name ?? 'F').charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <div className={styles.bizInfo}>
              <small className={styles.bizLabel}>UNIT USAHA</small>
              <strong className={styles.bizName}>{org?.name ?? '—'}</strong>
            </div>
          </div>
          {outlets.length > 0 && (
            <BranchSelector
              outlets={outlets}
              activeOutletId={activeOutletId}
              onSelect={setActiveOutlet}
            />
          )}
        </div>

        {/* ---------- Operator module ---------- */}
        <div className={styles.footer}>
          <div className={styles.user}>
            <div className={styles.avatar}>
              {employee ? employee.name.charAt(0).toUpperCase() : <Icon name="user" aria-hidden />}
              <span className={styles.onlineLed} aria-hidden />
            </div>
            <div className={styles.userInfo}>
              <p className={styles.userName}>{employee?.name ?? '—'}</p>
              <p className={styles.userRole}>
                {employee ? ROLE_LABEL[language][employee.role] : ''}
              </p>
            </div>
            <button
              className={styles.logoutBtn}
              onClick={handleLogout}
              title={t('auth.logout')}
              aria-label={t('auth.logout')}
            >
              <Icon name="right-from-bracket" aria-hidden />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/**
 * Prominent branch (outlet) selector styled like a bench channel switch.
 * "Semua Outlet" (null) shows org-wide data; picking a branch scopes the
 * whole app to that outlet. Opens upward since it sits near the bottom.
 */
function BranchSelector({
  outlets,
  activeOutletId,
  onSelect,
}: {
  outlets: Outlet[];
  activeOutletId: ID | null;
  onSelect: (id: ID | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = outlets.find((o) => o.id === activeOutletId) ?? null;
  const label = active ? active.name : 'Semua Outlet';

  return (
    <div className={styles.branchSel} ref={ref}>
      <button
        type="button"
        className={[styles.branchBtn, open ? styles.branchBtnOpen : '', active ? '' : styles.branchAll].join(' ')}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Cabang aktif: ${label}`}
      >
        <span className={styles.branchLed} aria-hidden />
        <span className={styles.branchMain}>
          <span className={styles.branchTag}>CABANG</span>
          <span className={styles.branchName}>{label}</span>
        </span>
        <Icon name="chevron-down" className={styles.branchCaret} aria-hidden />
      </button>

      {open && (
        <div className={styles.branchMenu} role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!activeOutletId}
            className={[styles.branchOpt, !activeOutletId ? styles.branchOptActive : ''].join(' ')}
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          >
            <Icon name="boxes-stacked" className={styles.branchOptIcon} aria-hidden />
            <span className={styles.branchOptName}>Semua Outlet</span>
            {!activeOutletId && <Icon name="check" className={styles.branchCheck} aria-hidden />}
          </button>
          {outlets.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={activeOutletId === o.id}
              className={[styles.branchOpt, activeOutletId === o.id ? styles.branchOptActive : ''].join(' ')}
              onClick={() => {
                onSelect(o.id);
                setOpen(false);
              }}
            >
              <Icon name="shop" className={styles.branchOptIcon} aria-hidden />
              <span className={styles.branchOptName}>{o.name}</span>
              {o.isPrimary && <span className={styles.branchPrimary}>Utama</span>}
              {activeOutletId === o.id && <Icon name="check" className={styles.branchCheck} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
