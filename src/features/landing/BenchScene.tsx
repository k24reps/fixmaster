import { useState, type CSSProperties } from 'react';
import { Icon } from '@/components/ui';
import { useT, type TranslationKey } from '@/i18n';
import { interpolate } from '@/lib/business/notify';
import { useThemeStore } from '@/stores/theme';
import shots from './benchShots.json';
import styles from './BenchScene.module.css';

/**
 * Adegan landing dari LAYAR ASLI aplikasi: komputer dan HP yang selalu
 * menampilkan menu yang sama. Awalnya keduanya membuka Detail Servis FM-0008;
 * mengklik menu di sidebar komputer, di bottom nav HP, atau di deret tombol di
 * bawahnya memindahkan KEDUA layar bersamaan. Gambarnya direkam
 * `scripts/shoot-bench-scene.mjs` dari satu sesi /demo (desktop lalu HP per
 * halaman), jadi angka di kedua layar sama. Kotak area klik, kop nama toko,
 * dan latar sidebar dibaca dari `benchShots.json` hasil rekaman yang sama.
 *
 * Hanya menu inti yang direkam; menu lain di sidebar diredupkan dan, bila
 * diklik, menawarkan demo lengkap.
 */

type Device = 'desk' | 'phone';
type Theme = 'dark' | 'light';
type PageKey = 'detail' | 'dashboard' | 'services' | 'pos' | 'customers' | 'finance' | 'reports';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface NavRect extends Rect {
  label: string;
}

interface ShopLabel extends Rect {
  fontPx: number;
  weight: string;
  family: string;
  color: string;
  bg: string;
}

interface ThemeShots {
  deskNav: Record<string, NavRect>;
  phoneNav: Record<string, NavRect>;
  shop: ShopLabel | null;
  railBg: string;
}

interface Manifest {
  devices: Record<Device, { w: number; h: number; out: number[] }>;
  themes: Record<Theme, ThemeShots>;
}

const MANIFEST = shots as Manifest;

const PAGES: { key: PageKey; label: TranslationKey; path: string | null }[] = [
  { key: 'detail', label: 'landing.scene.pageDetail', path: null },
  { key: 'dashboard', label: 'nav.dashboard', path: '/' },
  { key: 'services', label: 'nav.services', path: '/services' },
  { key: 'pos', label: 'nav.pos', path: '/pos' },
  { key: 'customers', label: 'nav.customers', path: '/customers' },
  { key: 'finance', label: 'nav.finance', path: '/finance' },
  { key: 'reports', label: 'nav.reports', path: '/reports' },
];

const PAGE_BY_PATH = new Map(PAGES.filter((p) => p.path).map((p) => [p.path as string, p.key]));

/** Menu sidebar yang tidak direkam: diredupkan, klik menawarkan demo lengkap. */
const OTHER_MENUS: Record<string, TranslationKey> = {
  '/calculator': 'nav.calculator',
  '/suppliers': 'nav.suppliers',
  '/tasks': 'nav.tasks',
  '/attendance': 'nav.attendance',
  '/activity': 'nav.activity',
  '/settings': 'nav.settings',
};

const DEVICES: { key: Device; label: TranslationKey }[] = [
  { key: 'desk', label: 'landing.scene.deviceDesk' },
  { key: 'phone', label: 'landing.scene.devicePhone' },
];

function shotSrc(theme: Theme, page: PageKey, device: Device, width?: number): string {
  return `/bench/${theme}/${page}-${device}${width ? `-${width}` : ''}.webp`;
}

const pct = (r: Rect): CSSProperties => ({
  left: `${r.x}%`,
  top: `${r.y}%`,
  width: `${r.w}%`,
  height: `${r.h}%`,
});

interface BenchSceneProps {
  /** Nama toko dari gerbang; kosong = nama toko contoh di layar. */
  shopName: string;
}

