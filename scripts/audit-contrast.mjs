/**
 * Probe kontras DOM — mengukur warna teks yang BENAR-BENAR dirender, bukan
 * daftar token. Ini menangkap warna hasil racikan (`color-mix`, lapisan
 * semi-transparan, tumpukan latar) yang tak terlihat di scripts/audit-tokens.mjs.
 *
 * Komposit yang tidak bisa dipastikan — latar bergambar/gradien, atau rantai
 * induk yang tetap transparan — DILEWATI dan dihitung terpisah, bukan ditebak.
 *
 * Butuh dev server jalan:
 *   BASE_URL=http://localhost:5173 node scripts/audit-contrast.mjs
 *
 * Membandingkan dengan palet lama (tanpa menyentuh berkas kerja):
 *   git show <commit>:src/styles/tokens.css > /tmp/old.css
 *   BASELINE=/tmp/old.css node scripts/audit-contrast.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
/* BASELINE=<path ke tokens.css lama> menyuntikkan palet lama sebagai blok
   terakhir di dokumen, sehingga selektor yang identik menang. Ini memberi
   pembanding "sebelum" tanpa menyentuh berkas kerja. */
const BASELINE = process.env.BASELINE ? readFileSync(process.env.BASELINE, 'utf8') : null;
const browser = await chromium.launch();

const scan = () => {
  const parse = (c) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const lum = ([r, g, b]) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => {
    const a = fg[3];
    return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
  };

  /** Latar efektif sebuah elemen, atau null bila tidak bisa dipastikan. */
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null; // gradien/gambar
      const c = parse(s.backgroundColor);
      if (!c || c[3] === 0) continue;
      stack.push(c);
      if (c[3] === 1) {
        let acc = [c[0], c[1], c[2]];
        for (let i = stack.length - 2; i >= 0; i--) acc = over(stack[i], acc);
        return acc;
      }
    }
    return null;
  };

  const out = { fail: [], skipped: 0, checked: 0 };
  for (const el of document.querySelectorAll('*')) {
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('');
    if (!text) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (s.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue; // teks ber-gradien

    const fg = parse(s.color);
    const bg = bgOf(el);
    if (!fg || !bg) {
      out.skipped++;
      continue;
    }
    const f = fg[3] < 1 ? over(fg, bg) : [fg[0], fg[1], fg[2]];
    const [hi, lo] = [lum(f), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);

    const px = parseFloat(s.fontSize);
    const bold = +s.fontWeight >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const min = large ? 3 : 4.5;
    out.checked++;
    if (ratio < min) {
      out.fail.push({
        ratio: +ratio.toFixed(2),
        min,
        px: +px.toFixed(1),
        fg: s.color,
        bg: `rgb(${bg.map((v) => Math.round(v)).join(', ')})`,
        text: text.slice(0, 45),
        cls: (el.className && el.className.baseVal !== undefined
          ? el.className.baseVal
          : String(el.className || '')
        ).slice(0, 55),
      });
    }
  }
  return out;
};

const routes = [
  ['/demo', 'demo-dashboard'],
  ['/', 'landing'],
];

let total = 0;
for (const theme of ['dark', 'light']) {
  for (const [path, name] of routes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.evaluate((t) => {
      localStorage.setItem('fixmaster-theme', t);
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    if (BASELINE) {
      await page.evaluate((css) => {
        const el = document.createElement('style');
        el.textContent = css;
        document.head.appendChild(el);
      }, BASELINE);
    }
    await page.waitForTimeout(2500);
    const r = await page.evaluate(scan);
    total += r.fail.length;
    console.log(
      `\n${name} / ${theme} — diperiksa ${r.checked}, dilewati ${r.skipped} (komposit tak terbaca), gagal ${r.fail.length}`,
    );
    for (const f of r.fail.slice(0, 12)) {
      console.log(
        `  ${f.ratio}:1 (min ${f.min}) ${f.px}px  "${f.text}"
       fg ${f.fg}  bg ${f.bg}  .${f.cls}`,
      );
    }
    await page.close();
  }
}

// Menu lain di dalam demo. Demo memakai MemoryRouter — tak terjangkau lewat URL —
// jadi sidebar diklik. Sebelum ini hanya dashboard + landing yang diperiksa, dan
// 58 teks tema terang di bawah ambang (primitif terang tema gelap dipakai sebagai
// warna teks) tersembunyi di 9 halaman lain sampai 24 Sep 2026.
const MENUS = ['Servis', 'Kasir', 'Pelanggan', 'Inventori', 'Supplier', 'Keuangan',
  'Tugas Internal', 'Absensi', 'Laporan', 'Log Aktivitas', 'Pengaturan'];
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(BASE + '/demo', { waitUntil: 'networkidle' });
  await page.evaluate((t) => localStorage.setItem('fixmaster-theme', t), theme);
  await page.goto(BASE + '/demo', { waitUntil: 'networkidle' });
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  if (BASELINE) {
    await page.evaluate((css) => {
      const el = document.createElement('style');
      el.textContent = css;
      document.head.appendChild(el);
    }, BASELINE);
  }
  for (const menu of MENUS) {
    try {
      await page.getByRole('link', { name: new RegExp('^' + menu) }).first().click();
    } catch {
      console.log(`\ndemo-${menu} / ${theme} — navigasi gagal (tautan tak ditemukan)`);
      total++;
      continue;
    }
    await page.waitForTimeout(1300);
    const r = await page.evaluate(scan);
    total += r.fail.length;
    console.log(`\ndemo-${menu} / ${theme} — diperiksa ${r.checked}, dilewati ${r.skipped}, gagal ${r.fail.length}`);
    for (const f of r.fail.slice(0, 12)) {
      console.log(`  ${f.ratio}:1 (min ${f.min}) ${f.px}px  "${f.text}"
       fg ${f.fg}  bg ${f.bg}  .${f.cls}`);
    }
  }
  await page.close();
}

await browser.close();
console.log(`\n${total === 0 ? 'BERSIH' : 'ADA TEMUAN'} — ${total} elemen di bawah ambang`);
