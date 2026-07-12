import { useThemeStore } from '@/stores/theme';
import { Icon } from '@/components/ui';
import { useRealtimeStore } from '@/stores/realtime';
import { useT } from '@/i18n';
import { GlobalSearch } from './GlobalSearch';
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
        <GlobalSearch />

        {/* Language toggle removed: only ~5% of UI text is wired to i18n, so
            switching to English produced a jarring mixed-language UI. Re-add
            when the app is actually translated (see [[i18n coverage]]). */}

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
