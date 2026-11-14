/**
 * Foto tab Pengaturan > Saldo (harga per unit, migrasi 0101) lewat cangkang
 * demo publik, plus dialog Hapus Tiket di Detail Servis.
 *
 * Tab Saldo hanya tampil bila `isSupabaseConfigured`, jadi dev server harus
 * jalan dengan env Supabase terisi. Nilai tiruan cukup karena demo memakai
 * adapter RAM:
 *   VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=x npm run dev
 *   BASE_URL=http://127.0.0.1:5173 node scripts/shoot-saldo.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(out, { recursive: true });

const overflowOf = (page) =>
  page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, className: String(element.className), left: rect.left, right: rect.right };
      })
      .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
      .slice(0, 12),
  }));

// PW_CHROMIUM: jalur browser bila versi Playwright proyek berbeda dari browser
// yang terpasang (mis. container cloud: /opt/pw-browsers/chromium).
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: theme });
  await page.goto(`${base}/demo`, { waitUntil: 'networkidle' });
  await page.locator('a[href="/settings"]').first().click();
  await page.getByRole('button', { name: 'Saldo' }).click();
  await page.getByText('Saldo Unit').waitFor();
  await page.evaluate((nextTheme) => {
    document.documentElement.setAttribute('data-theme', nextTheme);
  }, theme);
  await page.screenshot({ path: join(out, `saldo-${theme}.png`), fullPage: true });
  await page.close();
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${base}/demo`, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: 'Lainnya' }).click();
await mobile.getByRole('dialog').getByRole('link', { name: 'Pengaturan' }).click();
await mobile.getByRole('button', { name: 'Saldo' }).click();
await mobile.getByText('Saldo Unit').waitFor();
const overflow = await overflowOf(mobile);
console.log('saldo-mobile', JSON.stringify(overflow));
if (overflow.scrollWidth > overflow.viewport + 1) process.exitCode = 1;
await mobile.screenshot({ path: join(out, 'saldo-mobile.png'), fullPage: true });
await mobile.close();

// Hapus tiket: tiket bersih membuka konfirmasi; tiket yang memegang uang atau
// sparepart dijelaskan lewat toast. Demo memakai router memori, jadi tiket
// dibuka dengan mengeklik tautannya, bukan lewat URL.
const detail = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const openServices = async () => {
  await detail.goto(`${base}/demo`, { waitUntil: 'networkidle' });
  await detail.locator('a[href="/services"]').first().click();
  await detail.waitForTimeout(800);
};
await openServices();
// Id tiket dibuat ulang setiap kali demo dimuat, jadi tiket dipilih menurut urutan.
const total = await detail.locator('a[href^="/services/"]').count();
let shotDialog = false;
let shotBlocked = false;
for (let i = 0; i < total && !(shotDialog && shotBlocked); i += 1) {
  await openServices();
  await detail.locator('a[href^="/services/"]').nth(i).click();
  const button = detail.getByRole('button', { name: 'Hapus Tiket' });
  try {
    await button.first().waitFor({ timeout: 3000 });
  } catch {
    continue;
  }
  await button.first().click();
  await detail.waitForTimeout(300);
  const dialogOpen = (await detail.getByRole('dialog').count()) > 0;
  if (dialogOpen && !shotDialog) {
    await detail.screenshot({ path: join(out, 'hapus-tiket-dialog.png') });
    shotDialog = true;
  } else if (!dialogOpen && !shotBlocked) {
    await detail.screenshot({ path: join(out, 'hapus-tiket-ditahan.png') });
    shotBlocked = true;
  }
}
console.log('hapus-tiket dialog:', shotDialog, '· ditahan:', shotBlocked);
await detail.close();
await browser.close();
