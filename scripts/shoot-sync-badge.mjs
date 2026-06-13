/**
 * Capture the realtime connection badge in its three states. The badge is
 * cloud-only (hidden in demo/local until a channel reports status), so we drive
 * it via the DEV-only `window.__realtime` store hook on the /demo route.
 * Run with dev server up:  node scripts/shoot-sync-badge.mjs
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
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('fixmaster-theme', 'dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
await page.waitForTimeout(700);

await page.waitForFunction(() => !!(window).__realtime, { timeout: 10000 });

const states = ['live', 'connecting', 'offline'];
for (const s of states) {
  await page.evaluate((status) => {
    (window).__realtime.getState().setStatus(status);
  }, s);
  await page.waitForTimeout(400);
  // Crop to the topbar so the badge is clearly visible.
  const header = page.locator('header').first();
  try {
    await header.screenshot({ path: join(OUT, `sync-badge-${s}.png`) });
    console.log(`sync badge ${s}: OK`);
  } catch (e) {
    console.log(`sync badge ${s} FAILED:`, e.message);
  }
}

await browser.close();
console.log('done →', OUT);
