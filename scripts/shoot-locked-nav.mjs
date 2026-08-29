/**
 * Verification shot for the "show-locked" sidebar (Solo plan).
 * Seeds a workspace, flips the org to the Solo (`standard`) plan, then
 * captures the rail so the Pro-locked channels (dimmed row + brand-LED
 * "PRO" badge, NOT a generic padlock) are visible — dark + light.
 *
 * Run:  BASE_URL=http://localhost:5173 node scripts/shoot-locked-nav.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const DEMO = new URL('/demo', BASE).href;

const browser = await chromium.launch();
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };

async function seedSoloReady(page, theme) {
  page.on('console', (m) => console.log(`  [console.${m.type()}]`, m.text()));
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(DEMO, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForSelector('a[href="/services"]', { timeout: 15000 });
  // Flip the org to the Solo plan so feature-gated channels render locked.
  await page.waitForFunction(() => !!window.__session, { timeout: 15000 });
  await page.evaluate(() => {
    const s = window.__session.getState();
    s.setOrg({ ...s.org, planType: 'standard' });
  });
  await page.waitForTimeout(500);
}

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedSoloReady(page, theme);

  // A locked channel links to /settings; assert at least one exists.
  const lockedCount = await page.locator('aside a[href="/settings"]').count();
  if (lockedCount < 2) fail(`expected locked channels linking to /settings, found ${lockedCount}`);

  const aside = page.locator('aside').first();
  await aside.screenshot({ path: join(OUT, `locked-nav-${theme}.png`) });
  console.log('shot: locked-nav-' + theme, '(locked links:', lockedCount + ')');
  await ctx.close();
}

await browser.close();
console.log(process.exitCode ? 'DONE WITH FAILURES' : 'ALL CHECKS PASSED');
