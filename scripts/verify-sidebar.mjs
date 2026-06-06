/**
 * Sidebar fix verification — asserts the three reported issues are fixed,
 * then captures shots. Exits non-zero if any functional check fails.
 *
 *   1. Collapse -> re-expand round trip (expand button stays reachable)
 *   2. Mobile drawer: tapping a menu item navigates (overlay no longer steals taps)
 *   3. Long shop name wraps (no truncation) with room for the logo
 *
 * Run:  BASE_URL=http://localhost:5173 node scripts/verify-sidebar.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const LONG_NAME = 'Bengkel Servis Elektronik Maju Jaya Sentosa Abadi';

const browser = await chromium.launch();
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };

async function seedAndReady(page, theme) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });
  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  await page.waitForTimeout(500);
}

// ---------- 1 + 3: desktop collapse round-trip + long-name wrap ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedAndReady(page, 'dark');

  const aside = page.locator('aside').first();
  const widthOf = async () => (await aside.boundingBox()).width;

  const expanded1 = await widthOf();
  await page.click('button[aria-label="Lipat sidebar"]');
  await page.waitForTimeout(450);
  const collapsedW = await widthOf();
  if (!(collapsedW < expanded1)) fail(`collapse did not shrink rail (${expanded1} -> ${collapsedW})`);

  // The expand control must still be visible while collapsed.
  const btn = page.locator('button[aria-label="Lipat sidebar"]');
  if (!(await btn.isVisible())) fail('expand button is hidden when collapsed (cannot re-expand)');

  await page.screenshot({ path: join(OUT, 'fix-collapsed-dark.png'), clip: { x: 0, y: 0, width: 120, height: 1000 } });

  await btn.click();
  await page.waitForTimeout(450);
  const expanded2 = await widthOf();
  if (!(expanded2 > collapsedW)) fail(`could not re-expand rail (${collapsedW} -> ${expanded2})`);

  // Long name wrap: inject a long name into the real element, confirm it
  // grows past one line (height) rather than truncating.
  await page.evaluate((n) => {
    const el = document.querySelector('aside strong');
    if (el) el.textContent = n;
  }, LONG_NAME);
  await page.waitForTimeout(250);
  const strong = page.locator('aside strong').first();
  const box = await strong.boundingBox();
  if (!box || box.height < 30) fail(`long shop name did not wrap (height=${box?.height})`);
  await aside.screenshot({ path: join(OUT, 'fix-longname-dark.png') });
  console.log('desktop checks ok; expanded', expanded1, 'collapsed', collapsedW, 're-expanded', expanded2, 'nameH', Math.round(box.height));
  await ctx.close();
}

// ---------- 2: mobile drawer menu tap navigates ----------
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 430, height: 932 });
  await seedAndReady(page, theme);

  await page.click('button[aria-label="Menu"]');
  await page.waitForTimeout(450);
  if (theme === 'dark') {
    await page.screenshot({ path: join(OUT, 'fix-mobile-open-dark.png') });
  }
  // Tap the Inventory menu item inside the drawer.
  await page.click('aside a[href="/inventory"]');
  await page.waitForTimeout(700);
  const url = page.url();
  if (!url.endsWith('/inventory')) fail(`mobile menu tap did not navigate (url=${url})`);
  else console.log(`mobile (${theme}) nav ok -> ${url}`);
  await ctx.close();
}

await browser.close();
console.log(process.exitCode ? 'DONE WITH FAILURES' : 'ALL CHECKS PASSED');
