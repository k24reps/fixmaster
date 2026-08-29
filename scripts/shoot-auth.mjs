/**
 * Live preview shots of the AuthPage signature ("Terminal Akses Bench").
 * `?auth=1` lets AuthGate open the production auth surface directly, so the
 * capture verifies the actual React tree, translations, tokens, and CSS.
 * Dark + light + a mobile (collapsed) shot.
 *
 * Run: node scripts/shoot-auth.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const url = `${BASE}/?auth=1`;

const browser = await chromium.launch();

async function audit(page, label) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const undersizedButtons = [...document.querySelectorAll('button')]
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return { label: button.textContent?.trim() || button.getAttribute('aria-label'), width: rect.width, height: rect.height };
      })
      .filter(({ width, height }) => width < 44 || height < 44);
    return {
      viewport: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      undersizedButtons,
    };
  });
  console.log('audit:', label, JSON.stringify(result));
}

// Desktop dark + light.
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `auth-${theme}.png`), fullPage: true });
  await audit(page, `${theme}-login`);
  console.log('shot: auth-' + theme);
  if (theme === 'dark') {
    await page.getByRole('button', { name: 'Daftar', exact: true }).click();
    await page.screenshot({ path: join(OUT, 'auth-signup-dark.png'), fullPage: true });
    await audit(page, 'dark-signup');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await page.getByRole('button', { name: 'Lupa password?', exact: true }).click();
    await page.screenshot({ path: join(OUT, 'auth-reset-dark.png'), fullPage: true });
    await audit(page, 'dark-reset');
  }
  await ctx.close();
}

// Mobile (collapsed faceplate), dark.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('fixmaster-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'auth-mobile.png'), fullPage: true });
  await audit(page, 'mobile-login');
  await page.getByRole('button', { name: 'Daftar', exact: true }).click();
  await page.screenshot({ path: join(OUT, 'auth-signup-mobile.png'), fullPage: true });
  await audit(page, 'mobile-signup');
  console.log('shot: auth-mobile');
  await ctx.close();
}

await browser.close();
console.log('done →', OUT);
