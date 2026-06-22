/**
 * Verify the Customers page additions (22 Jun 2026): device-category filter
 * dropdown + per-card WhatsApp button. Drives the public /demo (self-seeds an
 * in-memory dataset) and shoots the Customers content area in dark + light.
 *
 * Run with the dev server up:  node scripts/shoot-cust-wa.mjs
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

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  await page.getByRole('link', { name: /Pelanggan/i }).first().click();
  await page.waitForTimeout(1000);

  const main = page.locator('main').first();
  await (await main.count() ? main : page).screenshot({ path: join(OUT, `cust-wa-${theme}.png`) });
  console.log('shot:', `cust-wa-${theme}`);
  await page.close();
}

await browser.close();
console.log('done →', OUT);
