/**
 * Visual verification for Paket 6 (3 UX fixes):
 *   - AuthPage signup: password strength indicator + reveal toggle
 *   - ServiceModal (via /demo): customer quick-suggest dropdown + reveal eye
 *
 * Run with the dev server up:  node scripts/shoot-paket6.mjs
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

// ---------- AuthPage signup: strength + reveal (dark) ----------
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 820 }, deviceScaleFactor: 1.25 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`${BASE}/?auth=1`, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.waitForTimeout(500);
  try {
    await page.getByText('Terminal Akses').waitFor({ timeout: 8000 });
    // Switch to signup mode.
    await page.getByRole('button', { name: 'Daftar' }).first().click();
    await page.waitForTimeout(400);
    // Type a medium-strength password to light up the gauge.
    await page.locator('input[name="password"]').fill('Abcd1234');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `paket6-signup-${theme}.png`) });
    console.log('shot: signup', theme);
  } catch (e) {
    console.log('auth flow error:', String(e).slice(0, 160));
    await page.screenshot({ path: join(OUT, `paket6-signup-${theme}-err.png`) });
  }
  await page.close();
}

// ---------- ServiceModal quick-suggest via /demo (dark) ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.25 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await setTheme(page, 'dark');
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  try {
    await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page.getByRole('link', { name: /Servis/i }).first().click();
    await page.waitForTimeout(700);
    // Open "Servis Baru".
    await page.getByRole('button', { name: /Servis Baru/i }).first().click();
    await page.waitForTimeout(500);
    // Type a partial name to trigger the suggestion dropdown.
    await page.locator('input').first().fill('a');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, 'paket6-service-suggest.png') });
    console.log('shot: service-suggest');
  } catch (e) {
    console.log('demo flow error:', String(e).slice(0, 200));
    await page.screenshot({ path: join(OUT, 'paket6-service-err.png') });
  }
  await page.close();
}

await browser.close();
console.log('done →', OUT);
