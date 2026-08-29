/**
 * Screenshot probe for the public marketing landing page (signed-out).
 * Captures full-page + key sections, desktop dark/light + mobile.
 * Run with the dev server up:  node scripts/shoot-landing.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch();

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

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

async function primeProductImages(page) {
  await page.locator('#product').scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('img[loading="lazy"]')]
      .filter((image) => image.getClientRects().length > 0)
      .every((image) => image.complete && image.naturalWidth > 0),
  );
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const previousBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = previousBehavior;
  });
  await page.waitForFunction(() => window.scrollY === 0);
}

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.25 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.waitForTimeout(500);
  await primeProductImages(page);
  // Full page
  await page.screenshot({ path: join(OUT, `landing-full-${theme}.png`), fullPage: true });
  await audit(page, `${theme}-desktop`);
  // Above-the-fold (hero)
  await page.screenshot({ path: join(OUT, `landing-hero-${theme}.png`) });
  if (theme === 'dark') {
    await page.screenshot({ path: join(OUT, 'landing-v2-dark.png') });
  }
  console.log('shot:', `landing-${theme}`);
  const ownerProof = page.locator('#owner-proof');
  await ownerProof.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await ownerProof.screenshot({ path: join(OUT, `landing-owner-${theme}.png`) });
  console.log('shot:', `landing-owner-${theme}`);
  // The product/demo section specifically (poster-only, no iframe).
  try {
    const demo = page.locator('#product');
    await demo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await demo.screenshot({ path: join(OUT, `landing-demo-${theme}.png`) });
    if (theme === 'dark') {
      await page.getByRole('link', { name: /versi mobile/i }).screenshot({
        path: join(OUT, 'landing-phone-frame-desktop.png'),
      });
    }
    console.log('shot:', `landing-demo-${theme}`);
  } catch (e) {
    console.log('skip demo', theme, String(e).slice(0, 80));
  }
  const finalCta = page.locator('#start');
  await finalCta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await finalCta.screenshot({ path: join(OUT, `landing-final-${theme}.png`) });
  console.log('shot:', `landing-final-${theme}`);
  await page.close();
}

// Mobile (dark) full page
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await m.goto(BASE, { waitUntil: 'networkidle' });
await setTheme(m, 'dark');
await m.waitForTimeout(500);
await primeProductImages(m);
await m.screenshot({ path: join(OUT, 'landing-mobile.png'), fullPage: true });
await audit(m, 'dark-mobile');
await m.locator('#owner-proof').screenshot({ path: join(OUT, 'landing-owner-mobile.png') });
await m.getByRole('link', { name: /versi mobile/i }).screenshot({
  path: join(OUT, 'landing-phone-frame-mobile.png'),
});
console.log('shot:', 'landing-mobile');
await m.close();

await browser.close();
console.log('done →', OUT);
