import { Button, Card, CardBody, CardHeader, Icon } from '@/components/ui';
import { DensitySwitch, ZoomGauge } from '@/components/layout/DisplayControls';
import { usePointerFine } from '@/components/layout/zoomDisplay';
import { useT } from '@/i18n';
import { useZoomStore } from '@/stores/zoom';
import styles from './DisplayCard.module.css';

/**
 * Pengaturan › Sistem › Tampilan: dua kenop yang terpisah, Pembesaran dan
 * Kerapatan (stores/zoom.ts). Untuk semua peran — setelan ini milik perangkat,
 * bukan usaha, jadi tidak tersinkron dan tidak butuh izin owner.
 *
 * Kartu "Tampilan" lama (skala font Kecil/Normal/Besar) dihapus karena
 * bertabrakan dengan zoom; yang ini justru antarmuka zoom itu sendiri.
 */
export function DisplayCard() {
  const t = useT();
  const zoom = useZoomStore((s) => s.zoom);
  const resetZoom = useZoomStore((s) => s.resetZoom);
  const pointerFine = usePointerFine();

  return (
    <Card className={styles.card}>
      <CardHeader icon={<Icon name="sliders" aria-hidden />} title={t('display.title')} />
      <CardBody>
        <div className={styles.dials}>
          <section className={styles.dial} aria-labelledby="display-zoom">
            <div className={styles.dialHead}>
              <h3 id="display-zoom" className={styles.dialTitle}>
                {t('display.zoom.title')}
              </h3>
              <p className={styles.dialHint}>{t('display.zoom.hint')}</p>
            </div>
            <ZoomGauge />
            <div className={styles.dialFoot}>
              {pointerFine && (
                <span className={styles.shortcut}>
                  <span className="fm-visually-hidden">
                    {t('display.zoom.shortcut')}:{' '}
                  </span>
                  <kbd>Ctrl</kbd>
                  <kbd>Alt</kbd>
                  <span className={styles.keys} aria-hidden>
                    <kbd>=</kbd>
                    <kbd>−</kbd>
                    <kbd>0</kbd>
                  </span>
                  <span className="fm-visually-hidden">= − 0</span>
                </span>
              )}
              {/* aria-disabled, bukan disabled: tombol yang baru diklik lalu
                jadi disabled melempar fokus keyboard ke body. */}
              <Button
                variant="secondary"
                size="sm"
                className={styles.reset}
                onClick={() => zoom !== 1 && resetZoom()}
                aria-disabled={zoom === 1 || undefined}
                iconLeft={<Icon name="arrows-rotate" aria-hidden />}
              >
                {t('display.zoom.reset')}
              </Button>
            </div>
          </section>

          <section className={styles.dial} aria-labelledby="display-density">
            <div className={styles.dialHead}>
              <h3 id="display-density" className={styles.dialTitle}>
                {t('display.density.title')}
              </h3>
              <p className={styles.dialHint}>{t('display.density.hint')}</p>
            </div>
            <DensitySwitch />
            {!pointerFine && <p className={styles.note}>{t('display.density.touch')}</p>}
          </section>
        </div>

        <p className={styles.note}>{t('display.deviceNote')}</p>
      </CardBody>
    </Card>
  );
}
