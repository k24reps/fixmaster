import styles from './AuthGate.module.css';

export function AuthSplash() {
  return (
    <div className={styles.splash}>
      <div className={styles.logoMark}>
        <img src="/logo-volt.svg" alt="FixMaster" width="64" height="64" />
      </div>
      <div className={styles.spinner} aria-label="Memuat" />
    </div>
  );
}
