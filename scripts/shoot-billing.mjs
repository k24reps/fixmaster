/**
 * Static preview shots of the billing signature page (License Meter, tier
 * modules, receipt tape). The real BillingTab only renders in cloud mode
 * (isSupabaseConfigured), which needs a real login, so we render the exact
 * markup against the REAL source CSS (tokens + global + SettingsPage.module)
 * to verify the visual language. Dark + light.
 *
 * Run: node scripts/shoot-billing.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const HARNESS = process.env.BILLING_HARNESS;
if (!HARNESS) {
  console.error('Set BILLING_HARNESS to the preview html path');
  process.exit(1);
}
const url = pathToFileURL(HARNESS).href;

const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 880, height: 1200 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `billing-${theme}.png`), fullPage: true });
  console.log('shot: billing-' + theme);
  await ctx.close();
}
await browser.close();
console.log('done →', OUT);
