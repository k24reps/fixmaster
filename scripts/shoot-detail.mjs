/**
 * Service Detail screenshot probe — ROBUST single-page, client-side-nav flow.
 *
 * Why this shape: Playwright isolates storage per context, and full page
 * reloads re-bootstrap the app (losing the seeded in-memory session). So we:
 *   1) load the app once,
 *   2) wait for the self-seeded demo shell,
 *   3) navigate CLIENT-SIDE by clicking nav/links (React Router, no reload),
 *   4) resize to mobile AFTER navigating (page state stays alive).
 *
 * Run with dev server up:  node scripts/shoot-detail.mjs
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

async function capture({ name, theme, mobile }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });

  // 1) Load app, set theme.
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });

  // 2) Wait for the self-seeded demo shell.
  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });

  // 3) Client-side navigate to the services list.
  await page.click('a[href="/services"]');
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });

  // 4) Open the first ticket (client-side).
  const first = page.locator('a[href^="/services/"]').first();
  await first.click();
  await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
  await page.waitForTimeout(600);

  // 5) Mobile: resize after navigating; page state persists.
  if (mobile) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('shot:', name);
  await ctx.close();
}

await capture({ name: 'detail-dark', theme: 'dark', mobile: false });
await capture({ name: 'detail-light', theme: 'light', mobile: false });
await capture({ name: 'detail-mobile', theme: 'dark', mobile: true });

await browser.close();
console.log('done →', OUT);
