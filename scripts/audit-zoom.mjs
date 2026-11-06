/**
 * Zoom audit — browser zoom tidak mengubah lebar jendela fisik, ia mengubah
 * jumlah CSS px yang muat di dalamnya. Jadi zoom 80% pada jendela 1440px =
 * viewport 1800 CSS px, zoom 125% = 1152 CSS px. Emulasi lebar viewport itu
 * persis setara dengan zoom untuk urusan layout/media query.
 *
 * Yang diukur: overflow dokumen, overflow tiap wrapper tabel, dan overlap
 * kolom sticky AKSI di atas badge STATUS (akar masalah yang diperbaiki di
 * ServicesPage).
 *
 * Lewat /demo + navigasi via klik link (BUKAN page.goto ke rute app — itu
 * me-reload SPA dan membuang state demo; root sekarang landing cloud, bukan
 * lagi wizard "Isi data demo"). Semua WIDTHS di sini >720px jadi hanya dua
 * rezim yang berlaku: sidebar tetap (>1024) atau drawer off-canvas via
 * hamburger (721-1024, hanya lebar 960 di daftar bawah).
 *
 * Demo menyematkan 100% + Lapang (sesi sementara, lihat stores/zoom.ts), jadi
 * localStorage tidak berguna di sini: ZOOM dipasang lewat pintasan
 * Ctrl+Alt + = / − sesudah demo termuat, jalur yang sama dengan pengguna.
 * DENSITY=padat memasang atribut kerapatan langsung (efeknya murni CSS).
 *
 * Gerbang Lantai 12px: di ZOOM >= 1 setiap teks terlihat harus >= 12px efektif
 * (font-size x zoom). Pelanggaran ditandai TEXT<12 dan membuat proses keluar 1.
 * Run: node scripts/audit-zoom.mjs
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5183';
// ZOOM=1.25 menguji Pembesaran aplikasi (properti CSS `zoom` di :root),
// bukan zoom browser. Keduanya mengubah ruang layout, tapi hanya container
// query yang mengikuti — lihat ServicesPage.module.css.
const ZOOM = Number(process.env.ZOOM || 1);
const ZOOM_LEVELS = [0.9, 1, 1.1, 1.25, 1.5];
if (!ZOOM_LEVELS.includes(ZOOM)) {
  console.error(`ZOOM=${ZOOM} bukan level aplikasi (${ZOOM_LEVELS.join(', ')}).`);
  process.exit(2);
}
const DENSITY = process.env.DENSITY === 'padat' ? 'padat' : 'lapang';

/** Pasang Pembesaran lewat pintasan keyboard, lalu pastikan benar terpasang. */
async function applyView(page) {
  await page.locator('main').first().click({ position: { x: 4, y: 4 } });
  const steps = ZOOM_LEVELS.indexOf(ZOOM) - ZOOM_LEVELS.indexOf(1);
  for (let i = 0; i < Math.abs(steps); i++) {
    await page.keyboard.press(steps > 0 ? 'Control+Alt+Equal' : 'Control+Alt+Minus');
  }
  if (DENSITY === 'padat') {
    await page.evaluate(() => { document.documentElement.dataset.density = 'padat'; });
  }
  const got = await page.evaluate(() => getComputedStyle(document.documentElement).zoom);
  if (Math.abs(Number(got) - ZOOM) > 0.001) throw new Error(`zoom ${got}, harusnya ${ZOOM}`);
}

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

/** Navigasi in-app ke `path`, memilih klik yang benar untuk lebar saat ini. */
async function gotoInApp(page, path, w) {
  if (w > 1024) {
    await page.locator(`aside nav[aria-label="Navigasi utama"] a[href="${path}"]`).first().click();
    return;
  }
  await page.locator('button[aria-label="Menu"]').click();
  await page.waitForTimeout(250);
  await page.locator(`aside nav[aria-label="Navigasi utama"] a[href="${path}"]`).first().click();
}

function probe() {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const out = { vw, docOver: doc.scrollWidth - vw, tables: [], overlaps: [], clipped: [], minText: null };

  // Teks terkecil yang terlihat, dalam px efektif (font-size x zoom). Positif
  // palsu yang sudah dikenal dilewati: teks khusus pembaca layar (di-clip) dan
  // label SVG (sumbu grafik).
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || el.closest('svg')) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
    if (st.clip.startsWith('rect(0') || st.clipPath.includes('inset(50%')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const eff = parseFloat(st.fontSize) * (el.currentCSSZoom ?? 1);
    if (!out.minText || eff < out.minText.px) {
      const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 30);
      out.minText = { px: +eff.toFixed(2), el: el.tagName.toLowerCase() + '.' + cls, text: n.textContent.trim().slice(0, 24) };
    }
  }

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
let floorBreaks = 0;

for (const { w, note } of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('fixmaster-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href="/services"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await applyView(page);

  for (const p of PAGES) {
    await gotoInApp(page, p, w);
    await page.waitForTimeout(900);
    const r = await page.evaluate(probe);
    rows.push({ w, note, page: p, ...r });
    const flags = [];
    if (r.docOver > 1) flags.push(`DOC+${r.docOver}`);
    r.tables.filter((t) => t.over > 0).forEach((t) => flags.push(`tbl+${t.over}`));
    r.overlaps.forEach((o) => flags.push(`OVERLAP ${o.over}px "${o.text}"`));
    if (ZOOM >= 1 && r.minText && r.minText.px < 11.99) {
      floorBreaks++;
      flags.push(`TEXT<12 ${r.minText.px}px "${r.minText.text}" (${r.minText.el})`);
    }
    if (flags.length) console.log(`${String(w).padStart(4)} ${p.padEnd(12)} ${flags.join('  ')}`);
  }
  await page.close();
  console.log(`--- ${w} (${note}) selesai`);
}

writeFileSync('scripts/shots/zoom-report.json', JSON.stringify(rows, null, 2));
await browser.close();
console.log(`done (zoom ${ZOOM}, ${DENSITY}) — pelanggaran lantai 12px: ${floorBreaks}`);
if (floorBreaks) process.exitCode = 1;
