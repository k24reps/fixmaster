import { useEffect, useRef, useState, type RefObject } from 'react';
import { useThemeStore } from '@/stores/theme';
import { useZoomStore } from '@/stores/zoom';
import { ZoomAnnouncer } from './DisplayControls';
import { zoomPercent, zoomTone } from './zoomDisplay';
import { Icon } from '@/components/ui';
import { useRealtimeStore } from '@/stores/realtime';
import { useSessionStore } from '@/stores/session';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { demoGuard } from '@/stores/demo';
import { isSupabaseConfigured } from '@/data/supabase-client';
import { useT } from '@/i18n';
import styles from './Topbar.module.css';

const ROLE_LABEL: Record<string, Record<string, string>> = {
  id: { owner: 'Pemilik', admin: 'Admin', karyawan: 'Karyawan' },
  en: { owner: 'Owner', admin: 'Admin', karyawan: 'Staff' },
};

interface TopbarProps {
  title: string;
  subtitle?: string;
  onToggleMobile: () => void;
  /** Keadaan laci sidebar, untuk aria-expanded; ref-nya dipakai laci untuk
      mengembalikan fokus ke tombol ini saat ditutup. */
  mobileOpen: boolean;
  drawerId: string;
  toggleRef: RefObject<HTMLButtonElement | null>;
}

const SYNC_LABEL: Record<'connecting' | 'live' | 'offline', string> = {
  connecting: 'SYNC…',
  live: 'LIVE',
  offline: 'OFFLINE',
};

/**
 * Bench-style realtime connection indicator: a status LED + mono readout.
 * Only rendered in cloud mode once a channel has reported status (`active`),
 * so local/demo sessions stay clean. Mirrors the "Live Diagnostic Rail" motif.
 */
function SyncBadge() {
  const status = useRealtimeStore((s) => s.status);
  const active = useRealtimeStore((s) => s.active);
  if (!active) return null;
  return (
    <span
      className={styles.sync}
      data-status={status}
      title={
        status === 'live'
          ? 'Sinkron realtime aktif'
          : status === 'connecting'
            ? 'Menyambungkan ke server…'
            : 'Koneksi terputus, mencoba sambung ulang'
      }
    >
      <span className={styles.syncLed} aria-hidden />
      <span className={styles.syncText}>{SYNC_LABEL[status]}</span>
    </span>
  );
}

/**
 * Penanda pembesaran: hanya muncul saat tampilan TIDAK di 100%, supaya
 * pengguna yang membandingkan layar dengan rekan tahu sebabnya dan bisa
 * kembali dengan satu klik. Mengatur level ada di Pengaturan › Sistem ›
 * Tampilan, menu Lainnya, dan pintasan Ctrl+Alt + = / − / 0. Di 100% topbar
 * tidak membawa kontrol yang jarang dipakai.
 */
function ZoomChip() {
  const t = useT();
  const zoom = useZoomStore((s) => s.zoom);
  const resetZoom = useZoomStore((s) => s.resetZoom);
  if (zoom === 1) return null;
  const pct = zoomPercent(zoom);
  return (
    <button
      type="button"
      className={styles.zoomChip}
      data-tone={zoomTone(zoom)}
      onClick={resetZoom}
      aria-label={`${t('display.zoom.title')} ${pct}. ${t('display.zoom.reset')}`}
      title={t('display.zoom.reset')}
    >
      <span className={styles.zoomLed} aria-hidden />
      <span className={styles.zoomPct}>{pct}</span>
      <Icon name="arrows-rotate" className={styles.zoomReset} aria-hidden />
    </button>
  );
}

/**
 * Akun: avatar membuka nama, peran, dan Keluar. Dulu kartu pengguna di dasar
 * sidebar; dipindah ke sini supaya rail hanya berisi navigasi dan unit usaha.
 * Di ponsel (≤720px) disembunyikan: Keluar sudah ada di menu "Lainnya".
 */
function AccountMenu() {
  const employee = useSessionStore((s) => s.currentEmployee);
  const signOut = useSessionStore((s) => s.signOutEmployee);
  const authSignOut = useAuthStore((s) => s.signOut);
  const language = useSettingsStore((s) => s.language);
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!employee) return null;
  const role = ROLE_LABEL[language][employee.role];

  // Cloud: true sign-out of the Supabase account (→ AuthPage).
  // Local: switch user (re-enter PIN) — there is no cloud account.
  const handleLogout = () => {
    setOpen(false);
    if (demoGuard('Keluar dinonaktifkan di demo. Daftar gratis untuk memakai akun Anda sendiri.')) return;
    if (isSupabaseConfigured) void authSignOut();
    else signOut();
  };

  return (
    <div className={styles.account} ref={ref}>
      <button
        type="button"
        className={[styles.iconBtn, styles.accountBtn].join(' ')}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Akun ${employee.name}`}
        title={`${employee.name} · ${role}`}
      >
        <span className={styles.avatar}>
          {employee.name.charAt(0).toUpperCase()}
          <span className={styles.onlineLed} aria-hidden />
        </span>
      </button>
      {open && (
        <div className={styles.accountMenu} role="menu">
          <div className={styles.accountHead}>
            <strong className={styles.accountName}>{employee.name}</strong>
            <small className={styles.accountRole}>{role}</small>
          </div>
          <button type="button" role="menuitem" className={styles.accountItem} onClick={handleLogout}>
            <Icon name="right-from-bracket" aria-hidden />
            {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({
  title,
  subtitle,
  onToggleMobile,
  mobileOpen,
  drawerId,
  toggleRef,
}: TopbarProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const t = useT();

  return (
    <header className={styles.topbar}>
      <button
        ref={toggleRef}
        className={styles.mobileToggle}
        onClick={onToggleMobile}
        aria-label="Menu"
        aria-expanded={mobileOpen}
        aria-controls={drawerId}
      >
        <Icon name="bars" aria-hidden />
      </button>

      <div className={styles.titleWrap}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <div className={styles.actions}>
        <SyncBadge />

        {/* Language toggle removed: only ~5% of UI text is wired to i18n, so
            switching to English produced a jarring mixed-language UI. Re-add
            when the app is actually translated (see [[i18n coverage]]). */}

        <ZoomChip />
        <ZoomAnnouncer />

        <button
          className={styles.iconBtn}
          onClick={toggleTheme}
          aria-label={t('settings.theme')}
          title={theme === 'dark' ? t('settings.theme.light') : t('settings.theme.dark')}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
        </button>

        <button className={styles.iconBtn} aria-label="Notifikasi">
          <Icon name="bell" aria-hidden />
          <span className={styles.notifDot} />
        </button>

        <AccountMenu />
      </div>
    </header>
  );
}
