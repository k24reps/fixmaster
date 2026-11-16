/**
 * Rekam layar ASLI aplikasi untuk adegan landing (BenchScene): satu sesi /demo
 * menjalankan alur sungguhan pada tiket FM-0008 (data contoh dari src/dev/seed.ts)
 *   0 sedang dikerjakan → 1 keyboard dipasang dari stok → 2 Selesai (biaya final
 *   Rp 350.000) → 3 Lunas
 * dan di tiap langkah memotret tiga perangkat dari SESI YANG SAMA (ukuran jendela
 * diganti, data tidak), jadi angkanya pasti saling cocok:
 *   desk   1280×800  detail tiket (meja penerimaan)
 *   tablet  834×1112 daftar Servis (meja teknisi)
 *   phone   390×844  Dashboard (ponsel pemilik)
 *
 * Keluaran:
 *   public/bench/<tema>/<perangkat>-<langkah>[-<lebar>].webp
 *   src/features/landing/benchShots.json  (ukuran, kotak sorotan, kotak kop nama
 *     toko + gayanya untuk ditimpa nama yang diketik pengunjung, angka strip)
 *
 * Faceplate "MODE DEMO" disembunyikan: ia bingkai demo, bukan bagian aplikasi.
 * Landing tetap memberi label "data contoh".
 *
 * Jalankan dengan dev server hidup (gerbang demo dilewati otomatis untuk
 * navigator.webdriver di dev):
 *   BASE_URL=http://localhost:5173 node scripts/shoot-bench-scene.mjs
 * Rekam ulang bila tampilan Detail Servis, daftar Servis, Dashboard, atau seed
 * demo berubah.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:5183';
const TICKET = 'FM-0008';
const PART = 'X441';

const DEVICES = {
  desk: { w: 1280, h: 800, out: [1600, 800] },
  tablet: { w: 834, h: 1112, out: [834] },
  phone: { w: 390, h: 844, out: [585] },
};

const HIDE_FACEPLATE = `
  [class*="_demoRoot_"] { --app-inset-top: 14px !important; }
  [class*="_demoRoot_"] > header { display: none !important; }
  *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
`;

/** Navigasi di dalam MemoryRouter demo, sesuai rezim lebar (lihat audit-mobile.mjs). */
async function goto(page, path, w) {
  if (w > 1024) {
    await page.locator(`aside nav[aria-label="Navigasi utama"] a[href="${path}"]`).first().click();
  } else if (w > 720) {
    await page.locator('button[aria-label="Menu"]').click();
    await page.waitForTimeout(250);
    await page.locator(`aside nav[aria-label="Navigasi utama"] a[href="${path}"]`).first().click();
  } else {
    await page.locator(`nav[aria-label="Navigasi utama seluler"] a[href="${path}"]`).first().click();
  }
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    document.querySelector('[class*="_demoStage_"]')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  });
}

async function openTicket(page) {
  await goto(page, '/services', DEVICES.desk.w);
  await page.getByText(TICKET, { exact: true }).first().click();
  await page.waitForTimeout(800);
}

/**
 * Kotak elemen sorotan dalam persen ukuran layar. `text`: elemen daun dengan teks
 * itu persis (huruf besar/kecil diabaikan); `sel`: selektor CSS. Lalu naik ke
 * pembungkus `wrap` (atau `up` tingkat induk). `scroll`: gulir elemen ke tengah
 * layar dulu (bagian yang berubah ada di bawah lipatan).
 */
