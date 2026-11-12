/**
 * Foto sakelar lingkup Daftar Servis (Semua · Belum tuntas · Tertahan) untuk
 * vault, lalu cetak ukuran tuts supaya luberan terbaca dari DOM, bukan gambar.
 * Lewat /demo + klik menu (page.goto ke rute app me-reload SPA dan membuang
 * data demo). Butuh dev server:
 *   BASE_URL=http://localhost:5173 node scripts/shoot-services-scope.mjs
 * Hasil: scripts/shots/services-scope-*.png, lalu sync-vault-attachments.ps1.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { file: 'services-scope-1440-dark.png', w: 1440, theme: 'dark', pick: /Belum tuntas/ },
  { file: 'services-scope-1440-light.png', w: 1440, theme: 'light', pick: /Tertahan/ },
  { file: 'services-scope-390-dark.png', w: 390, theme: 'dark', pick: /Belum tuntas/, phone: true },
];

const browser = await chromium.launch();
for (const s of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: s.w, height: 900 },
    deviceScaleFactor: 2,
    hasTouch: !!s.phone,
    isMobile: !!s.phone,
  });
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate((theme) => localStorage.setItem('fixmaster-theme', theme), s.theme);
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  const nav = s.phone ? 'nav[aria-label="Navigasi utama seluler"]' : 'aside nav[aria-label="Navigasi utama"]';
  await page.locator(`${nav} a[href="/services"]`).first().click();
  await page.waitForTimeout(800);
  // Di ponsel sakelar dilipat ke tombol filter di samping kolom cari.
  if (s.phone) await page.locator('button[aria-controls="servis-filter-lainnya"]').first().click();
  const group = page.locator('[role="group"][aria-label="Lingkup tiket"]');
  await group.getByRole('button', { name: s.pick }).click();
  await page.waitForTimeout(300);

  const cells = await group.locator('button').evaluateAll((els) =>
    els.map((b) => {
      const r = b.getBoundingClientRect();
      return `${b.textContent.trim()} ${Math.round(r.width)}x${Math.round(r.height)}${
        b.scrollWidth > b.clientWidth + 1 ? ' TERPOTONG' : ''
      }${b.getAttribute('aria-pressed') === 'true' ? ' [aktif]' : ''}`;
    }),
  );
  const bar = await page.locator('[role="group"][aria-label="Filter servis"]').boundingBox();
  await page.screenshot({
    path: join(OUT, s.file),
    clip: { x: 0, y: Math.max(0, (bar?.y ?? 0) - 90), width: s.w, height: 460 },
  });
  console.log(`${s.file}: ${cells.join(' | ')}`);
  await page.close();
}
await browser.close();
