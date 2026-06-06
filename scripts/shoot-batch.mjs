/**
 * Batch page verification shots — seeds once per context, navigates to each
 * route via the sidebar (client-side, keeps session + cache), captures
 * dark/light/mobile for every page in PAGES. One dev server session.
 *
 * Run:  node scripts/shoot-batch.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';

// route → name + a ready selector proving the new design rendered
const PAGES = [
  { route: '/suppliers', name: 'sup', ready: "div[class*='docket'], div[class*='vendor']" },
  { route: '/finance', name: 'fin', ready: "div[class*='tape']" },
  { route: '/reports', name: 'rep', ready: "div[class*='metric']" },
  { route: '/tasks', name: 'tsk', ready: "li[class*='taskItem'], li[class*='templateItem'], [class*='taskList']" },
  { route: '/attendance', name: 'att', ready: "div[class*='clock']" },
];

const browser = await chromium.launch();

async function capture({ route, name, ready, theme, width = 1440, height = 1100 }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);

  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });

  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  await page.click(`a[href="${route}"]`);
  try {
    if (ready) await page.waitForSelector(ready, { timeout: 8000 });
  } catch {
    console.log(`  (ready selector miss for ${name}, capturing anyway)`);
  }
  await page.waitForTimeout(800);

  if (width !== 1440 || height !== 1100) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('shot:', name);
  await ctx.close();
}

for (const p of PAGES) {
  await capture({ ...p, name: `${p.name}-dark`, theme: 'dark' });
  await capture({ ...p, name: `${p.name}-light`, theme: 'light' });
  await capture({ ...p, name: `${p.name}-mobile`, theme: 'dark', width: 440, height: 1500 });
}

await browser.close();
console.log('done →', OUT);
