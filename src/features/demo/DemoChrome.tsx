import { Icon } from '@/components/ui';
import { exitDemoToSignup } from '@/stores/demo';
import styles from './DemoChrome.module.css';

interface DemoChromeProps {
  onReset: () => void;
}

/**
 * Persistent demo faceplate that sits above the running app. Styled as a bench
 * instrument header (live status LED + mono readout) rather than a generic SaaS
 * banner. Always offers the two demo affordances: re-seed ("Reset Demo") and
 * the conversion CTA ("Daftar Gratis"), which breaks out of the iframe when
 * embedded on the landing page.
 */
export function DemoChrome({ onReset }: DemoChromeProps) {
  return (
    <header className={styles.bar}>
      <span className={styles.screw} aria-hidden />

      <div className={styles.status}>
        <span className={styles.led} aria-hidden />
        <span className={styles.statusText}>MODE DEMO</span>
        <span className={styles.statusSub}>data contoh · tidak tersimpan</span>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.resetBtn} onClick={onReset}>
          <Icon name="repeat" aria-hidden />
          <span>Reset Demo</span>
        </button>
        <button type="button" className={styles.signupBtn} onClick={exitDemoToSignup}>
          <span className={styles.signupLed} aria-hidden />
          Daftar Gratis
        </button>
      </div>

      <span className={[styles.screw, styles.screwRight].join(' ')} aria-hidden />
    </header>
  );
}
