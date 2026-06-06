import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Adds glassmorphism blur + translucent surface. */
  glass?: boolean;
  /** Adds hover lift interaction. */
  interactive?: boolean;
  /** Accent color bar on top. */
  accent?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'none';
  padding?: boolean;
}

export function Card({
  children,
  glass,
  interactive,
  accent = 'none',
  padding = false,
  className,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    glass ? styles.glass : '',
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
}

export function CardHeader({ icon, title, action }: CardHeaderProps) {
  return (
    <div className={styles.header}>
      <h3 className={styles.title}>
        {icon && <span className={styles.headerIcon}>{icon}</span>}
        {title}
      </h3>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.body, className ?? ''].join(' ')}>{children}</div>;
}