async function rectOf(page, focus) {
  return page.evaluate((f) => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const visible = (el) => {
      const b = el.getBoundingClientRect();
      const onScreen = f.scroll || (b.bottom > 0 && b.top < vh);
      return b.width > 0 && b.height > 0 && onScreen && !el.closest('[role="dialog"]');
    };
    let leaf = null;
    if (f.sel) leaf = [...document.querySelectorAll(f.sel)].find(visible) ?? null;
    else {
      const want = f.text.toLowerCase();
      const found = [...document.querySelectorAll('body *')].filter((el) => {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
        return own.toLowerCase() === want && visible(el);
      });
      // `largest`: teks yang sama muncul di beberapa tempat (cap status, stepper,
      // filter); ambil yang hurufnya paling besar.
      if (f.largest) found.sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize));
      leaf = found[0] ?? null;
    }
    if (!leaf) return null;
    let el = (f.wrap && leaf.closest(f.wrap)) || leaf;
    for (let i = 0; i < (f.up ?? 0) && el.parentElement; i++) el = el.parentElement;
    // `wide`: naik sampai pembungkus selebar itu (porsi lebar layar), mis. baris daftar.
    while (f.wide && el.parentElement && el.getBoundingClientRect().width < f.wide * vw) el = el.parentElement;
    if (f.scroll) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    const b = el.getBoundingClientRect();
    if (b.bottom < 0 || b.top > vh) return null;
    const r = (n) => Math.round(n * 1000) / 10;
    return { x: r(b.left / vw), y: r(b.top / vh), w: r(b.width / vw), h: r(b.height / vh) };
  }, focus);
}

/** Kop nama toko di sidebar desktop: kotak + gaya huruf, untuk ditimpa di landing. */
async function shopLabel(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[class*="_branchOrg_"]');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width) return null;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const cs = getComputedStyle(el);
    let bg = 'transparent';
    for (let n = el; n && bg === 'transparent'; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') bg = c;
    }
    const r = (n) => Math.round(n * 1000) / 10;
    return {
      x: r(b.left / vw),
      y: r(b.top / vh),
      w: r(b.width / vw),
      h: r(b.height / vh),
      fontPx: parseFloat(cs.fontSize),
      weight: cs.fontWeight,
      family: cs.fontFamily,
      color: cs.color,
      bg,
    };
  });
}

/** PNG → WebP di lebar tertentu lewat kanvas browser (tanpa alat tambahan). */
async function toWebp(converter, png, width) {
  return converter.evaluate(
    async ({ b64, width }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const height = Math.round((img.height * width) / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/webp', 0.82).split(',')[1];
    },
    { b64: png.toString('base64'), width },
  );
}

const STEP_FOCUS = {
  desk: [
    { text: 'Keyboard tidak merespons', wrap: '[class*="card"], section' },
    { text: 'Keyboard ASUS X441', wrap: 'li, tr, [class*="row"], [class*="Row"]', scroll: true },
    // Cap status di kepala tiket (ServiceDetailPage `.stamp`).
    { sel: '[class*="_stamp_"]' },
    { sel: '[class*="_stamp_"]' },
  ],
  tablet: [0, 1, 2, 3].map(() => ({ text: TICKET, wide: 0.8 })),
  phone: [
    { text: 'sparepart menipis', wrap: 'li, a, [class*="row"], [class*="Row"]' },
    { text: 'sparepart menipis', wrap: 'li, a, [class*="row"], [class*="Row"]' },
    { text: 'unit menunggu diambil', wrap: 'li, a, [class*="row"], [class*="Row"]' },
    { text: 'Arus kas bersih', wrap: 'section, article, [class*="well"], [class*="Well"], [class*="card"]' },
  ],
};

const PAGES = { desk: null, tablet: '/services', phone: '/' };

async function capture(page, converter, theme, step, manifest) {
  const outDir = join(ROOT, 'public', 'bench', theme);
  mkdirSync(outDir, { recursive: true });
  const shot = { step };
  for (const [name, dev] of Object.entries(DEVICES)) {
    // Navigasi selalu dari lebar desktop (sidebar tetap), lalu jendela diganti
    // ke ukuran perangkat. Data tidak berubah karena sesinya sama.
    await page.setViewportSize({ width: DEVICES.desk.w, height: DEVICES.desk.h });
    await page.waitForTimeout(300);
    if (name === 'desk') await openTicket(page);
    else await goto(page, PAGES[name], DEVICES.desk.w);
    await page.setViewportSize({ width: dev.w, height: dev.h });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      document.querySelector('[class*="_demoStage_"]')?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    });
    const focus = await rectOf(page, STEP_FOCUS[name][step]);
    await page.waitForTimeout(200);
    const entry = { focus };
    if (name === 'desk') entry.shop = await shopLabel(page);
    const png = await page.screenshot({ type: 'png' });
    for (const w of dev.out) {
      const suffix = dev.out.length > 1 && w !== dev.out[0] ? `-${w}` : '';
      const webp = await toWebp(converter, png, w);
      writeFileSync(join(outDir, `${name}-${step}${suffix}.webp`), Buffer.from(webp, 'base64'));
    }
    shot[name] = entry;
    if (!focus) console.warn(`  [${theme}] langkah ${step} ${name}: sorotan tidak ditemukan`);
  }
  // Angka untuk strip ponsel landing, dibaca dari Dashboard yang sama.
  await page.setViewportSize({ width: DEVICES.phone.w, height: DEVICES.phone.h });
  shot.values = await page.evaluate(() => {
    const txt = document.querySelector('main')?.innerText ?? '';
    const cash = txt.match(/ARUS KAS BERSIH[\s\S]*?(Rp\s?[\d.]+)/i)?.[1] ?? null;
    const ready = txt.match(/(\d+)\s*\n?\s*unit menunggu diambil/i)?.[1] ?? null;
    const low = txt.match(/(\d+)\s*\n?\s*sparepart menipis/i)?.[1] ?? null;
    return { cash, ready, low };
  });
  manifest.steps[step] = manifest.steps[step] ?? {};
  manifest.steps[step][theme] = shot;
}