export function BenchScene({ shopName }: BenchSceneProps) {
  const t = useT();
  const theme: Theme = useThemeStore((s) => s.theme) === 'light' ? 'light' : 'dark';
  const themeShots = MANIFEST.themes[theme];
  // `want`: halaman yang diminta. `shown`: halaman yang tampil. Layar baru
  // berganti setelah gambar komputer DAN HP-nya termuat, supaya kedua layar
  // selalu berpindah bersamaan.
  const [want, setWant] = useState<PageKey>('detail');
  const [shown, setShown] = useState<PageKey>('detail');
  const [requested, setRequested] = useState<PageKey[]>(['detail']);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [byUser, setByUser] = useState(false);
  const [offer, setOffer] = useState<{ path: string; label: TranslationKey } | null>(null);

  const isReady = (page: PageKey) =>
    loaded.has(`${theme}-${page}-desk`) && loaded.has(`${theme}-${page}-phone`);
  if (want !== shown && isReady(want)) setShown(want);

  // Diperiksa di dalam updater: arahkan-lalu-klik terjadi sebelum render ulang,
  // jadi `requested` di closure bisa basi dan halaman masuk dua kali.
  const request = (page: PageKey) =>
    setRequested((list) => (list.includes(page) ? list : [...list, page]));

  const go = (page: PageKey) => {
    request(page);
    setWant(page);
    setByUser(true);
    setOffer(null);
  };

  const markLoaded = (id: string) =>
    setLoaded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  const pageLabel = (key: PageKey) => t(PAGES.find((p) => p.key === key)!.label);

  const screen = (device: Device) => {
    const size = MANIFEST.devices[device];
    const wide = size.out.length > 1;
    const nav = device === 'desk' ? themeShots.deskNav : themeShots.phoneNav;
    const deviceName = t(DEVICES.find((d) => d.key === device)!.label);
    return (
      <div className={styles.screen} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
        {requested.map((page) => {
          const id = `${theme}-${page}-${device}`;
          const on = page === shown;
          return (
            <img
              key={id}
              ref={(img) => {
                // Gambar dari cache bisa sudah selesai sebelum onLoad terpasang.
                if (img?.complete && img.naturalWidth > 0) markLoaded(id);
              }}
              className={styles.shot}
              src={shotSrc(theme, page, device)}
              srcSet={
                wide
                  ? `${shotSrc(theme, page, device, size.out[1])} ${size.out[1]}w, ${shotSrc(theme, page, device)} ${size.out[0]}w`
                  : undefined
              }
              sizes={wide ? '(max-width: 720px) 100vw, 70vw' : undefined}
              width={size.w}
              height={size.h}
              alt={on ? interpolate(t('landing.scene.screenAlt'), { page: pageLabel(page), device: deviceName }) : ''}
              aria-hidden={on ? undefined : true}
              data-on={on ? 'true' : undefined}
              decoding="async"
              loading="lazy"
              onLoad={() => markLoaded(id)}
            />
          );
        })}

        {device === 'desk' && themeShots.shop && shopName && (
          // Nama toko pengunjung ditimpakan tepat di kop toko pada layar (posisi,
          // ukuran, warna, dan latar diukur saat rekaman).
          <span
            className={styles.shopMask}
            aria-hidden
            style={{
              ...pct(themeShots.shop),
              color: themeShots.shop.color,
              background: themeShots.shop.bg,
              fontFamily: themeShots.shop.family,
              fontWeight: Number(themeShots.shop.weight),
              fontSize: `calc(${themeShots.shop.fontPx} * 100cqw / ${size.w})`,
            }}
          >
            {shopName}
          </span>
        )}

        {/* Area klik di atas menu pada gambar. Untuk keyboard dan pembaca
            layar, jalurnya deret tombol di bawah adegan, jadi area ini tidak
            ikut urutan Tab. */}
        {Object.entries(nav).map(([path, rect]) => {
          const page = PAGE_BY_PATH.get(path);
          const other = OTHER_MENUS[path];
          if (!page && !other) return null;
          return (
            <button
              key={path}
              type="button"
              tabIndex={-1}
              aria-hidden
              className={styles.hotspot}
              data-other={other ? 'true' : undefined}
              style={{ ...pct(rect), ...(other ? { background: themeShots.railBg } : {}) }}
              onPointerEnter={() => page && request(page)}
              onClick={() => (page ? go(page) : setOffer({ path, label: other }))}
            />
          );
        })}

        {device === 'desk' && offer && nav[offer.path] && (
          <p
            className={styles.offer}
            style={{ left: `${nav[offer.path].x + nav[offer.path].w + 1}%`, top: `${nav[offer.path].y}%` }}
          >
            <span>{interpolate(t('landing.scene.moreInDemo'), { menu: t(offer.label) })}</span>
            <a href="#coba" onClick={() => setOffer(null)}>
              {t('landing.scene.openDemo')} <Icon name="arrow-up" aria-hidden />
            </a>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.rig}>
        {DEVICES.map((device) => (
          <figure key={device.key} className={styles.device} data-device={device.key} aria-label={t(device.label)}>
            <div className={styles.bezel}>{screen(device.key)}</div>
            <figcaption className={styles.deviceLabel}>
              <span className={styles.deviceLed} aria-hidden />
              {t(device.label)}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className={styles.menu} role="group" aria-label={t('landing.scene.menuLabel')}>
        {PAGES.map((page) => (
          <button
            key={page.key}
            type="button"
            className={styles.menuKey}
            aria-pressed={page.key === want}
            data-loading={page.key === want && want !== shown ? 'true' : undefined}
            onPointerEnter={() => request(page.key)}
            onFocus={() => request(page.key)}
            onClick={() => go(page.key)}
          >
            <span className={styles.menuLed} aria-hidden />
            {t(page.label)}
          </button>
        ))}
      </div>
      <p className="fm-visually-hidden" aria-live={byUser ? 'polite' : 'off'}>
        {byUser ? interpolate(t('landing.scene.showing'), { page: pageLabel(shown) }) : ''}
      </p>

      <p className={styles.caption}>
        <span className={styles.captionTag}>{t('landing.scene.sample')}</span>
        {t('landing.scene.caption')}
      </p>
    </div>
  );
}
