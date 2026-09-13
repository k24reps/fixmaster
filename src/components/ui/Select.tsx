import { forwardRef, useId } from 'react';
import { Icon } from '@/components/ui';
import type { SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, id, ...rest },
  ref,
) {
  const autoId = useId(); // lihat Input: label tanpa id tidak pernah terhubung
  const selectId = id ?? rest.name ?? autoId;
  return (
    <div className={styles.group}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      )}
      <div className={[styles.wrap, error ? styles.hasError : ''].join(' ')}>
        <select
          ref={ref}
          id={selectId}
          className={[styles.select, className ?? ''].join(' ')}
          aria-invalid={!!error}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className={`${styles.chevron}`} aria-hidden />
      </div>
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : (
        hint && <span className={styles.hint}>{hint}</span>
      )}
    </div>
  );
});
