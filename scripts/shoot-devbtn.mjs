/**
 * Dev-seed button verification — a fresh Playwright context has empty storage,
 * so the onboarding wizard shows. We screenshot the wizard (with the dev bar),
 * click "Isi data demo & masuk", then confirm we land on the authenticated
 * dashboard (diagnostic strip present). This is a functional test: it only
 * passes if the button truly seeds + signs in.
 *
 * Run with dev server up:  node scripts/shoot-devbtn.mjs
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

// Wizard should appear (empty workspace). Confirm the dev bar button is there.
const devBtn = page.getByRole('button', { name: /Isi data demo/i });
await devBtn.waitFor({ timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'devbtn-wizard.png'), fullPage: true });
console.log('shot: devbtn-wizard (button present)');

// Click it → should seed + sign in → dashboard diagnostic strip appears.
await devBtn.click();
await page.waitForSelector("section[aria-label='Status diagnostik']", { timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, 'devbtn-landed.png'), fullPage: true });
console.log('shot: devbtn-landed (reached authenticated dashboard)');

await browser.close();
console.log('PASS → dev button seeds + signs in');
