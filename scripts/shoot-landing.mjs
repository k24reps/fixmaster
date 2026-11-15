/**
 * Foto landing "Dua Adegan" (/landing-preview) dan gerbang /demo di beberapa
 * lebar dan dua tema. Gerak dimatikan (reduced motion), jadi adegan meja dan
 * ponsel difoto di keadaan akhirnya (lunas), bukan di tengah animasi.
 *
 *   node scripts/shoot-landing.mjs
 *   BASE_URL=http://127.0.0.1:5173 OUT=.impeccable/review PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/shoot-landing.mjs
 *
 * Mencetak luberan horizontal tiap foto; selain 0 berarti ada yang meluap.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = process.env.OUT || join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);

async function shot({ name, width, height, theme, mobile = false, full = false, visitor = null, path = '/landing-preview' }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    colorScheme: theme,
  });
  await ctx.addInitScript(
    ([t, v]) => {
      localStorage.setItem('fixmaster-theme', t);
      if (v) localStorage.setItem('fixmaster-demo-visitor', JSON.stringify({ shopName: v }));
    },
    [theme, visitor],
  );
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForSelector(path.startsWith('/demo') ? 'form' : 'h1', { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${name}: luberan-x ${overflow}px`);
  await ctx.close();
}

await shot({ name: 'desktop', width: 1440, height: 900, theme: 'dark', full: true });
await shot({ name: 'desktop-fold', width: 1440, height: 900, theme: 'dark' });
await shot({ name: 'desktop-light', width: 1440, height: 900, theme: 'light', full: true });
await shot({ name: 'desktop-light-fold', width: 1440, height: 900, theme: 'light' });
await shot({ name: 'laptop-fold', width: 1280, height: 720, theme: 'dark' });
await shot({ name: 'tablet-fold', width: 820, height: 1180, theme: 'dark', mobile: true });
await shot({ name: 'mobile', width: 390, height: 844, theme: 'dark', mobile: true, full: true });
await shot({ name: 'mobile-fold', width: 390, height: 844, theme: 'dark', mobile: true });
await shot({ name: 'mobile-light', width: 390, height: 844, theme: 'light', mobile: true, full: true });
await shot({ name: 'mobile-returning-fold', width: 390, height: 844, theme: 'dark', mobile: true, visitor: 'Sinar Servis Elektronik' });
await shot({ name: 'demo-gate', width: 390, height: 844, theme: 'dark', mobile: true, path: '/demo?gate' });
await browser.close();
