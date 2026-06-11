/**
 * Robust capture of the two views tied to the user's complaint.
 *  (A) settlement ("lunas") shows a WALLET PICKER (was hardcoded wallets[0])
 *  (B) a settled ("lunas") ticket opens StatusModal in "Koreksi Biaya"
 * Modals are closed via the footer "Batal" button between tries to avoid
 * leftover overlays blocking the list. Run with dev server up.
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

async function bootDemo() {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('fixmaster-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
}

async function closeModal() {
  const cancel = page.getByRole('button', { name: 'Batal', exact: true });
  if (await cancel.count()) {
    await cancel.first().click();
    await page.waitForTimeout(200);
  }
}

async function openTicket(i) {
  const nav = page.getByRole('link', { name: /Servis/i }).first();
  await nav.click();
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
  const a = page.locator('a[href^="/services/"]').nth(i);
  await a.scrollIntoViewIfNeeded();
  await a.click();
  await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
  await page.waitForTimeout(200);
}

// ---------- (A) wallet picker at lunas ----------
await bootDemo();
const nav = page.getByRole('link', { name: /Servis/i }).first();
await nav.click();
await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
const ticketCount = await page.locator('a[href^="/services/"]').count();

let walletPickerShown = false;
for (let i = 0; i < ticketCount && !walletPickerShown; i++) {
  await openTicket(i);
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
    await page.waitForTimeout(300);
    walletPickerShown = (await page.getByText('Wallet penerima pembayaran').count()) > 0;
    console.log('lunas reachable at index', i, '| wallet picker shown:', walletPickerShown);
    await page.screenshot({ path: join(OUT, 'hub-3-lunas-wallet.png'), fullPage: true });
  }
  await closeModal();
}
if (!walletPickerShown) console.log('No ticket offered lunas target');

// ---------- (B) koreksi via settled ticket ----------
await bootDemo();
let koreksiShown = false;
for (let i = 0; i < ticketCount && !koreksiShown; i++) {
  await openTicket(i);
  const kbtn = page.getByRole('button', { name: 'Koreksi Biaya', exact: true });
  if (await kbtn.count()) {
    await kbtn.click();
    await page.waitForTimeout(400);
    koreksiShown = (await page.getByText('Biaya final (koreksi)').count()) > 0;
    console.log('settled ticket at index', i, '| koreksi form shown:', koreksiShown);
    await page.screenshot({ path: join(OUT, 'hub-4-koreksi.png'), fullPage: true });
    await closeModal();
  }
}
if (!koreksiShown) console.log('No settled ticket with Koreksi Biaya button');

await browser.close();
console.log('done →', OUT);
