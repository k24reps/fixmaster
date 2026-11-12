import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { useT } from '@/i18n';
import styles from './LegalLayout.module.css';

interface LegalLayoutProps {
  title: string;
  /** Document code, e.g. 'PRIVASI-001' — stamped on the document header. */
  docId: string;
  /** Short one-line summary shown under the title. */
  intro: string;
  /** ISO date string of last update, e.g. '2026-06-07'. */
  updated: string;
  children: ReactNode;
}

/**
 * Shared shell for public legal pages (Privacy, Terms). Standalone routes (no
 * auth) so they can be linked from the signup consent, the payment gateway,
 * and app store listings.
 *
 * Signature treatment ("Precision Electronics Bench"): presented as a
 * controlled technical document — a stamped document header with code/revision,
 * a mono "specification sheet" masthead, and numbered manual-style sections.
 * Not generic prose. Token-only → dark/light automatic.
 */
export function LegalLayout({ title, docId, intro, updated, children }: LegalLayoutProps) {
  const t = useT();
  const rev = updated.replace(/-/g, '.');
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link to="/" className={styles.brand}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandWord}>FixMaster</span>
            <span className={styles.brandModel}>FX · BENCH OS</span>
          </span>
        </Link>
        <Link to="/" className={styles.backLink}>
          <Icon name="arrow-left" aria-hidden /> {t('legal.home')}
        </Link>
      </header>

      <main className={styles.container}>
        {/* Document masthead — stamped spec-sheet header. */}
        <div className={styles.docPlate}>
          <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
          <div className={styles.docMeta}>
            <span className={styles.docCode}>
              {t('legal.docPrefix')} {docId}
            </span>
            <span className={styles.docRev}>REV {rev}</span>
          </div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <dl className={styles.docSpecs}>
            <div className={styles.docSpecRow}>
              <dt>{t('legal.status')}</dt>
              <dd>
                <span className={styles.led} /> {t('legal.inForce')}
              </dd>
            </div>
            <div className={styles.docSpecRow}>
              <dt>{t('legal.basis')}</dt>
              <dd>UU PDP No. 27/2022</dd>
            </div>
            <div className={styles.docSpecRow}>
              <dt>{t('legal.language')}</dt>
              <dd>{t('legal.languageValue')}</dd>
            </div>
          </dl>
        </div>

        <div className={styles.prose}>{children}</div>

        <div className={styles.crossLinks}>
          <Link to="/privacy" className={styles.crossLink}>
            <Icon name="shield-halved" aria-hidden /> {t('legal.docPrefix')} PRIVASI-001
          </Link>
          <Link to="/terms" className={styles.crossLink}>
            <Icon name="file-invoice" aria-hidden /> {t('legal.docPrefix')} SK-001
          </Link>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} FixMaster · FX-{new Date().getFullYear()}</span>
        <span className={styles.footNote}>{t('legal.tagline')}</span>
      </footer>
    </div>
  );
}
