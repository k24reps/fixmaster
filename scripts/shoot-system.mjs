/**
 * Settings → System tab shots: Export Data card + Danger Zone (reset +
 * account deletion). Seeds demo data, navigates to /settings, switches to the
 * "Sistem" tab. Dark + light + mobile.
 *
 * Run: BASE_URL=http://localhost:5173 node scripts/shoot-system.mjs
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

async function capture({ name, theme, width = 1440, height = 1100 }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);

  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });

  await page.waitForSelector('a[href="/settings"]', { timeout: 10000 });
  await page.click('a[href="/settings"]');

  // Switch to the "Sistem" tab (button text).
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Sistem/i }).first().click();
  await page.waitForTimeout(700);

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('shot:', name);
  await ctx.close();
}

await capture({ name: 'system-dark', theme: 'dark' });
await capture({ name: 'system-light', theme: 'light' });
await capture({ name: 'system-mobile', theme: 'dark', width: 440, height: 1700 });

await browser.close();
console.log('done →', OUT);
