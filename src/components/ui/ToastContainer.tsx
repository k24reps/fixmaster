import { createPortal } from 'react-dom';
import { useToastStore } from '@/stores/toast';
import { Icon } from './Icon';
import styles from './Toast.module.css';

const ICONS: Record<string, string> = {
  success: 'circle-check',
  error: 'circle-xmark',
  warning: 'triangle-exclamation',
  info: 'circle-info',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={[styles.toast, styles[t.tone]].join(' ')} role="status">
          <Icon name={ICONS[t.tone]} className={styles.icon} aria-hidden />
          <span className={styles.message}>{t.message}</span>
          <button className={styles.close} onClick={() => dismiss(t.id)} aria-label="Tutup">
            &times;
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
