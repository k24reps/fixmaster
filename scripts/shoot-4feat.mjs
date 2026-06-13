/**
 * Capture the 4-feature batch UI via the /demo route (forces demo mode
 * regardless of env — the dev server here runs in CLOUD mode, so
 * __fixmasterSeed() does NOT work; /demo is the reliable path).
 * Fresh context per shot; navigate via sidebar LINK clicks (never page.goto to
 * an app route — that reloads the SPA and drops demo state).
 *   1. Colored customer name in the services list
 *   2. Device categories card (Settings → Operasional)
 *   3. Wallet transfer UI (Settings → Wallet)
 *   4. Partial DP refund inputs (StatusModal → batal on a DP ticket; best-effort)
 * Run with dev server up:  node scripts/shoot-4feat.mjs
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

/** Fresh context landed in /demo (dark), sidebar ready. */
async function fresh({ width = 1440, height = 1300 } = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('fixmaster-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
  return { ctx, page };
}

// --- Shot 1: colored customer name in services list ---
try {
  const { ctx, page } = await fresh();
  await page.getByRole('link', { name: /Servis/i }).first().click();
  await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, '4feat-1-customer-name.png'), fullPage: true });
  console.log('shot 1: services list (customer name) OK');
  await ctx.close();
} catch (e) {
  console.log('shot 1 FAILED:', e.message);
}

// --- Shot 3: device categories card (Settings → Operasional) ---
try {
  const { ctx, page } = await fresh();
  await page.getByRole('link', { name: /Pengaturan/i }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Operasional/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByText('Kategori Perangkat').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '4feat-3-categories.png'), fullPage: true });
  console.log('shot 3: device categories card OK');
  await ctx.close();
} catch (e) {
  console.log('shot 3 FAILED:', e.message);
}

// --- Shot 4: wallet transfer UI (Settings → Wallet) ---
try {
  const { ctx, page } = await fresh();
  await page.getByRole('link', { name: /Pengaturan/i }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Wallet$/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByText('Transfer Saldo Antar Wallet').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '4feat-4-wallet-transfer.png'), fullPage: true });
  console.log('shot 4: wallet transfer UI OK');
  await ctx.close();
} catch (e) {
  console.log('shot 4 FAILED:', e.message);
}

// --- Shot 2: partial DP refund. Inject a DP first, then cancel. ---
try {
  const { ctx, page } = await fresh();
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

    // Try to inject a DP via the DP sub-action so the refund block has data.
    await upd.first().click();
    await page.waitForTimeout(300);
    const dpTab = page.getByRole('button', { name: /Terima DP|^DP$/i }).first();
    if (await dpTab.count()) {
      await dpTab.click().catch(() => {});
      await page.waitForTimeout(200);
      const dpInput = page.getByLabel(/Nominal DP/i);
      if (await dpInput.count()) {
        await dpInput.fill('50.000').catch(() => {});
        const sel = page.locator('select').first();
        if (await sel.count()) await sel.selectOption({ index: 1 }).catch(() => {});
        const saveDp = page.getByRole('button', { name: /Simpan DP|Simpan/i }).first();
        if (await saveDp.count()) { await saveDp.click().catch(() => {}); await page.waitForTimeout(700); }
      }
    }

    // Reopen the modal if it closed after saving DP.
    if (!(await page.getByText('REPAIR TICKET').count())) {
      await page.locator('a[href^="/services/"]').nth(i).click().catch(() => {});
      await page.waitForTimeout(300);
    }
    const upd2 = page.getByRole('button', { name: /Update Status/i });
    if (!(await upd2.count())) continue;
    await upd2.first().click();
    await page.waitForTimeout(300);
    const statusTab = page.getByRole('button', { name: 'Ubah Status', exact: true });
    if (await statusTab.count()) await statusTab.click();
    await page.waitForTimeout(150);
    const statusSelect = page.locator('select').first();
    const opts = await statusSelect.locator('option').allTextContents();
    if (opts.some((o) => /Batal/i.test(o))) {
      await statusSelect.selectOption({ label: 'Batal' }).catch(() => {});
      await page.waitForTimeout(400);
      if ((await page.getByText('Refund DP').count()) > 0) {
        await page.screenshot({ path: join(OUT, '4feat-2-refund-dp.png'), fullPage: true });
        console.log('shot 2: refund DP inputs shown at index', i, 'OK');
        done = true;
      }
    }
  }
  if (!done) console.log('shot 2: could not stage a DP+batal ticket (skipped)');
  await ctx.close();
} catch (e) {
  console.log('shot 2 FAILED:', e.message);
}

await browser.close();
console.log('done →', OUT);
