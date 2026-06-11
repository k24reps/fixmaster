/**
 * Visual verification of #2 — edit "modal dadakan" (ad-hoc cost line).
 * Flow (via public /demo, in-memory): open a ticket, add a modal dadakan,
 * then EDIT it (rename + change amount), screenshotting before/after so we
 * can confirm the pencil button + pre-filled form + updated BOM row.
 * Run with dev server up:  node scripts/shoot-modal-edit.mjs
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('fixmaster-theme', 'dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
await page.waitForTimeout(800);

await page.getByRole('link', { name: /Servis/i }).first().click();
await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
await page.locator('a[href^="/services/"]').first().click();
await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
await page.waitForTimeout(400);

// Add a modal dadakan.
await page.getByRole('button', { name: 'Modal Dadakan', exact: true }).click();
await page.waitForSelector('text=Keterangan modal', { timeout: 8000 });
await page.fill('input[placeholder="mis. Beli LCD di toko sebelah"]', 'Beli baterai luar');
await page.fill('input[placeholder="250.000"]', '90.000');
await page.click('button:has-text("Simpan Modal")');
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, 'modal-edit-1-added.png'), fullPage: true });
console.log('shot: added');

// Edit it — click the pencil on the manual row.
await page.locator('button[aria-label="Edit modal"]').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'modal-edit-2-form.png'), fullPage: true });
console.log('shot: edit form (pre-filled)');

// Change name + amount, then save.
const nameInput = page.locator('input[placeholder="mis. Beli LCD di toko sebelah"]');
await nameInput.fill('Beli baterai luar (revisi)');
const amtInput = page.locator('input[placeholder="250.000"]');
await amtInput.fill('125.000');
await page.click('button:has-text("Perbarui Modal")');
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, 'modal-edit-3-updated.png'), fullPage: true });
console.log('shot: updated');

// Verify the row now shows the revised text/amount.
const hasRevised = await page.getByText('Beli baterai luar (revisi)').count();
console.log('revised row visible:', hasRevised > 0);

await browser.close();
console.log('done →', OUT);
