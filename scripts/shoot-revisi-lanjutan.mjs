/**
 * Screenshot probe for the "revisi lanjutan" batch:
 *   1) StatusModal warranty inputs (Jasa & Sparepart + presets) when finishing a job,
 *   2) Settings → Operasional tab (templates, warranty defaults, WA templates).
 *
 * Client-side nav, seeded session (same approach as shoot-warranty.mjs).
 * Run with dev server up:  node scripts/shoot-revisi-lanjutan.mjs
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

async function seed(page, theme = 'dark') {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });
}

async function run() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await seed(page, 'dark');

  // --- 1) Status modal warranty inputs (find a "Pengerjaan" ticket → Selesai) ---
  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  await page.click('a[href="/services"]');
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
  const row = page.locator('tbody tr', { hasText: 'Pengerjaan' }).first();
  await row.waitFor({ timeout: 10000 });
  await row.locator('a[href^="/services/"]').first().click();
  await page.waitForSelector('text=Update Status', { timeout: 10000 });
  await page.click('text=Update Status');
  await page.waitForSelector('text=Status Tujuan', { timeout: 10000 });
  // Pick "Selesai" in the native select to reveal warranty inputs.
  await page.selectOption('select', { label: 'Selesai' });
  await page.waitForSelector('text=Garansi Jasa (hari)', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'status-warranty-dark.png'), fullPage: true });
  console.log('shot: status-warranty-dark');
  await ctx.close();

  // --- 2) Settings → Operasional tab ---
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await seed(page2, 'dark');
  await page2.waitForSelector('a[href="/settings"]', { timeout: 10000 });
  await page2.click('a[href="/settings"]');
  await page2.waitForSelector('text=Operasional', { timeout: 10000 });
  await page2.click('text=Operasional');
  await page2.waitForSelector('text=Template WhatsApp', { timeout: 10000 });
  await page2.waitForTimeout(500);
  await page2.screenshot({ path: join(OUT, 'settings-operasional-dark.png'), fullPage: true });
  console.log('shot: settings-operasional-dark');
  await ctx2.close();
}

await run();
await browser.close();
console.log('done →', OUT);
