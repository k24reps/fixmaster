/**
 * Rekam layar ASLI aplikasi untuk adegan landing (BenchScene): komputer dan HP
 * yang menampilkan menu yang sama. Satu sesi /demo (data contoh dari
 * src/dev/seed.ts) membuka tiap halaman inti di lebar desktop, memotretnya,
 * lalu mengganti ukuran jendela ke HP dan memotret halaman yang sama. Karena
 * sesinya satu, angka di kedua layar pasti sama.
 *
 *   detail     Detail Servis FM-0008 (layar awal)
 *   dashboard  Dashboard          /
 *   services   Servis             /services
 *   pos        Kasir & Stok       /pos
 *   customers  Pelanggan          /customers
 *   finance    Keuangan           /finance
 *   reports    Laporan            /reports
 *
 * Keluaran:
 *   public/bench/<tema>/<halaman>-desk.webp (1600px) + -desk-800.webp
 *   public/bench/<tema>/<halaman>-phone.webp (585px)
 *   src/features/landing/benchShots.json: ukuran layar, kotak tiap tautan menu
 *     di sidebar desktop dan bottom nav HP (jadi area klik di landing), kop nama
 *     toko (untuk menimpakan nama yang diketik pengunjung), dan warna latar
 *     sidebar (untuk meredupkan menu yang tidak direkam).
 *
 * Faceplate "MODE DEMO" disembunyikan: ia bingkai demo, bukan bagian aplikasi.
 * Landing tetap memberi label "data contoh".
 *
 * Jalankan dengan dev server hidup (gerbang demo dilewati otomatis untuk
 * navigator.webdriver di dev):
 *   BASE_URL=http://localhost:5173 node scripts/shoot-bench-scene.mjs
 * Rekam ulang bila tampilan salah satu halaman di atas, sidebar, bottom nav,
 * atau seed demo berubah.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:5183';
const TICKET = 'FM-0008';

const DESK = { w: 1280, h: 800, out: [1600, 800] };
const PHONE = { w: 390, h: 844, out: [585] };

const PAGES = [
  { key: 'detail', path: null },
  { key: 'dashboard', path: '/' },
  { key: 'services', path: '/services' },
  { key: 'pos', path: '/pos' },
  { key: 'customers', path: '/customers' },
  { key: 'finance', path: '/finance' },
  { key: 'reports', path: '/reports' },
];

const HIDE_FACEPLATE = `
  [class*="_demoRoot_"] { --app-inset-top: 14px !important; }
  [class*="_demoRoot_"] > header { display: none !important; }
  *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
`;

async function scrollTop(page) {
  await page.evaluate(() => {
    document.querySelector('[class*="_demoStage_"]')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    // Kolom cari Kasir fokus otomatis; cincin fokusnya bukan bagian tampilan diam.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

/** Navigasi lewat sidebar desktop (MemoryRouter demo tidak bisa dibuka lewat URL). */
async function goto(page, path) {
  await page.locator(`aside nav[aria-label="Navigasi utama"] a[href="${path}"]`).first().click();
  await page.waitForTimeout(800);
  await scrollTop(page);
}

async function openTicket(page) {
  await goto(page, '/services');
  await page.getByText(TICKET, { exact: true }).first().click();
  await page.waitForTimeout(900);
  await scrollTop(page);
}

/**
 * Kotak tiap tautan menu dalam persen ukuran layar, dipotong ke wadah navnya
 * (tautan yang tergulir keluar daftar tidak dijadikan area klik).
 */
