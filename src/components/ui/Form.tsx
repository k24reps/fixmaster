import type { ReactNode } from 'react';
import styles from './Form.module.css';

/**
 * Shared form primitives for modals — replaces repeated inline styles
 * and gives every form the same "instrument panel" rhythm.
 */

/** Vertical stack of form fields with consistent spacing. */
export function FormFields({ children }: { children: ReactNode }) {
  return <div className={styles.fields}>{children}</div>;
}

/** Two-column field row that collapses to one column on small screens. */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

/**
 * Inline validation message styled as a fault readout: a pulsing red LED
 * + message on a danger-toned plate. Renders nothing when empty.
 */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className={styles.error} role="alert">
      <span className={styles.errorLed} aria-hidden />
      <span>{children}</span>
    </div>
  );
}
