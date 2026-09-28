import { useEffect, useState } from 'react';
import { readScreenLock } from '@/data/serviceSecret';
import { useT } from '@/i18n';
import type { Service } from '@/data/types';
import styles from './ServiceDetailPage.module.css';

/**
 * Kunci layar di detail tiket: tersamar sampai diminta, hilang sendiri setelah
 * 30 detik, dan hanya bisa dibuka teknisi yang ditugaskan atau owner/admin
 * (server menolak yang lain — `canView` hanya menyembunyikan tombolnya).
 * Setelah unit diambil, yang tersisa hanya jejak bahwa kunci pernah diberikan.
 */
export function ScreenLockReadout({ service, canView }: { service: Service; canView: boolean }) {
  const t = useT();
  const [shown, setShown] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (shown === null) return;
    const id = window.setTimeout(() => setShown(null), 30_000);
    return () => window.clearTimeout(id);
  }, [shown]);

  if (!service.secretKind) return null;
  const kind = t(`serviceForm.lock_${service.secretKind}`);

  if (service.pickedUp || gone) {
    return (
      <span className={styles.lockGone}>
        {kind} · {t(service.pickedUp ? 'serviceDetail.lockPurged' : 'serviceDetail.lockMissing')}
      </span>
    );
  }
  if (!canView) {
    return (
      <span className={styles.lockGone}>
        {kind} · {t('serviceDetail.lockRestricted')}
      </span>
    );
  }

  const reveal = async () => {
    setBusy(true);
    setError('');
    try {
      const lock = await readScreenLock(service);
      if (lock) setShown(lock.secret);
      else setGone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('serviceDetail.lockFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={styles.lockRow}>
      <span className={styles.lockValue}>
        {kind} {shown ?? '••••'}
      </span>
      <button
        type="button"
        className={styles.lockBtn}
        onClick={() => (shown === null ? void reveal() : setShown(null))}
        disabled={busy}
      >
        {t(shown === null ? 'serviceDetail.lockShow' : 'serviceDetail.lockHide')}
      </button>
      {error && <span className={styles.lockError}>{error}</span>}
    </span>
  );
}
