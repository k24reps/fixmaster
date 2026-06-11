/**
 * Visual verification for the 5 pilot UX/bug fixes:
 *   #1 toast on "Salin tracking" (service detail, via /demo)
 *   #3 mobile topbar (app via /demo, + landing) — title must not truncate
 *   #4 auth "Beranda" back button raised to terminalTop (via /?auth=1)
 *   #5 theme toggle on landing + auth (dark/light)
 *
 * Run with the dev server up:  node scripts/shoot-pilot-fixes.mjs
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

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

// ---------- Landing: desktop dark/light (#5 toggle) + mobile (#3) ----------
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.25 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `pilot-landing-${theme}.png`) });
  console.log('shot: landing', theme);
  await page.close();
}
{
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await m.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(m, 'dark');
  await m.waitForTimeout(500);
  await m.screenshot({ path: join(OUT, 'pilot-landing-mobile.png') });
  console.log('shot: landing-mobile');
  await m.close();
}

// ---------- Auth screen: desktop dark/light (#4 back btn + #5 toggle) ----------
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1.25 });
  await page.goto(`${BASE}/?auth=1`, { waitUntil: 'networkidle' });
  await setTheme(page, theme);
  await page.waitForTimeout(600);
  try {
    await page.getByText('Terminal Akses').waitFor({ timeout: 8000 });
  } catch {
    console.log('  (auth screen not reached for', theme, ')');
  }
  await page.screenshot({ path: join(OUT, `pilot-auth-${theme}.png`) });
  console.log('shot: auth', theme);
  await page.close();
}

// ---------- App topbar mobile via /demo (#3) ----------
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await setTheme(page, 'dark');
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  try {
    await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    // On mobile the sidebar is behind a hamburger — open it, pick Servis, it
    // auto-closes on navigation.
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('link', { name: /Servis/i }).first().click();
    await page.waitForTimeout(900);
    // topbar title should read "Servis" (not truncated to "Se").
    await page.screenshot({ path: join(OUT, 'pilot-topbar-mobile.png') });
    console.log('shot: topbar-mobile (services)');

    // #1 toast: open first ticket, click "Salin tracking".
    await page.waitForSelector('a[href^="/services/"]', { timeout: 10000 });
    await page.locator('a[href^="/services/"]').first().click();
    await page.waitForSelector('text=REPAIR TICKET', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Salin tracking/i }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, 'pilot-copy-toast.png') });
    console.log('shot: copy-toast');
  } catch (e) {
    console.log('demo flow error:', String(e).slice(0, 160));
    await page.screenshot({ path: join(OUT, 'pilot-demo-error.png') });
  }
  await page.close();
}

await browser.close();
console.log('done →', OUT);
