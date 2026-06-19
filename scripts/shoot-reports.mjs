/**
 * Reports v2 verification shot. Seeds (with verbose error surfacing) then
 * captures /reports in dark + mobile. Falls back to capturing even if the
 * seed throws, so we can still verify the page renders without crashing.
 *
 * Run: node scripts/shoot-reports.mjs
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

async function shoot(name, theme, width) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.setViewportSize({ width, height: 1100 });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);

  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  const seedErr = await page.evaluate(async () => {
    try { await window.__fixmasterSeed(); return null; }
    catch (e) { return String(e && e.stack ? e.stack : e); }
  });
  if (seedErr) console.log('  [seed error]', seedErr);

  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  await page.click('a[href="/reports"]').catch((e) => console.log('  [nav error]', e.message));
  await page.waitForTimeout(1200);

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('shot:', name);
  await ctx.close();
}

await shoot('reports-v2-dark', 'dark', 1440);
await shoot('reports-v2-mobile', 'dark', 440);

await browser.close();
console.log('done →', OUT);
