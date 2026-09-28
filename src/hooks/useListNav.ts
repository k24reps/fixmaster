import { useState, type KeyboardEvent } from 'react';

/**
 * Panah atas/bawah + Enter untuk daftar saran di bawah kolom ketik (pelanggan
 * di Servis Baru & Kasir). Fokus tetap di kolom ketik; `active` hanya menandai
 * baris. Enter tanpa baris aktif dibiarkan (form tetap tersimpan seperti biasa).
 */
export function useListNav(count: number, onPick: (index: number) => void) {
  const [active, setActive] = useState(-1);
  const [lastCount, setLastCount] = useState(count);
  if (count !== lastCount) {
    setLastCount(count);
    setActive(-1);
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (count === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % count);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? count - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0 && active < count) {
      e.preventDefault();
      onPick(active);
      setActive(-1);
    }
  };
  return { active, onKeyDown, reset: () => setActive(-1) };
}
