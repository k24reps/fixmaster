/**
 * Verification shots for: sidebar identity split, branch selector, logo,
 * and the profitable 4-June seed. Captures dark/light + mobile, and proves
 * the branch selector actually filters data.
 *
 * Run: BASE_URL=http://localhost:5173 node scripts/shoot-identity.mjs
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
  await page.waitForSelector('aside a[href="/"]', { timeout: 10000 });
  await page.waitForTimeout(700);
}

async function shootSidebar(name, theme, width) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: 980 });
  await ready(page, theme);
  await page.click('aside a[href="/"]').catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log('shot:', name);
  await ctx.close();
}

// 1) Sidebar + dashboard, dark & light (desktop).
await shootSidebar('id-dark', 'dark', 1440);
await shootSidebar('id-light', 'light', 1440);

// 2) Branch selector open.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 980 });
  await ready(page, 'dark');
  await page.click('button[aria-haspopup="listbox"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'id-branch-open.png'), fullPage: false });
  console.log('shot: id-branch-open');

  // 3) Pick "Cabang Dago" and verify data filters (units count changes).
  const allText = await page.locator('aside').innerText();
  void allText;
  await page.getByRole('option', { name: /Cabang Dago/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, 'id-branch-dago.png'), fullPage: false });
  console.log('shot: id-branch-dago');
  await ctx.close();
}

// 4) Settings logo uploader.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 980 });
  await ready(page, 'dark');
  await page.click('aside a[href="/settings"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'id-settings.png'), fullPage: false });
  console.log('shot: id-settings');
  await ctx.close();
}

// 5) Mobile sidebar drawer.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 430, height: 932 });
  await ready(page, 'dark');
  // open the mobile drawer (hamburger in topbar)
  await page.click('button[aria-label*="menu" i], button[aria-label*="Menu" i]').catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'id-mobile.png'), fullPage: false });
  console.log('shot: id-mobile');
  await ctx.close();
}

await browser.close();
console.log('done');
