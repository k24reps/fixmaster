/**
 * Dashboard redesign verification shots. Seeds data, then captures the
 * full dashboard in dark + light (desktop) and dark (mobile).
 *
 * Run:  BASE_URL=http://localhost:5173 node scripts/shoot-dashboard.mjs
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

async function ready(page, theme) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });
  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  await page.waitForTimeout(700);
}

async function shoot(name, theme, width) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: 1100 });
  await ready(page, theme);
  // Ensure we're on the dashboard (default route '/').
  await page.click('aside a[href="/"]').catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('shot:', name);
  await ctx.close();
}

await shoot('dash3-dark', 'dark', 1440);
await shoot('dash3-light', 'light', 1440);
await shoot('dash3-mobile', 'dark', 430);

await browser.close();
console.log('done');
