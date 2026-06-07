import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import styles from './LegalLayout.module.css';

interface LegalLayoutProps {
  title: string;
  /** Short one-line summary shown under the title. */
  intro: string;
  /** ISO date string of last update, e.g. '2026-06-07'. */
  updated: string;
  children: ReactNode;
}

/**
 * Shared shell for public legal pages (Privacy, Terms). Standalone routes (no
 * auth) so they can be linked from the signup consent, the payment gateway,
 * and app store listings. Uses design tokens → dark/light automatic.
 */
export function LegalLayout({ title, intro, updated, children }: LegalLayoutProps) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link to="/" className={styles.brand}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
          <span className={styles.brandWord}>FixMaster</span>
        </Link>
        <Link to="/" className={styles.backLink}>
          <Icon name="arrow-left" aria-hidden /> Beranda
        </Link>
      </header>

      <main className={styles.container}>
        <span className={styles.kicker}>Dokumen Legal</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        <p className={styles.updated}>
          Terakhir diperbarui:{' '}
          {new Date(updated).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>

        <div className={styles.prose}>{children}</div>

        <div className={styles.crossLinks}>
          <Link to="/privacy" className={styles.crossLink}>
            <Icon name="shield-halved" aria-hidden /> Kebijakan Privasi
          </Link>
          <Link to="/terms" className={styles.crossLink}>
            <Icon name="file-invoice" aria-hidden /> Syarat &amp; Ketentuan
          </Link>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} FixMaster</span>
        <span className={styles.footNote}>Manajemen usaha reparasi gadget &amp; elektronik</span>
      </footer>
    </div>
  );
}
