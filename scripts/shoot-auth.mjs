/**
 * Static preview shots of the AuthPage signature ("Terminal Akses Bench").
 * AuthPage only renders in cloud mode before login, so we render the exact
 * markup against the REAL source CSS to verify the visual language.
 * Dark + light + a mobile (collapsed) shot.
 *
 * Run: node scripts/shoot-auth.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const HARNESS = process.env.AUTH_HARNESS;
if (!HARNESS) {
  console.error('Set AUTH_HARNESS to the preview html path');
  process.exit(1);
}
const url = pathToFileURL(HARNESS).href;

const browser = await chromium.launch();

// Desktop dark + light.
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `auth-${theme}.png`), fullPage: true });
  console.log('shot: auth-' + theme);
  await ctx.close();
}

// Mobile (collapsed faceplate), dark.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'auth-mobile.png'), fullPage: true });
  console.log('shot: auth-mobile');
  await ctx.close();
}

await browser.close();
console.log('done →', OUT);
