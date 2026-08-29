/**
 * Hardening probe for the landing owner-proof section.
 * Exercises narrow/tablet/desktop widths, 200% text scaling, and synthetic
 * long strings so clipped proof copy cannot hide behind page-level overflow: clip.
 * Run with the dev server up: node scripts/audit-landing-owner.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const WIDTHS = [320, 360, 390, 744, 980, 1025, 1112, 1440];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function inspect(label) {
  const result = await page.locator('#owner-proof').evaluate((owner) => {
    const viewportWidth = document.documentElement.clientWidth;
    const selectors = 'h2, p, li, article, header, dl, dt, dd, [role="group"], footer';
    const offenders = [...owner.querySelectorAll(selectors)]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter(({ left, right, scrollWidth, clientWidth }) => (
        left < -1 || right > viewportWidth + 1 || scrollWidth > clientWidth + 1
      ));

    return {
      viewportWidth,
      documentWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });

  const failed = result.documentWidth > result.viewportWidth + 1 || result.offenders.length > 0;
  console.log(`${failed ? 'FAIL' : 'OK  '} ${label}`, JSON.stringify(result));
  return failed;
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('fixmaster-theme', 'dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});

let failed = false;
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 1000 });
  failed = (await inspect(`${width}px`)) || failed;
}

await page.setViewportSize({ width: 390, height: 1000 });
await page.locator('#owner-proof').evaluate((owner) => {
  const set = (selector, value) => {
    const element = owner.querySelector(selector);
    if (element) element.textContent = value;
  };
  set('h2', 'Lihat margin servis perangkat elektronik dengan nama yang sangat panjang sebelum toko tutup');
  set('p', 'Tagihan pelanggan, modal sparepart, dan margin tetap terhubung ke tiket meski deskripsi pekerjaan, nama pelanggan, dan nama perangkat jauh lebih panjang dari data contoh.');
  set('dd', 'Muhammad Rizky Pratama Wijayakusuma 🔧📱 — Pelanggan Prioritas Cabang Utama');
  set('.ownerReadout strong', 'Tercatat otomatis pada setiap tiket servis');
  set('.marginTerm small', 'Tagihan servis pelanggan');
  set('.marginTerm strong', 'Rp 12.345.678.901');
});
failed = (await inspect('390px + long copy')) || failed;

await page.evaluate(() => {
  document.documentElement.dir = 'rtl';
  const owner = document.querySelector('#owner-proof');
  const heading = owner?.querySelector('h2');
  const lead = owner?.querySelector('p');
  if (heading) heading.textContent = 'اعرف هامش الربح لكل عملية إصلاح قبل إغلاق المتجر';
  if (lead) lead.textContent = 'تظل رسوم العميل وتكلفة قطع الغيار والهامش مرتبطة بكل تذكرة صيانة.';
});
failed = (await inspect('390px + RTL')) || failed;

await page.emulateMedia({ forcedColors: 'active' });
failed = (await inspect('390px + forced colors')) || failed;
await page.emulateMedia({ forcedColors: 'none' });

await page.setViewportSize({ width: 1440, height: 1000 });
await page.evaluate(() => {
  document.documentElement.dir = 'ltr';
  document.documentElement.style.fontSize = '200%';
});
failed = (await inspect('1440px + long RTL-origin copy + 200% text')) || failed;

await browser.close();
if (failed) process.exitCode = 1;
