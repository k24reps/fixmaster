import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, ChangeEvent } from 'react';
import { capitalizeFirst, capitalizeWords } from '@/lib/text';
import { Icon } from './Icon';
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
  /**
   * Capitalize the first letter of EVERY word instead of just the first letter.
   * Use for proper-noun fields (customer/device/product/supplier names) so
   * "budi santoso" → "Budi Santoso". Ignored when `noAutoCap` is set or for
   * non-text input types.
   */
  autoCapWords?: boolean;
  /**
   * Add a show/hide toggle button (eye icon) for password fields. Toggles the
   * rendered input type between `password` and `text` without changing the
   * controlled value.
   */
  revealable?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, iconLeft, className, id, noAutoCap, autoCapWords, revealable, type, onChange, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  const [revealed, setRevealed] = useState(false);

  // Auto-capitalize free-text fields. Skipped where casing matters
  // (email/tel/number/password) and when explicitly opted out. Only changed
  // characters are replaced, so the caret position is preserved.
  const autoCap = !noAutoCap && (!type || type === 'text' || type === 'search');

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (autoCap) {
      const capped = autoCapWords ? capitalizeWords(e.target.value) : capitalizeFirst(e.target.value);
      if (capped !== e.target.value) e.target.value = capped;
    }
    onChange?.(e);
  };

  // When revealable, we control the rendered type ourselves (password ↔ text).
  const renderType = revealable ? (revealed ? 'text' : 'password') : type;

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
          type={renderType}
          className={[
            styles.input,
            iconLeft ? styles.withIcon : '',
            revealable ? styles.withReveal : '',
            className ?? '',
          ].join(' ')}
          aria-invalid={!!error}
          onChange={handleChange}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Sembunyikan password' : 'Tampilkan password'}
            title={revealed ? 'Sembunyikan password' : 'Tampilkan password'}
            tabIndex={-1}
          >
            <Icon name={revealed ? 'eye-slash' : 'eye'} aria-hidden />
          </button>
        )}
      </div>
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : (
        hint && <span className={styles.hint}>{hint}</span>
      )}
    </div>
  );
});
