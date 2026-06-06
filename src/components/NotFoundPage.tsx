import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <span className={styles.code}>404</span>
        <h1 className={styles.title}>Halaman tidak ditemukan</h1>
        <p className={styles.desc}>Halaman yang Anda cari tidak ada atau telah dipindahkan.</p>
        <Link to="/" className={styles.btn}>
          <Icon name="arrow-left" aria-hidden /> Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
