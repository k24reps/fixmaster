/**
 * Audit mobile — mencari SEMUA sumber scroll horizontal, baik yang tak sengaja
 * (dokumen meluber) maupun yang dulu disengaja (carousel scroll-snap).
 * Run: node scripts/audit-mobile.mjs
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5183';
// Lebar ponsel nyata. 320 = batas bawah yang masih dipakai (SE lama, Android murah).
// WIDTHS=768,1024,1152 untuk menyapu pita tablet.
const WIDTHS = (process.env.WIDTHS || '320,360,375,390,414').split(',').map(Number);
// Tablet bukan ponsel: sidebar muncul di >=1025px sehingga ruang konten
// justru MENYUSUT saat viewport melebar. isMobile dimatikan di >=768px.
const MOBILE = Number(process.env.MOBILE ?? 1) === 1;
const PAGES = ['/', '/services', '/pos', '/customers', '/inventory', '/suppliers',
  '/finance', '/tasks', '/attendance', '/reports', '/activity', '/settings'];

function probe() {
  const d = document.documentElement;
  const vw = d.clientWidth;
  const out = { vw, docOver: d.scrollWidth - vw, scrollers: [], offenders: [], tiny: [] };

  const nama = (el) => {
    const c = typeof el.className === 'string' ? el.className : '';
    return el.tagName.toLowerCase() + '.' + (c.replace(/_[A-Za-z0-9]{5,}_[A-Za-z0-9]+/g, '').trim().split(/\s+/)[0]
      || c.split(/\s+/)[0] || '');
  };

  // Elemen yang benar-benar bisa di-scroll ke samping.
  for (const el of document.querySelectorAll('body *')) {
    const st = getComputedStyle(el);
    if (!['auto', 'scroll'].includes(st.overflowX)) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) out.scrollers.push({ el: nama(el), over, snap: st.scrollSnapType !== 'none' });
  }

  // Elemen yang menonjol keluar viewport (penyebab scroll dokumen).
  if (out.docOver > 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2) {
        out.offenders.push({ el: nama(el), right: Math.round(r.right), w: Math.round(r.width) });
        if (out.offenders.length >= 6) break;
      }
    }
  }

  // Target sentuh di bawah 40px (pedoman minimum yang wajar untuk jari).
  for (const el of document.querySelectorAll('button, a[href], [role=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 32)) {
      out.tiny.push({ el: nama(el), h: Math.round(r.height), w: Math.round(r.width),
        teks: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) });
    }
  }
  out.tiny = out.tiny.slice(0, 6);
  return out;
}

const browser = await chromium.launch();
const rows = [];
for (const w of WIDTHS) {
  const page = await browser.newPage({
    viewport: { width: w, height: 900 }, deviceScaleFactor: 2, hasTouch: true, isMobile: MOBILE,
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('fixmaster-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Isi data demo/ }).click();
  await page.waitForSelector('a[href="/services"]', { timeout: 20000 });
  for (const p of PAGES) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const r = await page.evaluate(probe);
    rows.push({ w, page: p, ...r });
    const bits = [];
    if (r.docOver > 1) bits.push(`DOC+${r.docOver} [${r.offenders.map((o) => o.el).join(', ')}]`);
    for (const s of r.scrollers) bits.push(`${s.snap ? 'carousel' : 'SCROLL-X'} ${s.el}+${s.over}`);
    if (bits.length) console.log(`${w} ${p.padEnd(12)} ${bits.join('  ')}`);
  }
  await page.close();
  console.log(`--- ${w}px selesai`);
}
writeFileSync('scripts/shots/mobile-report.json', JSON.stringify(rows, null, 2));
await browser.close();
console.log('done');
