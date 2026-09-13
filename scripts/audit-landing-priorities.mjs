/**
 * Regression probe for the seven landing-audit priorities that need a browser:
 * explicit auth intent, skip-link focus, and the narrow mobile support layout.
 * Run with the dev server up: node scripts/audit-landing-priorities.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];

function check(condition, message, detail) {
  if (!condition) failures.push({ message, detail });
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.locator('main#top').waitFor();

const mobile = await page.evaluate(() => {
  const floating = document.querySelector('a[class*="whatsapp"]');
  const footerSupport = [...document.querySelectorAll('footer a')].find((link) =>
    link.textContent?.includes('WhatsApp'),
  );
  const status = document.querySelector('[class*="voltBayStatus"] strong');
  return {
    floatingDisplay: floating ? getComputedStyle(floating).display : null,
    footerSupportVisible: Boolean(
      footerSupport && footerSupport.getClientRects().length > 0,
    ),
    voltStatusFont: status ? Number.parseFloat(getComputedStyle(status).fontSize) : 0,
  };
});
check(mobile.floatingDisplay === 'none', 'Floating WhatsApp masih menutup konten ponsel', mobile);
check(mobile.footerSupportVisible, 'Tautan WhatsApp pengganti tidak terlihat di footer', mobile);
check(mobile.voltStatusFont >= 14, 'Status VOLT di mobile masih di bawah 14px', mobile);

await page.locator('a[href="#top"]').first().focus();
await page.keyboard.press('Enter');
check(await page.locator('main#top').evaluate((main) => document.activeElement === main),
  'Skip link tidak memindahkan fokus ke konten utama');

await page.getByRole('button', { name: 'Mulai gratis 14 hari' }).first().click();
await page.getByRole('heading', { name: 'Buka bench baru' }).waitFor();
check(new URL(page.url()).searchParams.get('auth') === 'signup',
  'CTA trial tidak membuka mode signup', page.url());

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.locator('#pricing').scrollIntoViewIfNeeded();
const proPlate = page.locator('#pricing article').filter({ hasText: 'Pro' }).last();
await proPlate.getByRole('button', { name: 'Mulai gratis dengan Pro' }).click();
await page.getByRole('heading', { name: 'Buka bench baru' }).waitFor();
const proUrl = new URL(page.url());
check(proUrl.searchParams.get('plan') === 'enterprise',
  'Pilihan paket Pro tidak dipertahankan', page.url());
check(proUrl.searchParams.get('source') === 'pricing_pro',
  'Sumber CTA Pro tidak dipertahankan', page.url());

await browser.close();

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, mobile, proUrl: proUrl.toString() }, null, 2));
}
