/**
 * Render production PNG fallbacks from the canonical VOLT Probe SVG assets.
 * Run after changing public/logo.svg or public/icon-maskable.svg.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const browser = await chromium.launch();

async function renderSvg(source, target, size, omitBackground) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(join(PUBLIC, source), 'utf8');
  await page.setContent(`
    <style>
      html, body { width: 100%; height: 100%; margin: 0; background: transparent; overflow: hidden; }
      svg { display: block; width: 100%; height: 100%; }
    </style>
    ${svg}
  `);
  await page.screenshot({ path: join(PUBLIC, target), omitBackground });
  await page.close();
  console.log('rendered:', target);
}

/**
 * Kartu pratinjau tautan (WhatsApp, Google, media sosial): pintu masuk utama
 * pemilik konter ke landing. Isinya mengikuti hero landing, bukan slogan lama,
 * dan panel kanannya ponsel pemilik dengan readout contoh, sama seperti adegan
 * di halaman. Warna dari tokens.css (tema gelap), huruf dari font self-hosted.
 * Angka harga di sini ditulis tangan: render ulang bila src/config/pricing.ts
 * berubah.
 */
async function renderOpenGraph() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const logo = readFileSync(join(PUBLIC, 'logo.svg'), 'utf8');
  const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const font = (file) =>
    `data:font/woff2;base64,${readFileSync(join(PUBLIC, 'fonts', file)).toString('base64')}`;
  await page.setContent(`
    <style>
      ${tokens}
      @font-face { font-family: 'Inter'; font-weight: 400 800; src: url('${font('inter-v20-latin.woff2')}') format('woff2'); }
      @font-face { font-family: 'Space Grotesk'; font-weight: 500 700; src: url('${font('space-grotesk-v22-latin.woff2')}') format('woff2'); }
      @font-face { font-family: 'JetBrains Mono'; font-weight: 400 800; src: url('${font('jetbrains-mono-v24-latin.woff2')}') format('woff2'); }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        color: var(--text-primary);
        background:
          radial-gradient(640px 420px at 12% 0%, color-mix(in srgb, var(--brand) 9%, transparent), transparent 70%),
          radial-gradient(560px 420px at 92% 100%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%),
          linear-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 30px 30px,
          linear-gradient(90deg, var(--grid-line) 1px, transparent 1px) 0 0 / 30px 30px,
          var(--bg-app);
        font-family: 'Inter', sans-serif;
      }
      .frame {
        width: 100%;
        height: 100%;
        padding: 58px 64px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 56px;
        align-items: center;
      }
      .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 36px; }
      .brand svg { width: 56px; height: 56px; }
      .brand strong { display: block; font: 700 32px/1 'Space Grotesk', sans-serif; letter-spacing: -0.02em; }
      .brand small { display: block; margin-top: 6px; color: var(--text-muted); font-size: 17px; }
      h1 { margin: 0; font: 700 62px/1.04 'Space Grotesk', sans-serif; letter-spacing: -0.03em; text-wrap: balance; }
      p.lead { max-width: 600px; margin: 26px 0 0; color: var(--text-secondary); font-size: 23px; line-height: 1.5; }
      .phone {
        padding: 10px;
        background: var(--bg-base);
        border: 1px solid var(--border-strong);
        border-radius: 40px;
        box-shadow: var(--shadow-bench-tight);
      }
      .screen {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 22px 22px 24px;
        background: var(--bg-app);
        border: 1px solid var(--border);
        border-radius: 31px;
      }
      .head strong { display: block; font: 700 22px/1.2 'Space Grotesk', sans-serif; }
      .head small { color: var(--text-muted); font-size: 14px; }
      .notice {
        display: flex; gap: 10px; align-items: flex-start;
        padding: 12px 14px;
        background: var(--bg-surface);
        border: 1px solid var(--border-strong);
        border-radius: 12px;
        font-size: 15px; line-height: 1.4;
      }
      .led { width: 9px; height: 9px; flex: none; margin-top: 5px; border-radius: 999px; background: var(--tone); box-shadow: 0 0 8px var(--tone); }
      ul { margin: 0; padding: 0; list-style: none; }
      li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 12px 0; font-size: 15px; }
      li + li { border-top: 1px dotted var(--border-strong); }
      li span { color: var(--text-secondary); }
      li b { font: 700 18px/1 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
      li .led { margin: 0; }
      .tag {
        align-self: flex-start;
        padding: 2px 8px;
        color: var(--text-secondary);
        border: 1px solid var(--border-strong);
        border-radius: 5px;
        font: 400 13px/1.4 'JetBrains Mono', monospace;
      }
    </style>
    <main class="frame">
      <section>
        <div class="brand">${logo}<span><strong>FixMaster</strong><small>Sistem operasi meja servis</small></span></div>
        <h1>Toko servis yang rapi dan teratur, mulai hari ini.</h1>
        <p class="lead">Untuk konter HP, servis laptop, printer, sampai TV. 50&nbsp;unit pertama gratis, lalu Rp&nbsp;1.000 per&nbsp;unit.</p>
      </section>
      <aside class="phone">
        <div class="screen">
          <div class="head"><strong>Toko Anda</strong><small>Ponsel pemilik · semua meja</small></div>
          <div class="notice" style="--tone: var(--accent)"><i class="led"></i>FM-0312 lunas, Rp 350.000 masuk ke Tunai</div>
          <ul>
            <li style="--tone: var(--warning)"><i class="led"></i><span>Stok keyboard X441</span><b>2</b></li>
            <li style="--tone: var(--success)"><i class="led"></i><span>Margin FM-0312</span><b>Rp 170.000</b></li>
            <li style="--tone: var(--accent)"><i class="led"></i><span>Siap diambil</span><b>3</b></li>
            <li style="--tone: var(--success)"><i class="led"></i><span>Kas hari ini</span><b>Rp 1.590.000</b></li>
          </ul>
          <span class="tag">Data contoh</span>
        </div>
      </aside>
    </main>
  `);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(PUBLIC, 'og-image.png') });
  await page.close();
  console.log('rendered: og-image.png');
}

await renderSvg('logo.svg', 'icon-192.png', 192, true);
await renderSvg('logo.svg', 'icon-512.png', 512, true);
await renderSvg('icon-maskable.svg', 'icon-maskable-192.png', 192, false);
await renderSvg('icon-maskable.svg', 'icon-maskable-512.png', 512, false);
await renderSvg('icon-maskable.svg', 'apple-touch-icon.png', 180, false);
await renderOpenGraph();
await browser.close();