async function run(theme, converter, manifest) {
  const browser = converter.context().browser();
  const ctx = await browser.newContext({
    viewport: { width: DEVICES.desk.w, height: DEVICES.desk.h },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.getByText('MODE DEMO').waitFor({ timeout: 30000 });
  await page.addStyleTag({ content: HIDE_FACEPLATE });
  await page.waitForTimeout(1500);

  await capture(page, converter, theme, 0, manifest);

  // 1. Keyboard dipasang dari stok.
  await page.setViewportSize({ width: DEVICES.desk.w, height: DEVICES.desk.h });
  await openTicket(page);
  await page.getByRole('button', { name: 'Sparepart', exact: true }).click();
  const picker = page.getByRole('dialog');
  await picker.getByPlaceholder(/Cari nama/).fill(PART);
  await page.waitForTimeout(300);
  await picker.getByRole('button', { name: 'Tambah' }).first().click();
  await page.waitForTimeout(300);
  await picker.getByRole('button', { name: 'Selesai' }).click();
  await page.waitForTimeout(600);
  await capture(page, converter, theme, 1, manifest);

  // 2. Selesai: biaya final + penanganan.
  await page.setViewportSize({ width: DEVICES.desk.w, height: DEVICES.desk.h });
  await openTicket(page);
  await page.getByRole('button', { name: /Ubah Status/ }).last().click();
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.locator('button').filter({ hasText: /^Selesai/ }).first().click();
  await dlg.getByLabel('Biaya Final').fill('350000');
  await dlg.getByLabel(/Penanganan/).fill('Ganti keyboard, semua tombol dites normal');
  await dlg.getByRole('button', { name: 'Terapkan' }).click();
  await page.waitForTimeout(800);
  await capture(page, converter, theme, 2, manifest);

  // 3. Lunas.
  await page.setViewportSize({ width: DEVICES.desk.w, height: DEVICES.desk.h });
  await openTicket(page);
  await page.getByRole('button', { name: /Ubah Status/ }).last().click();
  const pay = page.locator('[role="dialog"]').last();
  await pay.locator('button').filter({ hasText: /^Lunas/ }).first().click();
  await pay.locator('select').first().selectOption({ label: 'Tunai' });
  await pay.getByRole('button', { name: /^Terima Rp/ }).click();
  await page.waitForTimeout(800);
  await capture(page, converter, theme, 3, manifest);

  await ctx.close();
}

const browser = await chromium.launch();
const converter = await (await browser.newContext()).newPage();
const manifest = {
  ticket: TICKET,
  devices: Object.fromEntries(Object.entries(DEVICES).map(([k, d]) => [k, { w: d.w, h: d.h, out: d.out }])),
  steps: [],
};
for (const theme of (process.env.THEMES || 'dark,light').split(',')) {
  console.log(`tema ${theme}`);
  await run(theme, converter, manifest);
}
writeFileSync(
  join(ROOT, 'src', 'features', 'landing', 'benchShots.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log('selesai: public/bench/* + src/features/landing/benchShots.json');
await browser.close();
