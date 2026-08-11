/**
 * Capture the owner-configurable mobile navigation and its Settings editor.
 * Requires the dev server at BASE_URL (default http://127.0.0.1:5173).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shotsDir = join(dirname(fileURLToPath(import.meta.url)), 'shots');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173';
mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch();

async function openDemo(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('fixmaster-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  return { context, page };
}

const mobile = await openDemo({ width: 390, height: 844 });
await mobile.page.screenshot({ path: join(shotsDir, 'mobile-bottom-nav-dark.png') });
await mobile.page.getByRole('button', { name: 'Lainnya' }).click();
await mobile.page.getByRole('dialog', { name: 'Menu lainnya' }).waitFor();
await mobile.page.screenshot({ path: join(shotsDir, 'mobile-more-dark.png') });
await mobile.context.close();

const desktop = await openDemo({ width: 1440, height: 900 });
await desktop.page.locator('a[href="/settings"]').first().click();
await desktop.page.getByRole('button', { name: 'Navigasi' }).click();
await desktop.page.getByText('Navigasi Mobile', { exact: true }).waitFor();
await desktop.page.waitForTimeout(300);
await desktop.page.screenshot({ path: join(shotsDir, 'settings-navigation-dark.png') });
await desktop.context.close();

await browser.close();
console.log('Captured mobile-bottom-nav-dark.png, mobile-more-dark.png, settings-navigation-dark.png');
