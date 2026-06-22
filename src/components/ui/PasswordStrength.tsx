import { scorePassword } from '@/lib/business/password';
import styles from './PasswordStrength.module.css';

interface PasswordStrengthProps {
  password: string;
}

const CRITERIA: { key: 'length' | 'letter' | 'digit' | 'symbol'; label: string }[] = [
  { key: 'length', label: 'Min. 8 karakter' },
  { key: 'letter', label: 'Huruf' },
  { key: 'digit', label: 'Angka' },
  { key: 'symbol', label: 'Simbol (bonus)' },
];

/**
 * Password strength readout for signup / reset — styled as a bench diagnostic,
 * not a generic SaaS bar: a 4-segment tick-gauge, a mono level readout with a
 * status LED, and per-criterion check chips. The symbol criterion is a *bonus*
 * (stronger), not a hard requirement.
 */
export function PasswordStrength({ password }: PasswordStrengthProps) {
  const { checks, passed, level, label } = scorePassword(password);
  if (!password) return null;

  return (
    <div className={styles.root} data-level={level}>
      <div className={styles.head}>
        <span className={styles.led} aria-hidden />
        <span className={styles.readoutKey}>KEKUATAN</span>
        <span className={styles.dots} aria-hidden />
        <span className={styles.readoutVal}>{label}</span>
      </div>

      <div className={styles.gauge} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={[styles.tick, i < passed ? styles.tickOn : ''].join(' ')} />
        ))}
      </div>

      <ul className={styles.criteria}>
        {CRITERIA.map((c) => (
          <li
            key={c.key}
            className={[styles.crit, checks[c.key] ? styles.critOk : ''].join(' ')}
          >
            <span className={styles.critMark} aria-hidden>
              {checks[c.key] ? '✓' : '·'}
            </span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
