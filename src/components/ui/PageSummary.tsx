import type { ReactNode } from 'react';
import styles from './PageSummary.module.css';

export type PageSummaryTone = 'info' | 'warning' | 'accent' | 'danger' | 'success';

export interface PageSummaryItem {
  label: string;
  /** Label pendek untuk ponsel, tempat empat sel berbagi satu baris. */
  short?: string;
  value: ReactNode;
  /** LED di samping angka. Kosongkan bila angkanya tidak menuntut perhatian. */
  tone?: PageSummaryTone;
  /** Sel rupiah: dua jalur, karena "Rp 13.250.000" tak muat di sel 104px. */
  wide?: boolean;
  /** Disembunyikan di ponsel, mis. nilai rupiah yang sudah ada di Laporan. */
  hideOnPhone?: boolean;
}

/**
 * Strip ringkasan halaman: satu panel, sel dipisah seam titik, label mono di
 * atas angka mono. Dulu ada empat versi (Servis, Pelanggan, Inventori,
 * Supplier) dengan jarak label–angka sampai 330px; kini satu.
 */
export function PageSummary({ items, label }: { items: PageSummaryItem[]; label: string }) {
  return (
    <dl className={styles.strip} aria-label={label}>
      {items.map((r) => (
        <div
          key={r.label}
          className={styles.cell}
          data-wide={r.wide || undefined}
          data-phone={r.hideOnPhone ? 'hide' : undefined}
        >
          <dt className={styles.label}>
            {r.short ? (
              <>
                <span className={styles.labelFull}>{r.label}</span>
                <span className={styles.labelShort}>{r.short}</span>
              </>
            ) : (
              r.label
            )}
          </dt>
          {/* LED menempel ke angka (Lit-Signal), bukan ke label: di ponsel
              label sempit dan LED-nya dulu membuat "PROSES" meluber. */}
          <dd className={styles.value}>
            {r.tone && <span className={styles.led} data-tone={r.tone} aria-hidden />}
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
