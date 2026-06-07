/**
 * Screenshot the new "Outlet" wizard step (Fase 0D.2). A fresh Playwright
 * context has empty storage, so the onboarding wizard shows. We fill the shop
 * name on step 1, advance to the Outlet step, and capture both the default
 * single-outlet view and the multi-branch view (after "Tambah Cabang").
 *
 * Run with dev server up:  node scripts/shoot-wizard-outlet.mjs
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
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 1100 });

await page.goto(BASE, { waitUntil: 'networkidle' });

// Step 1 (Profil): fill the shop name so step validation passes.
const shopInput = page.getByPlaceholder(/TechFix Center/i);
await shopInput.waitFor({ timeout: 10000 });
await shopInput.fill('Konter Jaya Ponsel');
await page.getByPlaceholder(/Sudirman/i).fill('Jl. Merdeka No. 1, Bandung');

// Advance to the Outlet step (2nd visible step).
await page.getByRole('button', { name: /Lanjut/i }).click();
await page.getByText('Outlet / Lokasi').waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'wizard-outlet-single.png'), fullPage: true });
console.log('shot: wizard-outlet-single (default 1 outlet, inherits shop name)');

// Add a branch → multi-outlet view.
await page.getByRole('button', { name: /Tambah Cabang/i }).click();
await page.waitForTimeout(300);
// Name the new branch so it looks realistic.
const nameInputs = page.getByPlaceholder(/Nama cabang/i);
await nameInputs.first().fill('Cabang Dago');
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'wizard-outlet-multi.png'), fullPage: true });
console.log('shot: wizard-outlet-multi (added branch)');

await browser.close();
console.log('PASS → wizard outlet step renders (single + multi)');
