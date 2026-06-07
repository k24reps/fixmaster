import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
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
          <Icon name="arrow-left" aria-hidden /> Beranda
        </Link>
      </header>

      <main className={styles.container}>
        {/* Document masthead — stamped spec-sheet header. */}
        <div className={styles.docPlate}>
          <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
          <div className={styles.docMeta}>
            <span className={styles.docCode}>DOK. {docId}</span>
            <span className={styles.docRev}>REV {rev}</span>
          </div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <dl className={styles.docSpecs}>
            <div className={styles.docSpecRow}>
              <dt>STATUS</dt>
              <dd><span className={styles.led} /> BERLAKU</dd>
            </div>
            <div className={styles.docSpecRow}>
              <dt>DASAR</dt>
              <dd>UU PDP No. 27/2022</dd>
            </div>
            <div className={styles.docSpecRow}>
              <dt>BAHASA</dt>
              <dd>Bahasa Indonesia</dd>
            </div>
          </dl>
        </div>

        <div className={styles.prose}>{children}</div>

        <div className={styles.crossLinks}>
          <Link to="/privacy" className={styles.crossLink}>
            <Icon name="shield-halved" aria-hidden /> DOK. PRIVASI-001
          </Link>
          <Link to="/terms" className={styles.crossLink}>
            <Icon name="file-invoice" aria-hidden /> DOK. SK-001
          </Link>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} FixMaster · FX-{new Date().getFullYear()}</span>
        <span className={styles.footNote}>Manajemen usaha reparasi gadget &amp; elektronik</span>
      </footer>
    </div>
  );
}
