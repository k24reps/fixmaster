import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { useT } from '@/i18n';
import type { TermId } from '@/features/glossary/terms';
import styles from './Term.module.css';

/**
 * Istilah akuntansi yang bisa diklik: garis bawah titik + ⓘ kecil, membuka
 * entrinya di Kamus Istilah (/istilah#id). Jangan dipakai di dalam tautan lain
 * (anchor bersarang tidak sah) — beri tautan "?" di sebelahnya saja.
 */
export function Term({ id, children }: { id: TermId; children: ReactNode }) {
  const t = useT();
  return (
    <Link to={`/istilah#${id}`} className={styles.term}>
      {children}
      <Icon name="info-circle" className={styles.mark} aria-hidden />
      <span className="fm-visually-hidden">{` — ${t('glossary.explain')}`}</span>
    </Link>
  );
}
