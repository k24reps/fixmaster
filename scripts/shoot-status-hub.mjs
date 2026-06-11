/**
 * Visual verification of centralized input: StatusModal is now the hub for
 * status change + Terima DP + Koreksi Biaya. Detail page is read-only otherwise
 * (except BOM). Drives flows via /demo (in-memory).
 * Run with dev server up:  node scripts/shoot-status-hub.mjs
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1300 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('fixmaster-theme', 'dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
await page.waitForTimeout(800);

const servicesNav = page.getByRole('link', { name: /Servis/i }).first();
await servicesNav.click();
await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
const ticketCount = await page.locator('a[href^="/services/"]').count();
console.log('tickets found:', ticketCount);

// --- Find an active (non-terminal) ticket → open Update Status (status+DP tabs) ---
let activeFound = false;
for (let i = 0; i < ticketCount; i++) {
  await servicesNav.click();
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
  await page.locator('a[href^="/services/"]').nth(i).click();
  await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
  await page.waitForTimeout(250);
  const btn = page.getByRole('button', { name: /Update Status/i });
  if (await btn.count()) {
    activeFound = true;
    console.log('active ticket index:', i);
    // Confirm detail page no longer has Terima DP / Koreksi as inline buttons.
    const inlineDp = await page.getByRole('button', { name: 'Terima DP', exact: true }).count();
    const inlineKoreksi = await page.getByRole('button', { name: 'Koreksi Biaya Final', exact: true }).count();
    console.log('detail inline DP button:', inlineDp, '| inline KoreksiFinal button:', inlineKoreksi);
    await btn.first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, 'hub-1-status-tabs.png'), fullPage: true });
    // Switch to DP tab inside the modal.
    const dpTab = page.getByRole('button', { name: 'Terima DP', exact: true });
    if (await dpTab.count()) {
      await dpTab.click();
      await page.waitForTimeout(250);
      await page.fill('input[placeholder="100.000"]', '150.000');
      await page.screenshot({ path: join(OUT, 'hub-2-dp-tab.png'), fullPage: true });
      await page.click('button:has-text("Simpan DP")');
      await page.waitForTimeout(700);
      const dpRow = await page.getByText('DP diterima').count();
      console.log('DP recorded (detail shows DP row):', dpRow > 0);
    }
    // Reopen modal, go to status tab → lunas → wallet picker visible.
    await page.getByRole('button', { name: /Update Status/i }).first().click();
    await page.waitForTimeout(300);
    const statusTab = page.getByRole('button', { name: 'Ubah Status', exact: true });
    if (await statusTab.count()) await statusTab.click();
    await page.waitForTimeout(200);
    // pick "lunas" if present in select
    const opts = await page.locator('select option').allTextContents();
    console.log('status options:', opts.join(', '));
    break;
  }
}
if (!activeFound) console.log('No active ticket found');

await browser.close();
console.log('done →', OUT);
