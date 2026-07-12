/**
 * Visual audit probe — seeds the demo workspace, captures EVERY menu at
 * desktop (1440x960) + mobile (390x844), dark theme, and programmatically
 * flags horizontal overflow + offending elements per page.
 * Run with dev server up:  node audit-ui.mjs   (from repo root: node <path>)
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:5174';

const pages = [
  { path: '/', name: 'dashboard' },
  { path: '/services', name: 'services' },
  { path: '/pos', name: 'pos' },
  { path: '/customers', name: 'customers' },
  { path: '/inventory', name: 'inventory' },
  { path: '/suppliers', name: 'suppliers' },
  { path: '/finance', name: 'finance' },
  { path: '/tasks', name: 'tasks' },
  { path: '/attendance', name: 'attendance' },
  { path: '/reports', name: 'reports' },
  { path: '/activity', name: 'activity' },
  { path: '/settings', name: 'settings' },
];

const browser = await chromium.launch();
const report = [];

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('fixmaster-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

// Detect horizontal overflow + list the widest offenders.
async function overflowCheck(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const over = doc.scrollWidth > vw + 1;
    const offenders = [];
    if (over) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > vw + 2 || r.right > vw + 8) {
          const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 60);
          offenders.push(`${el.tagName.toLowerCase()}.${cls} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
          if (offenders.length >= 5) break;
        }
      }
    }
    return { vw, scrollWidth: doc.scrollWidth, over, offenders };
  });
}

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 960, scale: 1 },
  { tag: 'mobile', width: 390, height: 844, scale: 2 },
];

for (const vp of VIEWPORTS) {
  // ONE page per viewport: the employee session lives in sessionStorage
  // (per-tab), so we log in via the PIN screen once and keep the tab.
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    hasTouch: vp.tag === 'mobile',
  });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await setTheme(page, 'dark');
  await page.reload({ waitUntil: 'networkidle' });
  // Fresh context per page: seed + sign-in via the wizard's dev button.
  await page.getByRole('button', { name: /Isi data demo/ }).click();
  await page.waitForSelector('a[href="/services"]', { timeout: 15000 });
  for (const p of pages) {
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
    // Don't shoot mid-load: lazy route chunks show a suspense spinner
    // (svg with a 'spin' class). Wait until none is visible, then settle.
    await page.waitForFunction(() => !document.querySelector('svg[class*="spin" i], [class*="spinner" i]:empty'), { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1200);
    consoleErrors.length = 0;
    const shot = join(OUT, `${p.name}-${vp.tag}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const ov = await overflowCheck(page);
    report.push({ page: p.name, vp: vp.tag, ...ov, consoleErrors: [...new Set(consoleErrors)].slice(0, 3) });
    console.log(`shot ${p.name}-${vp.tag}${ov.over ? '  << OVERFLOW ' + ov.scrollWidth + '/' + ov.vw : ''}`);
  }
  await page.close();
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\n=== OVERFLOW / CONSOLE SUMMARY ===');
for (const r of report) {
  if (r.over || r.consoleErrors.length) {
    console.log(`${r.page} [${r.vp}] over=${r.over} ${r.scrollWidth}/${r.vw}`);
    r.offenders?.forEach((o) => console.log('   ', o));
    r.consoleErrors?.forEach((e) => console.log('   ERR:', e));
  }
}
console.log('done');
await browser.close();
