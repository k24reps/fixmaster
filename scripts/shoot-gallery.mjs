/**
 * Verify the redesigned menu showcase (#galeri) on the landing page.
 * Desktop (alternating instrument-screen rows) + mobile (stacked) in dark/light.
 *
 * Run with the dev server up:  node scripts/shoot-gallery.mjs
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

async function shootGaleri(page, name) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Wait for the showcase section and let lazy images load.
  await page.locator('#galeri').waitFor({ timeout: 10000 });
  await page.locator('#galeri').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator('#galeri').screenshot({ path: join(OUT, `${name}.png`) });
  console.log('shot:', name);
}

// Desktop dark + light.
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.25 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await shootGaleri(page, `galeri-desktop-${theme}`);
  await page.close();
}

// Mobile dark.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, 'dark');
  await shootGaleri(page, 'galeri-mobile-dark');
  await page.close();
}

await browser.close();
console.log('done →', OUT);
