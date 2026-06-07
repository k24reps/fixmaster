/**
 * Static preview shots of the BULK task-template modal. The Tugas page seed
 * depends on local mode; this dev box runs in cloud mode (redirects to auth),
 * so we render the modal markup against the REAL source CSS to verify the
 * bulk-titles textarea + live count. Dark + light.
 *
 * Run: node scripts/shoot-bulk-task.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const HARNESS = process.env.BULK_HARNESS;
if (!HARNESS) {
  console.error('Set BULK_HARNESS to the preview html path');
  process.exit(1);
}
const url = pathToFileURL(HARNESS).href;

const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 720, height: 760 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `bulk-task-${theme}.png`), fullPage: true });
  console.log('shot: bulk-task-' + theme);
  await ctx.close();
}
await browser.close();
console.log('done →', OUT);
