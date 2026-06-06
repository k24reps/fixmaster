import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './StatCard.module.css';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  trend?: { value: string; positive: boolean };
}

export function StatCard({ label, value, icon, tone = 'brand', trend }: StatCardProps) {
  return (
    <div className={[styles.card, styles[tone]].join(' ')}>
      <div className={styles.iconWrap}>{icon}</div>
      <div className={styles.info}>
        <p className={styles.label}>{label}</p>
        <h3 className={styles.value}>{value}</h3>
        {trend && (
          <span className={[styles.trend, trend.positive ? styles.up : styles.down].join(' ')}>
            <Icon name={trend.positive ? 'arrow-up' : 'arrow-down'} aria-hidden />
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
