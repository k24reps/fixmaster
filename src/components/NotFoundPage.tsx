import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <span className={styles.screw} aria-hidden />
        <span className={[styles.screw, styles.screwRight].join(' ')} aria-hidden />
        <div className={styles.readout}>
          <span className={styles.led} aria-hidden />
          <span>ROUTE DIAGNOSTIC</span>
          <strong>404 / OPEN CIRCUIT</strong>
        </div>
        <span className={styles.code}>404</span>
        <h1 className={styles.title}>Jalur halaman terputus</h1>
        <p className={styles.desc}>Alamat ini tidak terhubung ke modul FixMaster atau sudah dipindahkan.</p>
        <Link to="/" className={styles.btn}>
          <Icon name="arrow-left" aria-hidden /> Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
