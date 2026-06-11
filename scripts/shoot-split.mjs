/**
 * Capture the split-payment editor at settlement. Finds a ticket where "lunas"
 * is reachable, opens Update Status → lunas, adds a second wallet leg, and
 * screenshots. Run with dev server up:  node scripts/shoot-split.mjs
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
await page.waitForTimeout(700);

const nav = page.getByRole('link', { name: /Servis/i }).first();
await nav.click();
await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
const n = await page.locator('a[href^="/services/"]').count();

let done = false;
for (let i = 0; i < n && !done; i++) {
  await nav.click();
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
  await page.locator('a[href^="/services/"]').nth(i).click();
  await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
  await page.waitForTimeout(200);
  const upd = page.getByRole('button', { name: /Update Status/i });
  if (!(await upd.count())) continue;
  await upd.first().click();
  await page.waitForTimeout(300);
  const statusTab = page.getByRole('button', { name: 'Ubah Status', exact: true });
  if (await statusTab.count()) await statusTab.click();
  await page.waitForTimeout(150);
  const opts = await page.locator('select option').allTextContents();
  if (opts.some((o) => /Lunas/i.test(o))) {
    await page.selectOption('select', { label: 'Lunas' });
    await page.waitForTimeout(400);
    const hasSplit = await page.getByText('Pembayaran (bisa dipecah').count();
    console.log('lunas at index', i, '| split editor shown:', hasSplit > 0);
    await page.screenshot({ path: join(OUT, 'split-1-single.png'), fullPage: true });
    // add a 2nd wallet leg
    const addBtn = page.getByRole('button', { name: '+ Tambah wallet' });
    if (await addBtn.count()) {
      await addBtn.click();
      await page.waitForTimeout(300);
      // split the amount: set first leg smaller, second leg remainder
      const amts = page.locator('input').filter({ hasNot: page.locator('[type=number]') });
      await page.screenshot({ path: join(OUT, 'split-2-two-legs.png'), fullPage: true });
      const tally = await page.locator('[class*="splitTally"]').first().innerText().catch(() => '');
      console.log('two legs added | tally text:', tally);
    }
    done = true;
  } else {
    await page.getByRole('button', { name: 'Batal', exact: true }).first().click();
    await page.waitForTimeout(150);
  }
}
if (!done) console.log('No ticket offered lunas target');

await browser.close();
console.log('done →', OUT);
