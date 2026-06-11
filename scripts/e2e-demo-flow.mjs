/**
 * TIER 4 — E2E functional flow (Playwright + assertions, BUKAN screenshot).
 *
 * Menggantikan "klik manual menu-ke-menu": menjelajah SEMUA menu di demo
 * (/demo, in-memory self-seed, tanpa DB) dan MEMERIKSA tiap halaman benar-benar
 * render (ada konten, tak blank, tak crash), sambil menangkap console error &
 * pageerror sebagai bukti bug fungsional.
 *
 * Output: ringkasan PASS/FAIL per menu + daftar error → dipakai laporan temuan.
 * Exit code 1 bila ada menu gagal render atau ada pageerror.
 *
 * Jalankan dengan dev server hidup:  node scripts/e2e-demo-flow.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

// Menu yang dijelajah di dalam demo (MemoryRouter → navigasi via klik sidebar).
// "Pengaturan" sengaja dilewati (dikecualikan dari demo per keputusan user).
const MENUS = [
  { label: /Dashboard|Beranda/i, name: 'Dashboard' },
  { label: /Servis/i, name: 'Servis' },
  { label: /Kasir|POS/i, name: 'Kasir' },
  { label: /Pelanggan/i, name: 'Pelanggan' },
  { label: /Inventori/i, name: 'Inventori' },
  { label: /Supplier/i, name: 'Supplier' },
  { label: /Keuangan/i, name: 'Keuangan' },
  { label: /Tugas/i, name: 'Tugas' },
  { label: /Absensi/i, name: 'Absensi' },
  { label: /Laporan/i, name: 'Laporan' },
];

const results = [];
const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
});
page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 200)));

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

try {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  // Tunggu faceplate "MODE DEMO" (muncul setelah seed in-memory selesai).
  await page.getByText('MODE DEMO').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  record('Boot demo (MODE DEMO + seed)', true);

  // Dashboard harus punya konten bermakna (angka/teks), bukan blank.
  const mainText = (await page.locator('main').first().innerText().catch(() => '')) || '';
  record('Dashboard ada konten', mainText.trim().length > 20, `${mainText.trim().length} chars`);

  for (const menu of MENUS) {
    const before = pageErrors.length;
    try {
      const link = page.getByRole('link', { name: menu.label }).first();
      const count = await link.count();
      if (count === 0) {
        record(`Menu ${menu.name}`, false, 'link tidak ditemukan di sidebar');
        continue;
      }
      await link.click();
      await page.waitForTimeout(800);
      const txt = (await page.locator('main').first().innerText().catch(() => '')) || '';
      const rendered = txt.trim().length > 10;
      const noNewError = pageErrors.length === before;
      record(`Menu ${menu.name}`, rendered && noNewError, rendered ? '' : 'konten kosong/blank');
    } catch (e) {
      record(`Menu ${menu.name}`, false, String(e).slice(0, 80));
    }
  }
} catch (e) {
  record('Boot demo', false, String(e).slice(0, 150));
}

await browser.close();

// ---- Ringkasan ----
const failed = results.filter((r) => !r.ok);
console.log('\n===== RINGKASAN E2E DEMO =====');
console.log(`Menu/cek: ${results.length} | PASS: ${results.length - failed.length} | FAIL: ${failed.length}`);
console.log(`Console errors: ${consoleErrors.length} | Page errors: ${pageErrors.length}`);
if (consoleErrors.length) {
  console.log('\n-- Console errors (maks 10) --');
  consoleErrors.slice(0, 10).forEach((e) => console.log('  •', e));
}
if (pageErrors.length) {
  console.log('\n-- Page errors (maks 10) --');
  pageErrors.slice(0, 10).forEach((e) => console.log('  •', e));
}
if (failed.length) {
  console.log('\n-- Gagal --');
  failed.forEach((r) => console.log('  ×', r.name, r.detail));
}

const hardFail = failed.length > 0 || pageErrors.length > 0;
console.log(hardFail ? '\nRESULT: ADA TEMUAN' : '\nRESULT: SEMUA MENU OK');
process.exit(hardFail ? 1 : 0);
