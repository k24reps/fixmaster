/**
 * Verification shots for the public marketing + legal pages. These are public
 * routes (no auth/seed needed): the landing page is the AuthGate signed-out
 * front door, and /privacy /terms are standalone routes.
 *
 * Run with dev server up:  BASE_URL=http://localhost:5174 node scripts/shoot-landing.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5174';

const browser = await chromium.launch();

async function shot({ route, name, theme, width = 1280, height = 900, full = true }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  console.log('shot:', name);
  await ctx.close();
}

await shot({ route: '/', name: 'landing-dark', theme: 'dark' });
await shot({ route: '/', name: 'landing-light', theme: 'light' });
await shot({ route: '/', name: 'landing-mobile', theme: 'dark', width: 412, height: 915 });
await shot({ route: '/privacy', name: 'privacy-dark', theme: 'dark' });
await shot({ route: '/terms', name: 'terms-light', theme: 'light' });

await browser.close();
console.log('done →', OUT);
