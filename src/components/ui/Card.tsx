import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /* Prop `glass` dihapus (Nov 2026): kartu di daftar dan grid selalu padat.
     Blur kaca hanya untuk chassis (topbar, bottom nav) dan overlay, lihat
     Design System.md. Jangan dihidupkan lagi per kartu. */
  /** Adds hover lift interaction. */
  interactive?: boolean;
  /** Accent color bar on top. */
  accent?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'none';
  padding?: boolean;
}

export function Card({
  children,
  interactive,
  accent = 'none',
  padding = false,
  className,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    interactive ? styles.interactive : '',
    accent !== 'none' ? styles[`accent_${accent}`] : '',
    padding ? styles.padded : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  /**
   * Tingkat heading. Bawaan h2 karena kartu biasanya duduk langsung di bawah
   * h1 halaman; dulu selalu h3 sehingga 7 halaman melompat h1 ke h3. Pakai h3
   * hanya bila kartunya berada di bawah h2 lain.
   */
  as?: 'h2' | 'h3';
  /**
   * Kait gaya untuk kartu yang menata ulang kepalanya di lebar tertentu
   * (pratinjau Nota di ponsel: kepala jadi dok). Kelas modul Card tak bisa
   * dijangkau dari CSS modul lain, jadi tiap bagian diberi kelas tambahan.
   */
  className?: string;
  titleClassName?: string;
  actionClassName?: string;
}

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');

export function CardHeader({
  icon,
  title,
  action,
  as: Heading = 'h2',
  className,
  titleClassName,
  actionClassName,
}: CardHeaderProps) {
  return (
    <div className={join(styles.header, className)}>
      <Heading className={join(styles.title, titleClassName)}>
        {icon && <span className={styles.headerIcon}>{icon}</span>}
        {title}
      </Heading>
      {action && <div className={join(styles.action, actionClassName)}>{action}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Sasaran `aria-controls` bagi kartu yang bagian badannya bisa dilipat. */
  id?: string;
}) {
  return (
    <div id={id} className={[styles.body, className ?? ''].join(' ')}>
      {children}
    </div>
  );
}
