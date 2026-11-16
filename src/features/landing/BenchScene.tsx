import { useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Icon } from '@/components/ui';
import { useT, type TranslationKey } from '@/i18n';
import { useThemeStore } from '@/stores/theme';
import shots from './benchShots.json';
import styles from './BenchScene.module.css';
import type { BenchSteps, Step } from './useBenchSteps';

/**
 * Adegan landing dari LAYAR ASLI aplikasi: komputer meja penerimaan, tablet
 * teknisi, dan HP pemilik, satu langkah per tekan tombol meja. Gambarnya
 * direkam `scripts/shoot-bench-scene.mjs` dari satu sesi /demo yang
 * menjalankan alur sungguhan pada tiket FM-0008 (pasang keyboard dari stok →
 * Selesai Rp 350.000 → Lunas ke Tunai), jadi ketiga layar memperlihatkan data
 * yang sama. Kotak sorotan, kop nama toko, dan angka strip dibaca dari
 * `benchShots.json` hasil rekaman yang sama.
 *
 * Gerak: layar berganti dengan crossfade, sorotan menyala di bagian yang
 * berubah, paket sinkron melintas. Diputar sekali saat terlihat lalu berhenti;
 * reduced motion mulai dari keadaan akhir tanpa transisi.
 */

type Device = 'desk' | 'tablet' | 'phone';
type Theme = 'dark' | 'light';
type Tone = 'neutral' | 'info' | 'accent' | 'success';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ShopLabel extends Rect {
  fontPx: number;
  weight: string;
  family: string;
  color: string;
  bg: string;
}

interface DeviceShot {
  focus: Rect | null;
  shop?: ShopLabel | null;
}

interface StepShot {
  desk: DeviceShot;
  tablet: DeviceShot;
  phone: DeviceShot;
  values: { cash: string | null; ready: string | null; low: string | null };
}

interface Manifest {
  ticket: string;
  devices: Record<Device, { w: number; h: number; out: number[] }>;
  steps: Record<Theme, StepShot>[];
}

const MANIFEST = shots as Manifest;
const STEPS: Step[] = [0, 1, 2, 3];

const DEVICES: { key: Device; label: TranslationKey; screen: TranslationKey }[] = [
  { key: 'desk', label: 'landing.scene.deviceDesk', screen: 'landing.scene.screenDesk' },
  { key: 'tablet', label: 'landing.scene.deviceTablet', screen: 'landing.scene.screenTablet' },
  { key: 'phone', label: 'landing.scene.devicePhone', screen: 'landing.scene.screenPhone' },
];

const ACTION: Record<Step, TranslationKey> = {
  0: 'landing.scene.actionInstall',
  1: 'landing.scene.actionDone',
  2: 'landing.scene.actionPay',
  3: 'landing.scene.actionReplay',
};

/** Label tuts strip ponsel: versi pendek dari ACTION supaya muat satu baris di 320px. */
const STRIP_ACTION: Record<Step, TranslationKey> = {
  0: 'landing.strip.install',
  1: 'landing.strip.done',
  2: 'landing.strip.pay',
  3: 'landing.strip.replay',
};

const NOTICE: Record<Step, TranslationKey> = {
  0: 'landing.scene.noticeIdle',
  1: 'landing.scene.noticeInstall',
  2: 'landing.scene.noticeDone',
  3: 'landing.scene.noticePay',
};

const TONE: Record<Step, Tone> = { 0: 'neutral', 1: 'info', 2: 'accent', 3: 'success' };

const RAIL: TranslationKey[] = [
  'landing.scene.railPart',
  'landing.scene.railDone',
  'landing.scene.railPaid',
];

function shotSrc(theme: Theme, device: Device, step: Step, width?: number): string {
  return `/bench/${theme}/${device}-${step}${width ? `-${width}` : ''}.webp`;
}

const pct = (r: Rect): CSSProperties => ({
  left: `${r.x}%`,
  top: `${r.y}%`,
  width: `${r.w}%`,
  height: `${r.h}%`,
});

/**
 * Teks yang berganti per langkah dirender bertumpuk di satu sel grid; hanya
 * yang aktif terlihat. Lebar dan tingginya selalu milik isi terbesar, jadi
 * pergantian tidak menggeser tata letak.
 */
