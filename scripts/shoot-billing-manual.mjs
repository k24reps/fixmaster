/**
 * Render the real Settings → Langganan surface through the public demo shell.
 * Requires the dev server at BASE_URL (default http://127.0.0.1:5173).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${base}/demo`, { waitUntil: 'networkidle' });
  await page.locator('a[href="/settings"]').click();
  await page.getByRole('button', { name: 'Langganan' }).click();
  await page.getByText('Perpanjang via WhatsApp').waitFor();
  await page.evaluate((nextTheme) => {
    document.documentElement.setAttribute('data-theme', nextTheme);
  }, theme);
  await page.screenshot({ path: join(out, `billing-${theme}.png`), fullPage: true });
  await page.close();
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${base}/demo`, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: 'Lainnya' }).click();
await mobile.getByRole('dialog').getByRole('link', { name: 'Pengaturan' }).click();
await mobile.getByRole('button', { name: 'Langganan' }).click();
await mobile.getByText('Perpanjang via WhatsApp').waitFor();
const overflow = await mobile.evaluate(() => ({
  viewport: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  offenders: [...document.querySelectorAll('body *')]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: element.className, left: rect.left, right: rect.right };
    })
    .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
    .slice(0, 12),
}));
console.log(JSON.stringify(overflow));
if (overflow.scrollWidth > overflow.viewport + 1) process.exitCode = 1;
await mobile.screenshot({ path: join(out, 'billing-mobile.png'), fullPage: true });
await mobile.close();
await browser.close();
