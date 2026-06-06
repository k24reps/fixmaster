/**
 * POS "Register Readout" verification — seeds data, opens POS, fills the cart
 * by clicking product cards, then screenshots the register/receipt so we can
 * confirm the LCD total, perforated receipt, and mechanical keys render.
 *
 * Run with dev server up:  node scripts/shoot-pos.mjs
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

async function capture({ name, theme, width = 1440, height = 1100, fill = true }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Always start at desktop width so the sidebar nav link is reachable.
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);

  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });

  // Navigate to POS via the sidebar (client-side, keeps the session alive).
  await page.waitForSelector('a[href="/pos"]', { timeout: 10000 });
  await page.click('a[href="/pos"]');

  // Wait for product cards, then add a few to the cart.
  await page.waitForSelector('button[class*="productCard"]', { timeout: 10000 });
  if (fill) {
    const cards = await page.$$('button[class*="productCard"]');
    // Click first card x2 (qty bump) + two more distinct products.
    if (cards[0]) { await cards[0].click(); await cards[0].click(); }
    if (cards[1]) await cards[1].click();
    if (cards[2]) await cards[2].click();
    await page.waitForTimeout(500);
  }

  // Resize to the target viewport (e.g. mobile) just before capture.
  if (width !== 1440 || height !== 1100) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('shot:', name);
  await ctx.close();
}

await capture({ name: 'pos-dark', theme: 'dark' });
await capture({ name: 'pos-light', theme: 'light' });
await capture({ name: 'pos-mobile', theme: 'dark', width: 440, height: 1500 });

await browser.close();
console.log('done →', OUT);
