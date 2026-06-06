/**
 * Sidebar "Diagnostic Rail" verification shots.
 * Seeds a realistic workspace (so live readouts have data), then captures:
 *   - expanded rail (dark + light)
 *   - collapsed LED tower (dark)
 *   - mobile drawer open (dark + light)
 *
 * Run:  BASE_URL=http://localhost:5173 node scripts/shoot-sidebar.mjs
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

async function seedAndReady(page, theme) {
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

async function shootDesktop({ name, theme, collapsed }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedAndReady(page, theme);

  if (collapsed) {
    // The collapse button has aria-label "Lipat sidebar".
    await page.click('button[aria-label="Lipat sidebar"]');
    await page.waitForTimeout(500);
  }
  // Capture just the sidebar element for a tight, legible shot.
  const aside = page.locator('aside').first();
  await aside.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('shot:', name);
  await ctx.close();
}

async function shootMobile({ name, theme }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 430, height: 932 });
  await seedAndReady(page, theme);
  // Open the drawer via the topbar burger (aria-label "Menu").
  await page.click('button[aria-label="Menu"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('shot:', name);
  await ctx.close();
}

await shootDesktop({ name: 'rail-expanded-dark', theme: 'dark', collapsed: false });
await shootDesktop({ name: 'rail-expanded-light', theme: 'light', collapsed: false });
await shootDesktop({ name: 'rail-collapsed-dark', theme: 'dark', collapsed: true });
await shootDesktop({ name: 'rail-collapsed-light', theme: 'light', collapsed: true });
await shootMobile({ name: 'rail-mobile-dark', theme: 'dark' });
await shootMobile({ name: 'rail-mobile-light', theme: 'light' });

await browser.close();
console.log('done →', OUT);
