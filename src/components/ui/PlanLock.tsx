import { Link } from 'react-router-dom';
import styles from './PlanLock.module.css';

/**
 * Gerbang paket di tingkat kartu.
 *
 * Sidebar sudah punya bahasa untuk fitur terkunci — kanal diredupkan, badge
 * mono "PRO" dengan LED merek, tidak pernah gembok. Kartu Pengaturan butuh
 * gestur yang sama, dan sebelumnya belum punya: empat fitur berbayar
 * (`logo`, `waTemplates`, `exportImport`, kuota wallet) dideklarasikan di
 * plans.ts tapi tidak pernah benar-benar ditegakkan di mana pun.
 */

/** Badge "PRO" untuk slot `action` pada CardHeader. */
export function ProBadge() {
  return (
    <span className={styles.badge}>
      <span className={styles.led} aria-hidden />
      Pro
    </span>
  );
}

/**
 * Baris penjelas di dalam kartu terkunci: menyebut apa yang didapat, lalu
 * mengarah ke tab Langganan. Kalimatnya spesifik per fitur — "fitur ini
 * terkunci" tidak memberi tahu apa pun tentang alasan naik paket.
 */
export function ProNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.notice}>
      <span>{children}</span>
      <Link to="/settings?tab=langganan" className={styles.link}>
        Lihat paket Pro
      </Link>
    </p>
  );
}
