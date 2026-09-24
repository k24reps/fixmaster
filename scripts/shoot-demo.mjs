/**
 * Screenshot probe for the public interactive demo (/demo). The route mounts
 * an in-memory adapter and self-seeds, so no external seeding is needed.
 * Captures the full-screen demo across pages (desktop dark+light) + mobile.
 * Run with the dev server up:  node scripts/shoot-demo.mjs
 */
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
const PUBLIC_OUT = join(__dirname, '..', 'public', 'screenshots');
mkdirSync(OUT, { recursive: true });
mkdirSync(PUBLIC_OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:5173';

// In-app (MemoryRouter) navigation can't be reached by URL, so we click the
// sidebar to move between menus inside the demo.
const navTargets = [
  { label: /Dashboard|Beranda/i, name: 'dashboard' },
  { label: /Servis/i, name: 'services' },
  { label: /Laporan/i, name: 'reports' },
  { label: /Pengaturan/i, name: 'settings' },
];

const browser = await chromium.launch();

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    // The demo must still present itself at 100%, even when this origin has a
    // denser app preference saved from a previous session.
    localStorage.setItem('fixmaster-zoom', '0.8');
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

async function waitForDemo(page) {
  // The faceplate "MODE DEMO" appears once the seed completes.
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  // Dashboard aggregates settle just after the shell. Waiting for the hero
  // readout prevents public proof images from catching an empty instrument.
  await page.getByText(/Rp\s*5\.100\.000/).waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);

  const surface = await page.evaluate(() => {
    const shell = document.querySelector('#root > div');
    const ambient = getComputedStyle(document.body, '::before');
    return {
      hasDemoClass: document.body.classList.contains('fm-demo-active'),
      shellBackground: shell ? getComputedStyle(shell).backgroundColor : null,
      ambientOpacity: ambient.opacity,
      ambientImage: ambient.backgroundImage,
      zoom: getComputedStyle(document.documentElement).zoom,
    };
  });

  const gridVisible = surface.ambientImage.includes('linear-gradient');
  if (
    !surface.hasDemoClass ||
    surface.shellBackground !== 'rgba(0, 0, 0, 0)' ||
    surface.ambientOpacity !== '0.72' ||
    // Demo mem-pin kepadatan desktop (`deviceDensityZoom`, 80% di perangkat
    // pointer presisi — lihat DESIGN.md "12px Floor Rule"). Yang dijaga di sini
    // adalah zoom tersimpan pengguna TIDAK bocor ke foto publik, bukan angka 1.
    !['1', '0.8'].includes(surface.zoom) ||
    !gridVisible
  ) {
    throw new Error(`Demo surface regression: ${JSON.stringify(surface)}`);
  }
}

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.5 });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await waitForDemo(page);
  const dashboardFile = `demo-dashboard-${theme}.png`;
  const dashboardPath = join(OUT, dashboardFile);
  await page.screenshot({ path: dashboardPath });
  copyFileSync(dashboardPath, join(PUBLIC_OUT, dashboardFile));
  console.log('shot:', `demo-dashboard-${theme}`);

  for (const target of navTargets.slice(1)) {
    try {
      await page.getByRole('link', { name: target.label }).first().click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(OUT, `demo-${target.name}-${theme}.png`) });
      console.log('shot:', `demo-${target.name}-${theme}`);
    } catch (e) {
      console.log('skip', target.name, theme, String(e).slice(0, 80));
    }
  }
  await page.close();
}

// Landing product proof: real mobile viewport in both themes. Keep this to one
// viewport (not full-page) so the bottom navigation remains clearly visible.
for (const theme of ['dark', 'light']) {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await m.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await setTheme(m, theme);
  await m.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await waitForDemo(m);
  const mobileFile = `demo-mobile-${theme}.png`;
  const publicPath = join(PUBLIC_OUT, mobileFile);
  await m.screenshot({ path: publicPath });
  copyFileSync(publicPath, join(OUT, mobileFile));
  console.log('shot:', `demo-mobile-${theme}`);
  await m.close();
}

await browser.close();
console.log('done →', OUT);
