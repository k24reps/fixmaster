import { useThemeStore } from '@/stores/theme';
import { useZoomStore, ZOOM_LEVELS } from '@/stores/zoom';
import { Icon } from '@/components/ui';
import { useRealtimeStore } from '@/stores/realtime';
import { useT } from '@/i18n';
import styles from './Topbar.module.css';

interface TopbarProps {
  title: string;
  subtitle?: string;
  onToggleMobile: () => void;
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
            : 'Koneksi terputus — mencoba sambung ulang'
      }
    >
      <span className={styles.syncLed} aria-hidden />
      <span className={styles.syncText}>{SYNC_LABEL[status]}</span>
    </span>
  );
}

/**
 * Zoom aplikasi: kurang / readout / tambah. Readout mono-persen sengaja
 * ditampilkan permanen — di bahasa visual "Precision Electronics Bench"
 * sebuah kontrol tanpa angka terbaca setengah jadi, dan pengguna perlu tahu
 * ia sedang tidak di 100% saat membandingkan tampilan dengan orang lain.
 */
function ZoomControl() {
  const zoom = useZoomStore((s) => s.zoom);
  const stepZoom = useZoomStore((s) => s.stepZoom);
  const min = zoom === ZOOM_LEVELS[0];
  const max = zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

  return (
    <div className={styles.zoom} role="group" aria-label="Zoom tampilan">
      <button
        className={styles.zoomBtn}
        onClick={() => stepZoom(-1)}
        disabled={min}
        aria-label="Perkecil tampilan"
        title="Perkecil tampilan"
      >
        <Icon name="minus" aria-hidden />
      </button>
      <span className={styles.zoomValue} aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <button
        className={styles.zoomBtn}
        onClick={() => stepZoom(1)}
        disabled={max}
        aria-label="Perbesar tampilan"
        title="Perbesar tampilan"
      >
        <Icon name="plus" aria-hidden />
      </button>
    </div>
  );
}

export function Topbar({ title, subtitle, onToggleMobile }: TopbarProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const t = useT();

  return (
    <header className={styles.topbar}>
      <button className={styles.mobileToggle} onClick={onToggleMobile} aria-label="Menu">
        <Icon name="bars" aria-hidden />
      </button>

      <div className={styles.titleWrap}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <div className={styles.actions}>
        <SyncBadge />

        {/* Language toggle removed: only ~5% of UI text is wired to i18n, so
            switching to English produced a jarring mixed-language UI. Re-add
            when the app is actually translated (see [[i18n coverage]]). */}

        <ZoomControl />

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
      </div>
    </header>
  );
}
