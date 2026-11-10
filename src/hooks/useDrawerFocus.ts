import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { FOCUSABLE_SELECTOR, trapTarget } from '@/lib/focusTrap';

interface DrawerFocusOptions {
  /** Laci sedang tampil sebagai laci (lebar laci) DAN terbuka. */
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /** Tombol pembuka laci: tujuan fokus saat laci ditutup. */
  returnRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

// jsdom tak punya checkVisibility (dan tak punya tata letak): di sana semua
// elemen dianggap tampak. Di browser, tombol yang di-`display: none` tak boleh
// jadi ujung daftar, sebab `focus()` padanya diam-diam gagal dan Tab bocor.
const visible = (el: HTMLElement) => el.checkVisibility?.({ visibilityProperty: true }) ?? true;

/**
 * Pengelolaan fokus laci sidebar (<=1024px). `inert` sudah menutup laci yang
 * tertutup; hook ini mengurus sisanya:
 *   - terbuka: fokus masuk ke tautan halaman aktif (atau tautan pertama), Tab
 *     berputar di dalam laci, Esc menutup;
 *   - tertutup: fokus kembali ke tombol pembuka, atau ke isi halaman bila
 *     tombolnya tak bisa difokus (di <=720px tombolnya disembunyikan).
 * Tak merebut fokus bila fokus sudah pindah ke luar laci (mis. layar melebar
 * dan laci kembali jadi rail tetap).
 */
export function useDrawerFocus({ active, containerRef, returnRef, onClose }: DrawerFocusOptions) {
  // Pemanggil mengirim onClose inline; lewat ref, efek di bawah tak berjalan
  // ulang di tiap render (yang akan merebut fokus ke tautan aktif berulang).
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    // Tombol menu tetap terpasang selama laci terbuka, jadi cukup dibaca sekali.
    const toggle = returnRef.current;
    const tabbable = () =>
      [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(visible);

    const start = container.querySelector<HTMLElement>('[aria-current="page"]') ?? tabbable()[0];
    start?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Kontrol di dalam laci (mis. menu cabang) boleh menangani Esc-nya dulu.
        if (e.defaultPrevented) return;
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = tabbable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const focused = document.activeElement;
      const index = focused instanceof HTMLElement ? items.indexOf(focused) : -1;
      // Elemen tabindex=-1 di dalam laci: biarkan browser memilih tetangganya.
      if (index < 0 && focused !== container && focused && container.contains(focused)) return;
      const to = trapTarget(items.length, index, e.shiftKey);
      if (to === null) return;
      e.preventDefault();
      items[to].focus();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const focused = document.activeElement;
      if (focused && focused !== document.body && !container.contains(focused)) return;
      toggle?.focus();
      if (document.activeElement === toggle) return;
      // Laci yang menutup sudah inert, jadi fokus di dalamnya akan jatuh ke
      // <body>. Bila layar hanya melebar (laci tak inert), fokus dibiarkan.
      if (container.hasAttribute('inert') || document.activeElement === document.body) {
        document.getElementById('konten')?.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef, returnRef]);
}
