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
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

async function waitForDemo(page) {
  // The faceplate "MODE DEMO" appears once the seed completes.
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
}

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.5 });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await waitForDemo(page);
  await page.screenshot({ path: join(OUT, `demo-dashboard-${theme}.png`) });
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
