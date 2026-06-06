/**
 * Authenticated screenshot probe — seeds a demo workspace then captures
 * the real app (dashboard, services) at desktop + mobile, dark + light.
 * Run with the dev server up:  node scripts/shoot-app.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const pages = [
  { path: '/', name: 'dashboard' },
  { path: '/services', name: 'services' },
  { path: '/pos', name: 'pos' },
  { path: '/inventory', name: 'inventory' },
];

const browser = await chromium.launch();

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

// Seed once in a bootstrap page, persisted to IndexedDB (shared across tabs/origin).
const boot = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await boot.goto(BASE, { waitUntil: 'networkidle' });
await boot.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
await boot.evaluate(async () => { await window.__fixmasterSeed(); });
await boot.waitForTimeout(500);
await boot.close();
console.log('seeded demo workspace');

for (const theme of ['dark', 'light']) {
  for (const p of pages) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.5 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await setTheme(page, theme);
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `app-${p.name}-${theme}.png`) });
    console.log('shot:', `app-${p.name}-${theme}`);
    await page.close();
  }
}

// Mobile dashboard + services (dark)
for (const p of [pages[0], pages[1]]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, 'dark');
  await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `app-${p.name}-mobile.png`), fullPage: true });
  console.log('shot:', `app-${p.name}-mobile`);
  await page.close();
}

await browser.close();
console.log('done →', OUT);
