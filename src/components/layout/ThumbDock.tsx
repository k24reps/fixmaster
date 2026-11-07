import type { ReactNode } from 'react';
import styles from './ThumbDock.module.css';

/**
 * Aksi utama halaman di zona jempol ponsel, tepat di atas menu bawah.
 * Hanya tampil saat menu bawah tampil (<=720px); di layar lebih lebar aksi
 * yang sama tinggal di toolbar halaman, jadi pemanggil menyembunyikan salinan
 * toolbar-nya di ponsel. Taruh di akhir halaman: pengganjal di dalamnya
 * memberi ruang supaya isi terakhir tidak tertutup dok.
 */
export function ThumbDock({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.spacer} aria-hidden />
      <div className={styles.dock}>{children}</div>
    </>
  );
}
