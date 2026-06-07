/**
 * Static preview shots of the ErrorBoundary fallback. The boundary only shows
 * after a real render crash, so we render its markup against the REAL source
 * CSS to verify the fallback looks right. Dark + light.
 *
 * Run: node scripts/shoot-error.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const HARNESS = process.env.ERROR_HARNESS;
if (!HARNESS) {
  console.error('Set ERROR_HARNESS to the preview html path');
  process.exit(1);
}
const url = pathToFileURL(HARNESS).href;

const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 760, height: 520 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `error-${theme}.png`), fullPage: true });
  console.log('shot: error-' + theme);
  await ctx.close();
}
await browser.close();
console.log('done →', OUT);
