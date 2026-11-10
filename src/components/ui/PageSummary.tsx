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
  /** Sel jadi tombol saring: angkanya sekaligus pintu ke daftarnya. */
  onSelect?: () => void;
  /** Saringan yang sedang aktif (aria-pressed). */
  pressed?: boolean;
}

/**
 * Strip ringkasan halaman: satu panel, sel dipisah seam titik, label mono di
 * atas angka mono. Dulu ada empat versi (Servis, Pelanggan, Inventori,
 * Supplier) dengan jarak label–angka sampai 330px; kini satu.
 *
 * Bila ada sel yang bisa diketuk, strip jadi grup tombol (dt/dd tak boleh
 * berisi tombol), dengan tampilan yang sama.
 */
export function PageSummary({ items, label }: { items: PageSummaryItem[]; label: string }) {
  const labelOf = (r: PageSummaryItem) =>
    r.short ? (
      <>
        <span className={styles.labelFull}>{r.label}</span>
        <span className={styles.labelShort}>{r.short}</span>
      </>
    ) : (
      r.label
    );
  // LED menempel ke angka (Lit-Signal), bukan ke label: di ponsel label
  // sempit dan LED-nya dulu membuat "PROSES" meluber.
  const valueOf = (r: PageSummaryItem) => (
    <>
      {r.tone && <span className={styles.led} data-tone={r.tone} aria-hidden />}
      {r.value}
    </>
  );
  const cellProps = (r: PageSummaryItem) => ({
    'data-wide': r.wide || undefined,
    'data-phone': r.hideOnPhone ? 'hide' : undefined,
  });

  if (items.some((r) => r.onSelect)) {
    return (
      <div className={styles.strip} role="group" aria-label={label}>
        {items.map((r) =>
          r.onSelect ? (
            <button
              key={r.label}
              type="button"
              className={[styles.cell, styles.cellBtn].join(' ')}
              aria-pressed={!!r.pressed}
              onClick={r.onSelect}
              {...cellProps(r)}
            >
              <span className={styles.label}>{labelOf(r)}</span>
              <span className={styles.value}>{valueOf(r)}</span>
            </button>
          ) : (
            <div key={r.label} className={styles.cell} {...cellProps(r)}>
              <span className={styles.label}>{labelOf(r)}</span>
              <span className={styles.value}>{valueOf(r)}</span>
            </div>
          ),
        )}
      </div>
    );
  }

  return (
    <dl className={styles.strip} aria-label={label}>
      {items.map((r) => (
        <div key={r.label} className={styles.cell} {...cellProps(r)}>
          <dt className={styles.label}>{labelOf(r)}</dt>
          <dd className={styles.value}>{valueOf(r)}</dd>
        </div>
      ))}
    </dl>
  );
}
