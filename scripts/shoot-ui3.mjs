/**
 * Capture the two UI changes:
 *  1) Servis page — colored Biaya/Modal/Profit cols, clickable status, Update Status pill
 *  2) Kasir page — tabs (Kasir / Transaksi Terakhir)
 * Run with dev server up:  node scripts/shoot-ui3.mjs
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('fixmaster-theme', 'dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
await page.waitForTimeout(700);

// ---- Servis page ----
await page.getByRole('link', { name: /Servis/i }).first().click();
await page.waitForSelector('table', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'ui3-services.png'), fullPage: true });
const updateBtns = await page.getByRole('button', { name: /Update status servis/i }).count();
const cost = await page.locator('[class*="cost"]').count();
const modal = await page.locator('[class*="modal"]').count();
console.log('services | update pills:', updateBtns, '| cost spans:', cost, '| modal spans:', modal);

// ---- Kasir page ----
await page.getByRole('link', { name: /Kasir/i }).first().click();
await page.waitForSelector('[role="tablist"]', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'ui3-kasir-pos.png'), fullPage: true });
const tabs = await page.locator('[role="tab"]').count();
console.log('kasir | tabs:', tabs);

// click the history tab
const histTab = page.getByRole('tab', { name: /Transaksi Terakhir/i });
if (await histTab.count()) {
  await histTab.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'ui3-kasir-history.png'), fullPage: true });
  console.log('history tab clicked & shot');
} else {
  console.log('history tab not present (not manager?)');
}

await browser.close();
console.log('done ->', OUT);
