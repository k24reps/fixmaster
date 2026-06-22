/**
 * Mobile global-search dropdown fix verification (via /demo).
 * Taps the collapsed search icon, types a query, shoots the results panel —
 * which must now sit full-width under the topbar without clipping labels.
 *
 * Run with the dev server up:  node scripts/shoot-search-mobile.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';

const browser = await chromium.launch();

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  try {
    await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    // The input is width:0 until focused, so click() is rejected (outside
    // viewport). Focus it directly via the DOM — that triggers the expand —
    // then type a query that matches seed data.
    await page.evaluate(() => {
      const el = document.querySelector('input[role="combobox"]');
      if (el) el.focus();
    });
    await page.waitForTimeout(250);
    await page.getByLabel('Pencarian global').fill('andi');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `search-mobile-${theme}.png`) });
    console.log('shot: search-mobile', theme);
  } catch (e) {
    console.log('demo flow error:', String(e).slice(0, 200));
    await page.screenshot({ path: join(OUT, `search-mobile-${theme}-err.png`) });
  }
  await page.close();
}

await browser.close();
console.log('done →', OUT);