async function navRects(page, navSelector) {
  return page.evaluate((sel) => {
    const nav = document.querySelector(sel);
    if (!nav) return {};
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let clip = nav.getBoundingClientRect();
    for (let n = nav; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if (o === 'auto' || o === 'scroll' || o === 'hidden') {
        clip = n.getBoundingClientRect();
        break;
      }
    }
    const r = (n) => Math.round(n * 1000) / 10;
    const out = {};
    for (const a of nav.querySelectorAll('a[href]')) {
      const b = a.getBoundingClientRect();
      if (!b.width || b.top < clip.top - 1 || b.bottom > clip.bottom + 1) continue;
      out[a.getAttribute('href')] = {
        x: r(b.left / vw),
        y: r(b.top / vh),
        w: r(b.width / vw),
        h: r(b.height / vh),
        label: (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim(),
      };
    }
    return out;
  }, navSelector);
}

/** Kop nama toko di sidebar desktop + latar sidebar, untuk ditimpa/diredupkan di landing. */
async function sidebarStyle(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const r = (n) => Math.round(n * 1000) / 10;
    const bgOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      }
      return 'transparent';
    };
    const el = document.querySelector('[class*="_branchOrg_"]');
    const nav = document.querySelector('aside nav[aria-label="Navigasi utama"]');
    let shop = null;
    if (el) {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      shop = {
        x: r(b.left / vw),
        y: r(b.top / vh),
        w: r(b.width / vw),
        h: r(b.height / vh),
        fontPx: parseFloat(cs.fontSize),
        weight: cs.fontWeight,
        family: cs.fontFamily,
        color: cs.color,
        bg: bgOf(el),
      };
    }
    return { shop, railBg: nav ? bgOf(nav) : 'transparent' };
  });
}

/** PNG → WebP di lebar tertentu lewat kanvas browser (tanpa alat tambahan). */
async function toWebp(converter, png, width) {
  return converter.evaluate(
    async ({ b64, width }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const height = Math.round((img.height * width) / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/webp', 0.82).split(',')[1];
    },
    { b64: png.toString('base64'), width },
  );
}

async function save(converter, png, dir, name, widths) {
  for (const w of widths) {
    const suffix = widths.length > 1 && w !== widths[0] ? `-${w}` : '';
    const webp = await toWebp(converter, png, w);
    writeFileSync(join(dir, `${name}${suffix}.webp`), Buffer.from(webp, 'base64'));
  }
}

async function run(browser, converter, theme, manifest) {
  const outDir = join(ROOT, 'public', 'bench', theme);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const ctx = await browser.newContext({
    viewport: { width: DESK.w, height: DESK.h },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.getByText('MODE DEMO').waitFor({ timeout: 30000 });
  await page.addStyleTag({ content: HIDE_FACEPLATE });
  await page.waitForTimeout(1500);

  const entry = {};
  for (const pg of PAGES) {
    await page.setViewportSize({ width: DESK.w, height: DESK.h });
    await page.waitForTimeout(300);
    if (pg.path === null) await openTicket(page);
    else await goto(page, pg.path);
    if (pg.key === 'detail') {
      entry.deskNav = await navRects(page, 'aside nav[aria-label="Navigasi utama"]');
      Object.assign(entry, await sidebarStyle(page));
    }
    await save(converter, await page.screenshot({ type: 'png' }), outDir, `${pg.key}-desk`, DESK.out);

    // Rute MemoryRouter bertahan saat jendela diganti; halaman yang sama tampil
    // dengan tata letak HP (bottom nav).
    await page.setViewportSize({ width: PHONE.w, height: PHONE.h });
    await page.waitForTimeout(900);
    await scrollTop(page);
    // Detail Servis di HP memakai bilah aksi, bukan bottom nav: ukur di Dashboard.
    if (pg.key === 'dashboard') {
      entry.phoneNav = await navRects(page, 'nav[aria-label="Navigasi utama seluler"]');
    }
    await save(converter, await page.screenshot({ type: 'png' }), outDir, `${pg.key}-phone`, PHONE.out);
    console.log(`  ${theme} ${pg.key}`);
  }
  manifest.themes[theme] = entry;
  await ctx.close();
}

const browser = await chromium.launch();
const converter = await (await browser.newContext()).newPage();
const manifest = {
  ticket: TICKET,
  pages: PAGES.map((p) => ({ key: p.key, path: p.path })),
  devices: { desk: DESK, phone: PHONE },
  themes: {},
};
for (const theme of (process.env.THEMES || 'dark,light').split(',')) {
  console.log(`tema ${theme}`);
  await run(browser, converter, theme, manifest);
}
writeFileSync(
  join(ROOT, 'src', 'features', 'landing', 'benchShots.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
const count = readdirSync(join(ROOT, 'public', 'bench')).length;
console.log(`selesai: ${count} tema di public/bench + src/features/landing/benchShots.json`);
await browser.close();
