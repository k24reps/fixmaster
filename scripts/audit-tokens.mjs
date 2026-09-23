/**
 * Gerbang palet — membaca src/styles/tokens.css, meresolusi rantai var(), lalu
 * memeriksa dua hal yang tidak bisa dilihat mata dari satu berkas CSS:
 *
 *  1. KONTRAS pasangan warna yang benar-benar dirender UI (WCAG AA).
 *  2. PEMISAHAN antar warna sinyal. `STATUS_TONE` (lib/business/services.ts)
 *     memetakan 8 status servis ke hanya 5 rona, jadi dua warna yang terlalu
 *     mirip langsung menjadi dua status yang tak terbedakan. Ini pernah nyata:
 *     --warning #f59e0b vs --brand #f5a623 hanya berjarak dE 0.018, membuat
 *     "Diterima", "Konfirmasi Biaya", dan "Tunggu Sparepart" tampil sama.
 *
 * Hanya warna solid yang diuji. Apa pun yang semi-transparan dilewati dan
 * didaftar, karena kontras aslinya bergantung pada apa yang ada di belakangnya
 * — menebak di situ yang dulu melahirkan temuan palsu.
 *
 * Tidak butuh dev server:  node scripts/audit-tokens.mjs
 * Pelengkapnya yang mengukur DOM sungguhan: scripts/audit-contrast.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');

/** Split the file into the three cascading blocks we care about. */
function block(startRe) {
  const i = css.search(startRe);
  if (i < 0) throw new Error('block not found: ' + startRe);
  const open = css.indexOf('{', i);
  const close = css.indexOf('\n}', open);
  return css.slice(open, close);
}

