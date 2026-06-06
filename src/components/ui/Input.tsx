import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode, ChangeEvent } from 'react';
import styles from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  iconLeft?: ReactNode;
  /**
   * Disable auto-capitalization of the first letter. Use for fields where the
   * user controls casing (e.g. the onboarding wizard, codes, usernames).
   */
  noAutoCap?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, iconLeft, className, id, noAutoCap, type, onChange, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;

  // Auto-capitalize the first letter for free-text fields. Skipped where casing
  // matters (email/tel/number/password) and when explicitly opted out. Only the
  // first character is changed, so the caret position is preserved.
  const autoCap = !noAutoCap && (!type || type === 'text' || type === 'search');

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (autoCap) {
      const v = e.target.value;
      if (v && v[0] !== v[0].toUpperCase()) {
        e.target.value = v[0].toUpperCase() + v.slice(1);
      }
    }
    onChange?.(e);
  };

  return (
    <div className={styles.group}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={[styles.wrap, error ? styles.hasError : ''].join(' ')}>
        {iconLeft && <span className={styles.icon}>{iconLeft}</span>}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={[styles.input, iconLeft ? styles.withIcon : '', className ?? ''].join(' ')}
          aria-invalid={!!error}
          onChange={handleChange}
          {...rest}
        />
      </div>
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : (
        hint && <span className={styles.hint}>{hint}</span>
      )}
    </div>
  );
});
