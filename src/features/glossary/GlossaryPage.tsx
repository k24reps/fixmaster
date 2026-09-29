import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '@/components/ui';
import { useT } from '@/i18n';
import { GLOSSARY } from './terms';
import styles from './GlossaryPage.module.css';

/**
 * Kamus Istilah — lembar data istilah akuntansi yang dipakai FixMaster.
 * Tidak di sidebar: dibuka dari istilah bergaris titik (komponen `Term`) dan
 * tombol "Kamus istilah" di Laporan & Keuangan, sehingga selalu muncul di
 * konteks istilahnya. Terbuka untuk semua peran — tidak memuat angka toko.
 */
export function GlossaryPage() {
  const t = useT();
  const { hash } = useLocation();
  const active = hash.slice(1);

  // AppLayout mengembalikan scroll ke atas saat path berganti; anchor ditangani di sini.
  useEffect(() => {
    if (!active) return;
    const el = document.getElementById(active);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.querySelector('h2')?.focus({ preventScroll: true });
  }, [active]);

  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>{t('glossary.lead')}</p>
      <nav className={styles.index} aria-label={t('glossary.indexAria')}>
        {GLOSSARY.map((g) => (
          <Link
            key={g.id}
            to={`#${g.id}`}
            className={[styles.chip, active === g.id ? styles.chipOn : ''].join(' ')}
            aria-current={active === g.id ? 'location' : undefined}
          >
            {g.term}
          </Link>
        ))}
      </nav>
      <div className={styles.sheets}>
        {GLOSSARY.map((g, i) => (
          <article
            key={g.id}
            id={g.id}
            className={[styles.sheet, active === g.id ? styles.sheetOn : ''].join(' ')}
            aria-labelledby={`${g.id}-title`}
          >
            <header className={styles.head}>
              <span className={styles.led} aria-hidden />
              <span className={styles.code}>{`TERM-${String(i + 1).padStart(2, '0')}`}</span>
              <h2 id={`${g.id}-title`} className={styles.term} tabIndex={-1}>
                {g.term}
              </h2>
            </header>
            <p className={styles.short}>{g.short}</p>
            <p className={styles.body}>{g.body}</p>
            {g.formula && (
              <div className={styles.readout}>
                <span className={styles.readoutKey}>{t('glossary.formula')}</span>
                <code>{g.formula}</code>
              </div>
            )}
            <div className={styles.example}>
              <span className={styles.readoutKey}>{t('glossary.example')}</span>
              <p>{g.example}</p>
            </div>
            <div className={styles.seen}>
              <span className={styles.readoutKey}>{t('glossary.seenIn')}</span>
              {g.seenIn.map((s) => (
                <Link key={s.to} to={s.to} className={styles.seenLink}>
                  {s.label} <Icon name="arrow-right" aria-hidden />
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
