/**
 * Generic page verification shots — seeds, navigates to a route via the
 * sidebar (client-side, keeps the session + cache), captures dark/light/mobile.
 *
 * Run:  ROUTE=/inventory NAME=inv node scripts/shoot-page.mjs
 *       ROUTE=/ NAME=dashboard node scripts/shoot-page.mjs   (index route)
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const ROUTE = process.env.ROUTE || '/';
const NAME = process.env.NAME || 'page';
// A selector that must be present after navigation, to confirm the page rendered.
const READY = process.env.READY || '';

const browser = await chromium.launch();

async function capture({ name, theme, width = 1440, height = 1100 }) {
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

  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  if (ROUTE !== '/') {
    await page.click(`a[href="${ROUTE}"]`);
  }
  if (READY) await page.waitForSelector(READY, { timeout: 10000 });
  await page.waitForTimeout(800);

  if (width !== 1440 || height !== 1100) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('shot:', name);
  await ctx.close();
}

await capture({ name: `${NAME}-dark`, theme: 'dark' });
await capture({ name: `${NAME}-light`, theme: 'light' });
await capture({ name: `${NAME}-mobile`, theme: 'dark', width: 440, height: 1500 });

await browser.close();
console.log('done →', OUT);
