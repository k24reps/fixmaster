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

async function renderOpenGraph() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const logo = readFileSync(join(PUBLIC, 'logo.svg'), 'utf8');
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        background: #0b0d10;
        color: #f1f3f6;
        font-family: Arial, Helvetica, sans-serif;
      }
      .frame {
        position: relative;
        width: 100%;
        height: 100%;
        padding: 64px 72px;
        display: grid;
        grid-template-columns: 1fr 390px;
        gap: 54px;
        align-items: center;
        border: 12px solid #111419;
      }
      .frame::before {
        content: '';
        position: absolute;
        inset: 34px;
        border: 1px solid #303741;
        border-radius: 18px;
        pointer-events: none;
      }
      .copy { position: relative; z-index: 1; }
      .brand {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 42px;
        font-size: 34px;
        font-weight: 800;
      }
      .brand svg { width: 58px; height: 58px; }
      .brand span:last-child { color: #3dd9c4; }
      .kicker {
        margin-bottom: 18px;
        color: #3dd9c4;
        font: 700 16px/1.4 Consolas, monospace;
        letter-spacing: 0.13em;
      }
      h1 {
        max-width: 670px;
        margin: 0;
        font-size: 66px;
        line-height: 0.98;
        letter-spacing: -0.035em;
      }
      p {
        max-width: 640px;
        margin: 24px 0 0;
        color: #a7b0bc;
        font-size: 23px;
        line-height: 1.45;
      }
      .probe {
        position: relative;
        height: 470px;
        display: grid;
        place-items: center;
        background: #15191f;
        border: 1px solid #606a76;
        border-radius: 16px;
        box-shadow: inset 0 1px 0 #303741;
      }
      .probe::before {
        content: 'VOLT // DIAGNOSTIC COMPANION';
        position: absolute;
        top: 22px;
        left: 24px;
        color: #f5a623;
        font: 700 12px/1 Consolas, monospace;
        letter-spacing: 0.08em;
      }
      .probe svg { width: 270px; height: 270px; }
      .readout {
        position: absolute;
        left: 24px;
        right: 24px;
        bottom: 22px;
        padding-top: 16px;
        display: flex;
        justify-content: space-between;
        border-top: 1px dotted #606a76;
        color: #a7b0bc;
        font: 700 12px/1 Consolas, monospace;
        letter-spacing: 0.08em;
      }
      .readout b { color: #3dd9c4; }
    </style>
    <main class="frame">
      <section class="copy">
        <div class="brand">${logo}<span>Fix<span>Master</span></span></div>
        <div class="kicker">BENCH OS // REPARASI GADGET &amp; ELEKTRONIK</div>
        <h1>Catat servis sekali. Stok dan margin ikut terhitung.</h1>
        <p>Satu tiket menghubungkan sparepart, biaya, pembayaran, dan laporan tanpa pencatatan ulang.</p>
      </section>
      <aside class="probe">
        ${logo}
        <div class="readout"><span>STATUS</span><b>SYSTEM READY</b></div>
      </aside>
    </main>
  `);
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
