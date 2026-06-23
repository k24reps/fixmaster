/**
 * Verify the rebuilt landing comparison section (Fase 2): the 3-mode
 * "Cara Lama vs FixMaster vs Naik Kelas" panels that replaced the module rack +
 * screenshot gallery. Shoots the #banding section (desktop dark/light) and the
 * full landing in mobile dark to confirm the columns stack.
 *
 * Run with the dev server up:  node scripts/shoot-landing-compare.mjs
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

// Desktop dark + light — capture the comparison section only.
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.25 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const sec = page.locator('#banding');
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await sec.screenshot({ path: join(OUT, `landing-compare-${theme}.png`) });
  console.log('shot:', `landing-compare-${theme}`);
  await page.close();
}

// Mobile dark — capture the comparison section (columns should stack).
{
  const page = await browser.newPage({ viewport: { width: 390, height: 840 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, 'dark');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const sec = page.locator('#banding');
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await sec.screenshot({ path: join(OUT, 'landing-compare-mobile.png') });
  console.log('shot:', 'landing-compare-mobile');
  await page.close();
}

await browser.close();
console.log('done →', OUT);
