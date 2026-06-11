/**
 * Visual verification of the sparepart picker + modal dadakan + profit flow,
 * driven through the public /demo (in-memory, self-seeding — no backend).
 * Opens a ticket, adds an inventory sparepart and an ad-hoc modal, then
 * screenshots the detail (BOM + owner profit) and the services table.
 * Run with dev server up:  node scripts/shoot-modal-profit.mjs
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

async function run(theme) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1.5 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  // Go to Servis, open first ticket.
  await page.getByRole('link', { name: /Servis/i }).first().click();
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
  await page.locator('a[href^="/services/"]').first().click();
  await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });

  // Add an inventory sparepart.
  await page.getByRole('button', { name: 'Sparepart', exact: true }).click();
  await page.waitForSelector('text=Ambil Sparepart dari Inventory', { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Tambah")').first().click();
  await page.waitForTimeout(500);

  // Add an ad-hoc "modal dadakan".
  await page.getByRole('button', { name: 'Modal Dadakan', exact: true }).click();
  await page.waitForSelector('text=Keterangan modal', { timeout: 8000 });
  await page.fill('input[placeholder="mis. Beli LCD di toko sebelah"]', 'Beli konektor flex di toko sebelah');
  await page.fill('input[placeholder="250.000"]', '85.000');
  await page.click('button:has-text("Simpan Modal")');
  await page.waitForTimeout(700);

  await page.screenshot({ path: join(OUT, `modal-profit-detail-${theme}.png`), fullPage: true });
  console.log('shot: detail', theme);

  // Back to services table (Modal/Profit columns).
  await page.getByRole('link', { name: /Servis/i }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `modal-profit-table-${theme}.png`), fullPage: true });
  console.log('shot: table', theme);

  await page.close();
}

await run('dark');
await run('light');
await browser.close();
console.log('done →', OUT);
