/**
 * Zoom audit — browser zoom tidak mengubah lebar jendela fisik, ia mengubah
 * jumlah CSS px yang muat di dalamnya. Jadi zoom 80% pada jendela 1440px =
 * viewport 1800 CSS px, zoom 125% = 1152 CSS px. Emulasi lebar viewport itu
 * persis setara dengan zoom untuk urusan layout/media query.
 *
 * Yang diukur: overflow dokumen, overflow tiap wrapper tabel, dan overlap
 * kolom sticky AKSI di atas badge STATUS (akar masalah yang diperbaiki di
 * ServicesPage). Run: node scripts/audit-zoom.mjs
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5183';

// Lebar CSS-px ekuivalen zoom untuk jendela 1440 dan 1920.
const WIDTHS = [
  { w: 2400, note: '1920 @ 80%' },
  { w: 1920, note: '1920 @ 100%  /  1536 @ 80%' },
  { w: 1800, note: '1440 @ 80%' },
  { w: 1745, note: '1920 @ 110%' },
  { w: 1600, note: '1440 @ 90%' },
  { w: 1536, note: '1920 @ 125%' },
  { w: 1440, note: '1440 @ 100%  << kalibrasi fix lama' },
  { w: 1280, note: '1920 @ 150%' },
  { w: 1152, note: '1440 @ 125%' },
  { w: 1097, note: '1920 @ 175%  << tepat di bawah breakpoint 1100' },
  { w: 960,  note: '1440 @ 150%' },
];

const PAGES = ['/', '/services', '/pos', '/customers', '/inventory', '/suppliers',
  '/finance', '/tasks', '/attendance', '/reports', '/activity', '/settings'];

function probe() {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const out = { vw, docOver: doc.scrollWidth - vw, tables: [], overlaps: [], clipped: [] };

  // Tiap wrapper yang overflow-x: auto — berapa px isinya melebihi kotaknya.
  for (const el of document.querySelectorAll('div,section')) {
    const st = getComputedStyle(el);
    if (st.overflowX !== 'auto' && st.overflowX !== 'scroll') continue;
    const over = el.scrollWidth - el.clientWidth;
    if (el.querySelector('table') || over > 0) {
      const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 40);
      out.tables.push({ cls, client: el.clientWidth, scroll: el.scrollWidth, over });
    }
  }

  // Kolom sticky dengan background opaque yang menimpa isi sel sebelumnya.
  for (const cell of document.querySelectorAll('td,th')) {
    if (getComputedStyle(cell).position !== 'sticky') continue;
    const cr = cell.getBoundingClientRect();
    const row = cell.closest('tr');
    if (!row) continue;
    for (const sib of row.children) {
      if (sib === cell) continue;
      for (const inner of [sib, ...sib.querySelectorAll('*')]) {
        const r = inner.getBoundingClientRect();
        if (r.width === 0) continue;
        const ov = Math.round(r.right - cr.left);
        if (ov > 1 && r.left < cr.left) {
          const cls = (typeof inner.className === 'string' ? inner.className : '').slice(0, 30);
          out.overlaps.push({ el: inner.tagName.toLowerCase() + '.' + cls,
            text: (inner.textContent || '').trim().slice(0, 24), over: ov });
        }
      }
    }
  }

  // Teks yang terpotong di dalam kotaknya (ellipsis / clip diam-diam).
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 30);
      out.clipped.push({ el: el.tagName.toLowerCase() + '.' + cls, text: t.slice(0, 28),
        cut: el.scrollWidth - el.clientWidth });
    }
  }
  out.overlaps = out.overlaps.sort((a, b) => b.over - a.over).slice(0, 4);
  out.clipped = out.clipped.sort((a, b) => b.cut - a.cut).slice(0, 4);
  return out;
}

const browser = await chromium.launch();
const rows = [];

for (const { w, note } of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
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
    await page.waitForTimeout(900);
    const r = await page.evaluate(probe);
    rows.push({ w, note, page: p, ...r });
    const flags = [];
    if (r.docOver > 1) flags.push(`DOC+${r.docOver}`);
    r.tables.filter((t) => t.over > 0).forEach((t) => flags.push(`tbl+${t.over}`));
    r.overlaps.forEach((o) => flags.push(`OVERLAP ${o.over}px "${o.text}"`));
    if (flags.length) console.log(`${String(w).padStart(4)} ${p.padEnd(12)} ${flags.join('  ')}`);
  }
  await page.close();
  console.log(`--- ${w} (${note}) selesai`);
}

writeFileSync('scripts/shots/zoom-report.json', JSON.stringify(rows, null, 2));
await browser.close();
console.log('done');