function decls(text) {
  const out = {};
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const root = decls(block(/^:root \{/m));
const darkBlock = decls(block(/:root,\s*:root\[data-theme='dark'\] \{/));
const lightBlock = decls(block(/:root\[data-theme='light'\] \{/));

const themes = {
  dark: { ...root, ...darkBlock },
  light: { ...root, ...lightBlock },
};

function resolve(vars, value, depth = 0) {
  if (depth > 10) return value;
  const m = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!m) return value.trim();
  const next = vars[m[1]];
  return next === undefined ? value : resolve(vars, next, depth + 1);
}

function toRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* fg, bg, minimum ratio, what it is. 3.0 = large text / UI boundary. */
const PAIRS = [
  ['--text-primary', '--bg-app', 4.5, 'teks utama di latar app'],
  ['--text-primary', '--bg-surface', 4.5, 'teks utama di kartu'],
  ['--text-primary', '--bg-elevated', 4.5, 'teks utama di panel terangkat'],
  ['--text-secondary', '--bg-surface', 4.5, 'teks sekunder di kartu'],
  ['--text-secondary', '--bg-app', 4.5, 'teks sekunder di latar app'],
  ['--text-muted', '--bg-surface', 4.5, 'teks redup di kartu'],
  ['--text-muted', '--bg-app', 4.5, 'teks redup di latar app'],
  ['--text-muted', '--bg-surface-2', 4.5, 'teks redup di kartu sekunder'],
  ['--text-primary', '--bg-input', 4.5, 'teks isian'],
  ['--text-muted', '--bg-input', 4.5, 'placeholder isian'],
  ['--on-brand', '--brand', 4.5, 'label di tombol brand'],
  /* Tombol success memakai tinta gelap; tombol danger memakai --red-600 solid.
     --info tidak pernah membawa teks (hanya LED/dot), jadi tidak diuji. */
  ['--on-signal', '--success', 4.5, 'label di tombol success'],
  ['--on-solid', '--red-600', 4.5, 'label di tombol danger'],
  ['--on-solid', '--red-700', 4.5, 'label di tombol danger (hover)'],
  ['--brand-text', '--bg-surface', 4.5, 'teks brand di kartu'],
  ['--brand-text', '--bg-app', 4.5, 'teks brand di latar app'],
  ['--accent-text', '--bg-surface', 4.5, 'teks aksen di kartu'],
  ['--success-text', '--bg-surface', 4.5, 'teks success di kartu'],
  ['--warning-text', '--bg-surface', 4.5, 'teks warning di kartu'],
  ['--danger-text', '--bg-surface', 4.5, 'teks danger di kartu'],
  ['--info-text', '--bg-surface', 4.5, 'teks info di kartu'],
  ['--success-text', '--bg-app', 4.5, 'teks success di latar app'],
  ['--warning-text', '--bg-app', 4.5, 'teks warning di latar app'],
  ['--danger-text', '--bg-app', 4.5, 'teks danger di latar app'],
  ['--info-text', '--bg-app', 4.5, 'teks info di latar app'],
  ['--text-primary', '--rail-bg', 4.5, 'teks di sidebar'],
  ['--text-muted', '--rail-bg', 4.5, 'teks redup di sidebar'],
  ['--text-primary', '--rail-panel', 4.5, 'teks di panel sidebar'],
  ['--text-primary', '--rail-control', 4.5, 'teks di kontrol sidebar'],
  ['--readout-text', '--readout-base', 4.5, 'angka instrumen'],
  ['--readout-muted', '--readout-base', 4.5, 'label instrumen'],
  ['--readout-muted-2', '--readout-surface', 4.5, 'label instrumen redup'],
  /* Non-text: warna sinyal harus terpisah dari latarnya sebagai bentuk. */
  ['--brand', '--bg-surface', 3, 'isian brand sebagai bentuk'],
  ['--success', '--bg-surface', 3, 'isian success sebagai bentuk'],
  ['--warning', '--bg-surface', 3, 'isian warning sebagai bentuk'],
  ['--danger', '--bg-surface', 3, 'isian danger sebagai bentuk'],
  ['--info', '--bg-surface', 3, 'isian info sebagai bentuk'],
  ['--accent', '--bg-surface', 3, 'isian aksen sebagai bentuk'],
  ['--focus-ring', '--bg-app', 3, 'cincin fokus di latar app'],
  ['--focus-ring', '--bg-surface', 3, 'cincin fokus di kartu'],
];

/* Warna sinyal harus saling terpisah: STATUS_TONE memetakan 8 status servis ke
   hanya 5 rona, jadi dua warna yang berdekatan langsung jadi dua status yang
   tak terbedakan.
   Jaraknya diukur sebagai delta-E OKLab, bukan selisih derajat rona HSV: di
   wilayah emas/oranye, HSV memampatkan warna-warna yang mata jelas bedakan ke
   dalam sedikit derajat, sehingga emas vs oranye terbaca "hanya 10 derajat"
   padahal nyata berbeda. Ambang 0.10 dikalibrasi dari pasangan lama
   #f5a623 vs #f59e0b, yang praktis warna sama dan dicetak sebagai pembanding. */
const DE_MIN = 0.1;
const DE_PAIRS = [
  ['--brand', '--warning', 'Diterima vs Konfirmasi/Tunggu Sparepart'],
  ['--warning', '--danger', 'peringatan vs batal'],
  ['--info', '--accent', 'info vs aksen'],
  ['--success', '--accent', 'success vs aksen'],
  ['--brand', '--danger', 'Diterima vs Dibatalkan'],
  ['--success', '--info', 'selesai vs dikerjakan'],
  /* Versi teks dari rona yang sama — inilah yang benar-benar bersebelahan di
     pil status, jadi ia harus lolos pemisahan yang sama, bukan hanya isiannya. */
  ['--brand-text', '--warning-text', 'teks: Diterima vs Konfirmasi/Tunggu'],
  ['--warning-text', '--danger-text', 'teks: peringatan vs batal'],
  ['--success-text', '--accent-text', 'teks: success vs aksen'],
  ['--info-text', '--accent-text', 'teks: info vs aksen'],
];

/* sRGB -> OKLab (Björn Ottosson). */
function oklab([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deltaE(a, b) {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

let failures = 0;
const skipped = [];

for (const [theme, vars] of Object.entries(themes)) {
  console.log(`\n=== ${theme.toUpperCase()} ===`);
  for (const [fgName, bgName, min, what] of PAIRS) {
    const fgRaw = vars[fgName];
    const bgRaw = vars[bgName];
    if (fgRaw === undefined || bgRaw === undefined) {
      skipped.push(`${theme}  ${fgName} / ${bgName} — token tidak ada`);
      continue;
    }
    const fg = toRgb(resolve(vars, fgRaw));
    const bg = toRgb(resolve(vars, bgRaw));
    if (!fg || !bg) {
      skipped.push(`${theme}  ${what} — tidak solid, dilewati`);
      continue;
    }
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(
      `${ok ? 'OK  ' : 'GAGAL'} ${r.toFixed(2).padStart(6)} : 1  (min ${min})  ${what}`,
    );
  }

  for (const [aName, bName, what] of DE_PAIRS) {
    const a = toRgb(resolve(vars, vars[aName] ?? ''));
    const b = toRgb(resolve(vars, vars[bName] ?? ''));
    if (!a || !b) {
      skipped.push(`${theme}  jarak ${what} — tidak solid`);
      continue;
    }
    const d = deltaE(a, b);
    const ok = d >= DE_MIN;
    if (!ok) failures++;
    console.log(
      `${ok ? 'OK  ' : 'GAGAL'} jarak dE ${d.toFixed(3).padStart(6)}  (min ${DE_MIN})  ${what}`,
    );
  }
}

/* Pembanding: pasangan lama yang memang tak terbedakan. */
const OLD_BRAND = toRgb('#f5a623');
const OLD_WARNING = toRgb('#f59e0b');
console.log(
  `\nPembanding — palet LAMA brand vs warning: dE ${deltaE(OLD_BRAND, OLD_WARNING).toFixed(3)}` +
    ` (inilah "terlalu mirip" yang dikoreksi)`,
);

if (skipped.length) {
  console.log('\nDilewati (tidak bisa diukur dari token saja):');
  for (const s of skipped) console.log('  ' + s);
}

console.log(`\n${failures === 0 ? 'LULUS' : 'GAGAL'} — ${failures} pelanggaran`);
process.exit(failures === 0 ? 0 : 1);
