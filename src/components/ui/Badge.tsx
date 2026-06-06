import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
}

export function Badge({ children, tone = 'neutral', dot, icon }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone]].join(' ')}>
      {dot && <span className={styles.dot} aria-hidden />}
      {icon}
      {children}
    </span>
  );
}
