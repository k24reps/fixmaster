/**
 * Screenshot generator for the landing-page menu gallery. Drives the public
 * interactive demo (/demo) — which mounts an in-memory adapter and self-seeds —
 * and captures the CONTENT AREA of each menu in dark + light, writing to
 * public/screenshots/menu-<name>-<theme>.png for the landing gallery.
 *
 * Run with the dev server up:  node scripts/shoot-menus.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Write straight into the served public folder so the landing page can use them.
const OUT = join(__dirname, '..', 'public', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:5173';

// In-app (MemoryRouter) navigation can't be reached by URL, so we click the
// sidebar links to move between menus inside the demo. `name` matches the
// landing gallery's `shot` keys.
const navTargets = [
  { label: /Dashboard|Beranda/i, name: 'dashboard' },
  { label: /Servis/i, name: 'services' },
  { label: /Kasir|POS/i, name: 'pos' },
  { label: /Inventori/i, name: 'inventory' },
  { label: /Pelanggan/i, name: 'customers' },
  { label: /Keuangan/i, name: 'finance' },
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
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
}

// Capture only the main content region (not the sidebar) for a clean gallery
// tile. Falls back to the full viewport if the selector isn't found.
async function shootContent(page, file) {
  const main = page.locator('main').first();
  if (await main.count()) {
    await main.screenshot({ path: file });
  } else {
    await page.screenshot({ path: file });
  }
}

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.5 });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await waitForDemo(page);

  // Dashboard is the landing page of the demo.
  await shootContent(page, join(OUT, `menu-dashboard-${theme}.png`));
  console.log('shot:', `menu-dashboard-${theme}`);

  for (const target of navTargets.slice(1)) {
    try {
      await page.getByRole('link', { name: target.label }).first().click();
      await page.waitForTimeout(900);
      await shootContent(page, join(OUT, `menu-${target.name}-${theme}.png`));
      console.log('shot:', `menu-${target.name}-${theme}`);
    } catch (e) {
      console.log('skip', target.name, theme, String(e).slice(0, 80));
    }
  }
  await page.close();
}

await browser.close();
console.log('done →', OUT);
