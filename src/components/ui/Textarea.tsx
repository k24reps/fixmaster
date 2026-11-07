import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes, ChangeEvent } from 'react';
import { capitalizeLines } from '@/lib/text';
import styles from './Textarea.module.css';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  /**
   * Tandai kolom ini salah tanpa mengulang pesannya di bawah kolom — pesannya
   * sudah tampil di `FormError` puncak form (lihat `useFormFault`).
   */
  invalid?: boolean;
  /**
   * Disable auto-capitalization of the first letter. Use for fields where the
   * user controls casing (e.g. message templates with {placeholders}, codes).
   */
  noAutoCap?: boolean;
}

/**
 * Multi-line text field, sibling to `Input`. Auto-capitalizes the first letter
 * of each line (skipped via `noAutoCap`) so typed data stays tidy — ideal for
 * "one item per line" lists. Characters are replaced in place, so the caret
 * position is preserved.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, invalid, className, id, noAutoCap, onChange, ...rest },
  ref,
) {
  const autoId = useId(); // lihat Input: label tanpa id tidak pernah terhubung
  const areaId = id ?? rest.name ?? autoId;
  const autoCap = !noAutoCap;

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (autoCap) {
      const capped = capitalizeLines(e.target.value);
      if (capped !== e.target.value) e.target.value = capped;
    }
    onChange?.(e);
  };

  return (
    <div className={styles.group}>
      {label && (
        <label className={styles.label} htmlFor={areaId}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        className={[styles.area, error || invalid ? styles.hasError : '', className ?? ''].join(' ')}
        aria-invalid={!!error || !!invalid}
        onChange={handleChange}
        {...rest}
      />
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : (
        hint && <span className={styles.hint}>{hint}</span>
      )}
    </div>
  );
});
