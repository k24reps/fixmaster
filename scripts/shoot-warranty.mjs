/**
 * Warranty-claim (#7C) screenshot probe.
 *
 * Captures the real rendered UI for the warranty-claim flow:
 *   1) opens a settled ("Lunas") in-warranty ticket → "Klaim Garansi" button visible,
 *   2) opens the WarrantyClaimModal,
 *   3) ticks "catat kerugian garansi" to reveal the manual-loss inputs.
 *
 * Same client-side-nav approach as shoot-detail.mjs (no reloads, session survives).
 * Run with dev server up:  node scripts/shoot-warranty.mjs
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

async function openLunasTicket(page, theme) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);

  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });

  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  await page.click('a[href="/services"]');
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });

  // Find a table row whose status badge reads "Lunas", click its ticket link.
  const lunasRow = page.locator('tbody tr', { hasText: 'Lunas' }).first();
  await lunasRow.waitFor({ timeout: 10000 });
  await lunasRow.locator('a[href^="/services/"]').first().click();
  await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
  await page.waitForTimeout(600);
}

async function run() {
  // --- Detail page showing the "Klaim Garansi" action ---
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openLunasTicket(page, 'dark');
  await page.screenshot({ path: join(OUT, 'warranty-detail-dark.png'), fullPage: true });
  console.log('shot: warranty-detail-dark');

  // --- Open the warranty claim modal ---
  await page.click('text=Klaim Garansi');
  await page.waitForSelector('text=Buat Tiket Klaim', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'warranty-modal-dark.png'), fullPage: true });
  console.log('shot: warranty-modal-dark');

  // --- Tick "catat kerugian garansi" → manual loss inputs appear ---
  await page.click('text=Catat kerugian garansi');
  await page.waitForSelector('text=Nominal kerugian', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'warranty-modal-loss-dark.png'), fullPage: true });
  console.log('shot: warranty-modal-loss-dark');
  await ctx.close();
}

await run();
await browser.close();
console.log('done →', OUT);
