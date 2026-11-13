import { create } from 'zustand';

/**
 * Cara cetak nota di PERANGKAT ini, bukan pengaturan toko: HP kasir Android
 * butuh "kirim gambar ke aplikasi printer", komputer tetap dialog cetak.
 */
export type PrintMode = 'dialog' | 'share';

const KEY = 'fixmaster-print-mode';

function read(): PrintMode {
  try {
    return window.localStorage.getItem(KEY) === 'share' ? 'share' : 'dialog';
  } catch {
    return 'dialog';
  }
}

interface PrintModeState {
  mode: PrintMode;
  setMode: (mode: PrintMode) => void;
}

export const usePrintModeStore = create<PrintModeState>((set) => ({
  mode: typeof window === 'undefined' ? 'dialog' : read(),
  setMode: (mode) => {
    try {
      window.localStorage.setItem(KEY, mode);
    } catch {
      // Penyimpanan diblokir: pilihan tetap berlaku sampai halaman dimuat ulang.
    }
    set({ mode });
  },
}));
