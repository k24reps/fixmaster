/**
 * Verification shots for revision phases 1-3:
 *  - #4 global search dropdown + navigation
 *  - #5 quick task on the Tasks "today" tab
 *  - #9 service template chips (form) + Settings management
 *
 * Run: BASE_URL=http://localhost:5174 node scripts/shoot-revisi.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5174';

const browser = await chromium.launch();

async function ready(page, theme) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });
  await page.waitForSelector('aside a[href="/"]', { timeout: 10000 });
  await page.waitForTimeout(700);
}

async function shoot(name, theme, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 980 });
  await ready(page, theme);
  await fn(page);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log('shot:', name);
  await ctx.close();
}

// #4 — Global search dropdown with results (type a service number).
await shoot('rev-search-dark', 'dark', async (page) => {
  const input = page.getByPlaceholder('Cari servis, pelanggan, barang…');
  await input.click();
  await input.fill('FM');
  await page.waitForTimeout(400);
});
await shoot('rev-search-light', 'light', async (page) => {
  const input = page.getByPlaceholder('Cari servis, pelanggan, barang…');
  await input.click();
  await input.fill('Citra');
  await page.waitForTimeout(400);
});

// #5 — Quick task input on the Tasks today tab.
await shoot('rev-quicktask-dark', 'dark', async (page) => {
  await page.click('aside a[href="/tasks"]');
  await page.waitForTimeout(500);
  const qa = page.getByPlaceholder('Tugas cepat hari ini… (mis. telepon supplier)');
  await qa.fill('Telepon supplier sparepart');
  await page.waitForTimeout(200);
});

// #9 — Service template chips in the new-service modal.
await shoot('rev-svcchips-dark', 'dark', async (page) => {
  await page.click('aside a[href="/services"]');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Servis Baru/ }).first().click();
  await page.waitForTimeout(500);
});

// #9 — Settings template management (Usaha tab).
await shoot('rev-settings-tpl-dark', 'dark', async (page) => {
  await page.click('aside a[href="/settings"]');
  await page.waitForTimeout(600);
  // Usaha tab is default; scroll to the template card.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
});

await browser.close();
console.log('done');