function Stack({ items, current }: { items: { key: string; node: ReactNode }[]; current: string }) {
  return (
    <span className={styles.stack}>
      {items.map((item) =>
        item.key === current ? (
          <span key={item.key} data-on="true">
            {item.node}
          </span>
        ) : (
          <span key={item.key} aria-hidden="true">
            {item.node}
          </span>
        ),
      )}
    </span>
  );
}

interface ScreenProps {
  device: Device;
  theme: Theme;
  step: Step;
  /** Bitmask langkah yang gambarnya sudah boleh dimuat (lihat BenchScene). */
  loaded: number;
  alt: string;
  shopName: string;
}

function Screen({ device, theme, step, loaded, alt, shopName }: ScreenProps) {
  const size = MANIFEST.devices[device];
  const shot = MANIFEST.steps[step][theme][device];
  const wide = size.out.length > 1;
  const shop = shot.shop;
  return (
    <div className={styles.screen} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
      {STEPS.filter((s) => s === step || loaded & (1 << s)).map((s) => (
        <img
          key={`${theme}-${s}`}
          className={styles.shot}
          src={shotSrc(theme, device, s)}
          srcSet={
            wide
              ? `${shotSrc(theme, device, s, size.out[1])} ${size.out[1]}w, ${shotSrc(theme, device, s)} ${size.out[0]}w`
              : undefined
          }
          sizes={wide ? '(max-width: 720px) 100vw, 62vw' : undefined}
          width={size.w}
          height={size.h}
          alt={s === step ? alt : ''}
          aria-hidden={s === step ? undefined : true}
          data-on={s === step ? 'true' : undefined}
          decoding="async"
          loading="lazy"
        />
      ))}
      {shop && shopName && (
        // Nama toko pengunjung ditimpakan tepat di kop toko pada layar (posisi,
        // ukuran, warna, dan latar diukur saat rekaman), supaya kop ikut nama
        // yang diketik di gerbang.
        <span
          className={styles.shopMask}
          aria-hidden
          style={{
            ...pct(shop),
            color: shop.color,
            background: shop.bg,
            fontFamily: shop.family,
            fontWeight: Number(shop.weight),
            fontSize: `calc(${shop.fontPx} * 100cqw / ${size.w})`,
          }}
        >
          {shopName}
        </span>
      )}
      {shot.focus && step > 0 && (
        <span key={`${theme}-${step}`} className={styles.focus} style={pct(shot.focus)} aria-hidden />
      )}
    </div>
  );
}

interface BenchSceneProps {
  /** Nama toko dari gerbang; kosong = nama toko contoh di layar. */
  shopName: string;
  bench: BenchSteps;
  sceneRef: RefObject<HTMLDivElement | null>;
}

export function BenchScene({ shopName, bench, sceneRef }: BenchSceneProps) {
  const t = useT();
  const theme: Theme = useThemeStore((s) => s.theme) === 'light' ? 'light' : 'dark';
  const { step, byUser, advance, visible } = bench;
  // Gambar dimuat bertahap: langkah sekarang dan langkah yang akan tampil
  // sesudah tombol ditekan, hanya selagi adegan terlihat. Yang sudah dimuat
  // tetap di DOM supaya crossfade punya kedua gambar. Dulu keempat langkah
  // ketiga perangkat diminta sekaligus (±0,5–0,6 MB).
  const [loaded, setLoaded] = useState(0);
  if (visible) {
    const want = loaded | (1 << step) | (1 << (step === 3 ? 0 : step + 1));
    if (want !== loaded) setLoaded(want);
  }

  return (
    <div className={styles.wrap} data-tone={TONE[step]}>
      <div ref={sceneRef} className={styles.rig} data-step={step}>
        {DEVICES.map((device) => (
          <figure
            key={device.key}
            className={styles.device}
            data-device={device.key}
            aria-label={t(device.label)}
          >
            <div className={styles.bezel}>
              <Screen
                device={device.key}
                theme={theme}
                step={step}
                loaded={loaded}
                alt={t(device.screen)}
                shopName={shopName}
              />
            </div>
            <figcaption className={styles.deviceLabel}>
              <span className={styles.deviceLed} aria-hidden />
              {t(device.label)}
            </figcaption>
          </figure>
        ))}
        {/* Jejak sinkron di antara komputer meja dan perangkat lain. */}
        <span className={styles.sync} aria-hidden>
          <span className={styles.syncLine} />
          {step > 0 && <span key={step} className={styles.syncPacket} />}
          <span className={styles.syncLabel}>{t('landing.scene.sync')}</span>
        </span>
      </div>

      <div className={styles.console}>
        <p className={styles.notice} aria-live={byUser ? 'polite' : 'off'}>
          <span className={styles.noticeLed} aria-hidden />
          <Stack
            current={String(step)}
            items={STEPS.map((s) => ({ key: String(s), node: t(NOTICE[s]) }))}
          />
        </p>
        <ol className={styles.rail} aria-label={t('landing.scene.railLabel')}>
          {RAIL.map((label, i) => (
            <li key={label} data-on={step > i ? 'true' : undefined} aria-current={step === i + 1 ? 'step' : undefined}>
              <i aria-hidden />
              {t(label)}
              <span className="fm-visually-hidden">
                {', '}
                {step > i ? t('landing.scene.railDoneSr') : t('landing.scene.railPendingSr')}
              </span>
            </li>
          ))}
        </ol>
        <button className={styles.action} type="button" onClick={advance}>
          <Icon name={step === 3 ? 'repeat' : 'lightning'} aria-hidden />
          <Stack current={ACTION[step]} items={STEPS.map((s) => ({ key: ACTION[s], node: t(ACTION[s]) }))} />
        </button>
      </div>

      <p className={styles.caption}>
        <span className={styles.captionTag}>{t('landing.scene.sample')}</span>
        {t('landing.scene.caption')}
      </p>
    </div>
  );
}

