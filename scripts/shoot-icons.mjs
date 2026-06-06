/**
 * Icon-migration verification — seeds, then captures icon-heavy surfaces
 * (dashboard: sidebar nav, topbar, stat cards, alerts, leaderboard) so we can
 * confirm Phosphor renders everywhere. Single page, client-side nav (keeps the
 * seeded session + react-query cache alive).
 *
 * Run with dev server up:  node scripts/shoot-icons.mjs
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

async function capture({ name, theme }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);

  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });

  // Authenticated shell appears (sidebar nav) → dashboard is the index route.
  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  await page.waitForTimeout(900); // let data + icons settle

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('shot:', name);
  await ctx.close();
}

await capture({ name: 'icons-dashboard-dark', theme: 'dark' });
await capture({ name: 'icons-dashboard-light', theme: 'light' });

await browser.close();
console.log('done →', OUT);
