/**
 * Focused capture of the #1 fix: toast feedback when copying the tracking
 * link. Desktop viewport (sidebar always visible) for reliability.
 * Run with dev server up:  node scripts/shoot-pilot-toast.mjs
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
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('fixmaster-theme', 'dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
await page.waitForTimeout(800);

await page.getByRole('link', { name: /Servis/i }).first().click();
await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
await page.locator('a[href^="/services/"]').first().click();
await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
await page.waitForTimeout(500);

await page.getByRole('button', { name: /Salin tracking/i }).click();
await page.waitForTimeout(500);
// Confirm the toast text is present.
const toast = await page.getByText('Link tracking disalin').count();
console.log('toast visible:', toast > 0);
await page.screenshot({ path: join(OUT, 'pilot-copy-toast.png') });
console.log('shot: copy-toast');

await browser.close();
console.log('done →', OUT);