/** Angka strip: stok dari seed (3 → 2), margin = Rp 350.000 − modal Rp 180.000, kas dari Dashboard rekaman. */
function stripReadout(step: Step): { label: TranslationKey; value: string } {
  const cash = MANIFEST.steps[3].dark.values.cash ?? '';
  switch (step) {
    case 0:
      return { label: 'landing.scene.readStock', value: '3' };
    case 1:
      return { label: 'landing.scene.readStock', value: '2' };
    case 2:
      return { label: 'landing.scene.readMargin', value: 'Rp 170.000' };
    default:
      return { label: 'landing.scene.readCash', value: cash };
  }
}

interface BenchStripProps {
  shopName: string;
  bench: BenchSteps;
  stripRef: RefObject<HTMLDivElement | null>;
}

/**
 * Strip sinkron di layar sempit: tuts meja → jejak → satu readout ponsel, di
 * antara judul dan gerbang, supaya bukti terlihat sebelum pengunjung diminta
 * nomor WA. Memakai keadaan yang sama dengan adegan penuh di bawah gerbang.
 */
export function BenchStrip({ shopName, bench, stripRef }: BenchStripProps) {
  const t = useT();
  const { step, advance } = bench;
  const shop = shopName || t('landing.scene.shopPlaceholder');
  const readout = stripReadout(step);

  return (
    <div
      ref={stripRef}
      className={styles.strip}
      data-tone={TONE[step]}
      role="group"
      aria-label={t('landing.strip.label')}
    >
      <span className={styles.stripTag} aria-hidden>
        {t('landing.strip.sample')}
      </span>

      <span className={styles.stripIcon} data-place="desk">
        <Icon name="shop" aria-hidden />
      </span>
      <span className={styles.stripShop}>
        <strong>{shop}</strong>
        <small>{t('landing.strip.desk')}</small>
      </span>
      <button className={styles.stripKey} type="button" onClick={advance}>
        <Icon name={step === 3 ? 'repeat' : 'lightning'} aria-hidden />
        <Stack
          current={STRIP_ACTION[step]}
          items={STEPS.map((s) => ({ key: STRIP_ACTION[s], node: t(STRIP_ACTION[s]) }))}
        />
      </button>

      <span className={styles.stripTrace} aria-hidden>
        {step > 0 && <span key={step} className={styles.stripPacket} />}
      </span>

      <span className={styles.stripIcon} data-place="phone">
        <Icon name="device-mobile" aria-hidden />
      </span>
      <span className={styles.stripReadoutLabel}>
        <span className={styles.readoutLed} aria-hidden />
        <span>
          {t(readout.label)}
          <span className="fm-visually-hidden">{`, ${t('landing.strip.phone')}`}</span>
        </span>
      </span>
      <span className={styles.stripValue}>{readout.value}</span>
    </div>
  );
}
