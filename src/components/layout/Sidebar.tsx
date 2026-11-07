import { EmptyValue } from '@/components/ui/EmptyValue';
import { NavLink, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { PLANS } from '@/config/plans';
import { getVisibleNavigation } from '@/lib/business/navigation';
import { useSessionStore } from '@/stores/session';
import { useCollection } from '@/hooks/useCollection';
import { useT } from '@/i18n';
import { useNavSignals } from '@/hooks/useNavSignals';
import type { Outlet, ID } from '@/data/types';
import styles from './Sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}

export function Sidebar({
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: SidebarProps) {
  const org = useSessionStore((s) => s.org);
  const employee = useSessionStore((s) => s.currentEmployee);
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const setActiveOutlet = useSessionStore((s) => s.setActiveOutlet);
  const allowedOutletIds = useSessionStore((s) => s.allowedOutletIds);
  const { data: outlets } = useCollection('outlets');
  const t = useT();
  const signals = useNavSignals();
  // Nama, peran, dan Keluar kini di menu akun Topbar (AccountMenu), bukan kartu
  // di dasar rail: sidebar hanya navigasi dan unit usaha.

  const plan = org?.planType ?? 'trial';
  // Role-gating (managerOnly/ownerOnly) HIDES items — it mirrors server RLS,
  // so showing them would just lead to failures. Feature-gating (plan lacks
  // the feature) instead SHOWS the item locked with a "Pro" badge, so Solo
  // users see what upgrading unlocks (the upgrade "itch").
  const visibleNav = employee ? getVisibleNavigation(employee.role, plan) : [];

  // Kanal aktif selalu terlihat. Di 1366×768 (demo) Log dan Pengaturan berada
  // di bawah tepi rail, jadi halaman yang sedang dibuka tak punya tanda di
  // menu. Jarak 28px melewati tepi pudar 24px. Di ujung gulir tepi pudarnya
  // hilang, jadi kanal yang muat di sana ditempel ke ujung: kembali ke Servis
  // menggulir ke 0, bukan ke 28px yang memotong Dashboard. Layout effect:
  // tanpa lompatan yang sempat tergambar.
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !item) return;
    const pad = 28;
    const view = nav.clientHeight;
    const max = nav.scrollHeight - view;
    const top = item.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    const bottom = top + item.offsetHeight;
    let next = nav.scrollTop;
    if (top - next < pad) next = top - pad;
    else if (bottom - next > view - pad) next = bottom - view + pad;
    if (next === nav.scrollTop) return;
    if (bottom <= view - pad) next = 0;
    else if (top - max >= pad) next = max;
    nav.scrollTop = next;
  }, [pathname, collapsed]);

  const logo = (
    <span className={styles.bizLogo} aria-hidden>
      {org?.logoDataUrl ? (
        <img src={org.logoDataUrl} alt="" />
      ) : (
        <span className={styles.bizLogoFallback}>
          {(org?.name ?? 'F').charAt(0).toUpperCase()}
        </span>
      )}
    </span>
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
              <img src="/logo.svg" alt="" width="38" height="38" />
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
        {/* Sumur terpisah dari <nav>: tepi pudar menyamarkan isi nav, dan
            latar sumur di belakangnya menjaga warnanya tetap utuh. */}
        <div className={styles.navWell}>
        <nav ref={navRef} className={styles.nav} aria-label="Navigasi utama">
          {visibleNav.map(({ item, locked }, i) => {
            // Sambungan bertitik di awal tiap grup: operasional, kantor, sistem.
            const seam = i > 0 && visibleNav[i - 1].item.group !== item.group ? styles.seam : '';
            if (locked) {
              return (
                <NavLink
                  key={item.to}
                  to="/settings"
                  onClick={onCloseMobile}
                  className={[styles.navItem, styles.locked, seam].join(' ')}
                  title={`${t(item.labelKey)} (tersedia di paket Pro)`}
                >
                  <span className={styles.navIconCell} aria-hidden>
                    <Icon name={item.icon} className={styles.navIcon} />
                  </span>
                  <span className={styles.navLabel}>{t(item.labelKey)}</span>
                  <span className={styles.lockBadge}>
                    <span className={styles.lockLed} aria-hidden />
                    <span className={styles.lockBadgeText}>Pro</span>
                  </span>
                </NavLink>
              );
            }
            const sig = signals[item.to];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  [styles.navItem, isActive ? styles.active : '', seam].join(' ')
                }
                title={t(item.labelKey)}
              >
                <span className={styles.navIconCell} aria-hidden>
                  <Icon name={item.icon} className={styles.navIcon} />
                </span>
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
        </div>

        {/* ---------- Business unit (shop identity + branch selector) ---------- */}
        {/* Satu baris bila ada cabang: logo, nama toko, dan cabang aktif menyatu
            dalam satu sakelar (113 → 68px), ruang itu kembali ke kanal. */}
        <div className={styles.bizBlock}>
          {outlets.length > 0 ? (
            <BranchSelector
              logo={logo}
              orgName={org?.name}
              outlets={
                allowedOutletIds.length > 0
                  ? outlets.filter((o) => allowedOutletIds.includes(o.id))
                  : outlets
              }
              activeOutletId={activeOutletId}
              onSelect={setActiveOutlet}
            />
          ) : (
            <div className={styles.bizIdentity}>
              {logo}
              <div className={styles.bizInfo}>
                <small className={styles.bizLabel}>{t('nav.mobile.businessUnit')}</small>
                <strong className={styles.bizName}>{org?.name ?? <EmptyValue />}</strong>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * Prominent branch (outlet) selector styled like a bench channel switch.
 * "Semua Outlet" (null) shows org-wide data; picking a branch scopes the
 * whole app to that outlet. Opens upward since it sits near the bottom.
 * Identitas toko (logo + nama) menjadi pelat sakelarnya.
 */
function BranchSelector({
  logo,
  orgName,
  outlets,
  activeOutletId,
  onSelect,
}: {
  logo: ReactNode;
  orgName: string | undefined;
  outlets: Outlet[];
  activeOutletId: ID | null;
  onSelect: (id: ID | null) => void;
}) {
  const t = useT();
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
  const allLabel = t('nav.mobile.allOutlets');
  const label = active ? active.name : allLabel;

  return (
    <div className={styles.branchSel} ref={ref}>
      <button
        type="button"
        className={[styles.branchBtn, open ? styles.branchBtnOpen : '', active ? '' : styles.branchAll].join(' ')}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${t('nav.mobile.activeOutlet')}: ${label}`}
      >
        {logo}
        <span className={styles.branchMain}>
          <span className={styles.branchOrg}>{orgName ?? <EmptyValue />}</span>
          <span className={styles.branchLine}>
            <span className={styles.branchLed} aria-hidden />
            <span className={styles.branchName}>{label}</span>
          </span>
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
            <span className={styles.branchOptName}>{allLabel}</span>
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
