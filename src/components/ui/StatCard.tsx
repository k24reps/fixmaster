import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  trend?: { value: string; positive: boolean };
}

/**
 * One neutral readout. There is deliberately no `tone`: each card used to get
 * its own signal color (spine, tinted icon), so a green meant "Selesai" in one
 * card and nothing in the next. Status belongs to `trend`, which carries a value.
 */
export function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <div className={styles.card}>
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
