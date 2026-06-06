/**
 * Modal verification shots. Seeds data, opens each refactored modal by
 * clicking its trigger button (matched by visible text), and screenshots
 * the dialog in dark + light. Exits non-zero if a modal fails to open.
 *
 * Run:  BASE_URL=http://localhost:5173 node scripts/shoot-modals.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };

const browser = await chromium.launch();

async function ready(page, theme) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });
  await page.waitForSelector('a[href="/services"]', { timeout: 10000 });
  await page.waitForTimeout(400);
}

// name, route, button text (regex) to open the modal
const MODALS = [
  { name: 'modal-service', route: '/services', btn: /Servis Baru|Tambah/i },
  { name: 'modal-customer', route: '/customers', btn: /Pelanggan Baru|Tambah/i },
  { name: 'modal-inventory', route: '/inventory', btn: /Sparepart Baru|Tambah|Baru/i },
  { name: 'modal-supplier', route: '/suppliers', btn: /Supplier Baru|Tambah|Baru/i },
  { name: 'modal-finance', route: '/finance', btn: /Pemasukan|Tambah/i },
];

for (const theme of ['dark', 'light']) {
  for (const m of MODALS) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await ready(page, theme);
    await page.goto(BASE + '#' + m.route, { waitUntil: 'networkidle' }).catch(() => {});
    // SPA uses client routing; navigate via the sidebar link to be safe.
    await page.click(`aside a[href="${m.route}"]`).catch(() => {});
    await page.waitForTimeout(600);

    // Click the trigger button matched by text.
    const btn = page.getByRole('button', { name: m.btn }).first();
    try {
      await btn.click({ timeout: 4000 });
    } catch {
      fail(`${m.name} (${theme}): trigger button not found`);
      await ctx.close();
      continue;
    }
    const dialog = page.locator('[role="dialog"]').first();
    try {
      await dialog.waitFor({ state: 'visible', timeout: 4000 });
    } catch {
      fail(`${m.name} (${theme}): dialog did not open`);
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(350);
    if (theme === 'dark') {
      await dialog.screenshot({ path: join(OUT, `${m.name}-dark.png`) });
    } else {
      await dialog.screenshot({ path: join(OUT, `${m.name}-light.png`) });
    }
    console.log(`shot: ${m.name}-${theme}`);
    await ctx.close();
  }
}

await browser.close();
console.log(process.exitCode ? 'DONE WITH FAILURES' : 'ALL MODALS OK');
