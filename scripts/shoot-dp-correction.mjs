/**
 * Visual verification of #1 (koreksi biaya final pasca-lunas) + #3 (input DP).
 * Flow on public /demo (in-memory): open a ticket, accept a DP, then drive it
 * to lunas, then correct the final cost. Screenshots each stage.
 * Run with dev server up:  node scripts/shoot-dp-correction.mjs
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

let opened = false;
for (let i = 0; i < ticketCount; i++) {
  await servicesNav.click();
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
  await page.locator('a[href^="/services/"]').nth(i).click();
  await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
  await page.waitForTimeout(250);
  if (await page.getByRole('button', { name: 'Terima DP', exact: true }).count()) {
    opened = true;
    console.log('non-terminal ticket index:', i);
    break;
  }
}
if (!opened) console.log('No non-terminal ticket found among', ticketCount);
await page.waitForTimeout(200);

// --- #3: Accept a DP ---
const dpBtn = page.getByRole('button', { name: 'Terima DP', exact: true });
if (await dpBtn.count()) {
  await dpBtn.click();
  await page.waitForTimeout(300);
  await page.fill('input[placeholder="100.000"]', '150.000');
  await page.screenshot({ path: join(OUT, 'dp-1-form.png'), fullPage: true });
  await page.click('button:has-text("Simpan DP")');
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, 'dp-2-recorded.png'), fullPage: true });
  const dpRow = await page.getByText('DP diterima').count();
  console.log('DP row visible:', dpRow > 0);
} else {
  console.log('Terima DP button not available (ticket terminal?)');
}

// --- #1: Correct final cost on a settled ("lunas") ticket ---
const correctName = 'Koreksi Biaya Final';
let correctFound = false;
for (let i = 0; i < ticketCount; i++) {
  await servicesNav.click();
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
  await page.locator('a[href^="/services/"]').nth(i).click();
  await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
  await page.waitForTimeout(250);
  if (await page.getByRole('button', { name: correctName, exact: true }).count()) {
    correctFound = true;
    console.log('lunas ticket index:', i);
    await page.getByRole('button', { name: correctName, exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, 'correct-1-form.png'), fullPage: true });
    // Bump the correction amount and save (input has placeholder "0").
    const amt = page.locator('input[placeholder="0"]');
    if (await amt.count()) {
      await amt.fill('999.000');
      await page.click('button:has-text("Perbarui Biaya")');
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT, 'correct-2-updated.png'), fullPage: true });
      const finalShown = await page.locator('text=999.000').count();
      console.log('corrected final cost visible:', finalShown > 0);
    } else {
      console.log('correction amount input not found');
    }
    break;
  }
}
if (!correctFound) console.log('No lunas ticket with correction button found');

await browser.close();
console.log('done →', OUT);
