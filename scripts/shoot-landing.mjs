/**
 * Screenshot probe for the public marketing landing page (signed-out).
 * Captures full-page + key sections, desktop dark/light + mobile.
 * Run with the dev server up:  node scripts/shoot-landing.mjs
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.25 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.waitForTimeout(500);
  // Full page
  await page.screenshot({ path: join(OUT, `landing-full-${theme}.png`), fullPage: true });
  // Above-the-fold (hero)
  await page.screenshot({ path: join(OUT, `landing-hero-${theme}.png`) });
  console.log('shot:', `landing-${theme}`);
  // The product/demo section specifically (poster-only, no iframe).
  try {
    const demo = page.locator('#product');
    await demo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await demo.screenshot({ path: join(OUT, `landing-demo-${theme}.png`) });
    console.log('shot:', `landing-demo-${theme}`);
  } catch (e) {
    console.log('skip demo', theme, String(e).slice(0, 80));
  }
  await page.close();
}

// Mobile (dark) full page
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await m.goto(BASE, { waitUntil: 'networkidle' });
await setTheme(m, 'dark');
await m.waitForTimeout(500);
await m.screenshot({ path: join(OUT, 'landing-mobile.png'), fullPage: true });
console.log('shot:', 'landing-mobile');
await m.close();

await browser.close();
console.log('done →', OUT);
