import { useThemeStore } from '@/stores/theme';
import { Icon } from '@/components/ui';
import { useSettingsStore } from '@/stores/settings';
import { useT } from '@/i18n';
import { GlobalSearch } from './GlobalSearch';
import styles from './Topbar.module.css';

interface TopbarProps {
  title: string;
  subtitle?: string;
  onToggleMobile: () => void;
}

export function Topbar({ title, subtitle, onToggleMobile }: TopbarProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
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
        <GlobalSearch />

        <button
          className={styles.langBtn}
          onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
          aria-label={t('settings.language')}
          title={language === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
        >
          {language === 'id' ? 'ID' : 'EN'}
        </button>

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
