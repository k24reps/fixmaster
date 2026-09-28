import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useT } from '@/i18n';
import styles from './Modal.module.css';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
}

// Tumpukan jendela yang terbuka: hanya yang paling atas menanggapi Esc dan Tab.
// Dulu tiap jendela memasang listener sendiri di document, sehingga Esc di
// ConfirmDialog ikut menutup jendela di bawahnya beserta isian formnya.
const openStack: symbol[] = [];

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, size = 'md', children, footer }: ModalProps) {
  const t = useT();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Pemanggil sering mengirim onClose inline; lewat ref, efek di bawah tidak
  // berjalan ulang di setiap render (yang akan merebut fokus berulang-ulang).
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const pressedOverlay = useRef(false);
  // Pemicu jendela. autoFocus React memindahkan fokus ke field SEBELUM efek di
  // bawah berjalan, jadi `document.activeElement` di efek sudah field itu — dulu
  // fokus hilang ke <body> setiap jendela berfield autoFocus ditutup. Pemicunya
  // dibaca dari `relatedTarget` fokus pertama yang masuk ke dialog.
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const me = Symbol('modal');
    openStack.push(me);
    const dialog = dialogRef.current;
    // autoFocus React sudah jalan sebelum efek; jangan rebut fokus dari field itu.
    if (dialog && !dialog.contains(document.activeElement)) {
      if (document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
      dialog.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== me || !dialog) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      openStack.splice(openStack.indexOf(me), 1);
      if (openStack.length === 0) document.body.style.overflow = '';
      const opener = openerRef.current;
      openerRef.current = null;
      // Pemicu bisa ikut hilang (baris yang dihapus/dibatalkan) — sering SETELAH
      // jendela tertutup, saat datanya dimuat ulang. Fokus lalu jatuh ke <body> dan
      // Tab mulai dari atas halaman. Cadangannya: isi halaman.
      const toContent = () => document.getElementById('konten')?.focus({ preventScroll: true });
      if (opener?.isConnected) {
        opener.focus();
        const until = Date.now() + 3000;
        const watch = () => {
          if (!opener.isConnected) {
            if (document.activeElement === document.body) toContent();
          } else if (Date.now() < until) requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      } else toContent();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      // Tutup hanya bila tekan DAN lepas terjadi di latar: menyeret seleksi teks
      // dari dalam field lalu melepas di luar tidak lagi membuang form.
      onMouseDown={(e) => {
        pressedOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedOverlay.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={[styles.modal, styles[size]].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onFocusCapture={(e) => {
          const from = e.relatedTarget;
          if (!openerRef.current && from instanceof HTMLElement && !e.currentTarget.contains(from)) {
            openerRef.current = from;
          }
        }}
      >
        {title && (
          <div className={styles.header}>
            <h3 className={styles.title} id={titleId}>
              {title}
            </h3>
            <button className={styles.close} onClick={onClose} aria-label={t('common.close')}>
              <Icon name="xmark" aria-hidden />
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
