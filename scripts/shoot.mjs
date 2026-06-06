/**
 * Screenshot probe — captures the prototype at desktop + mobile, dark + light.
 * Run after the dev server is up:  node scripts/shoot.mjs
 * Outputs PNGs to scripts/shots/.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const TARGET = `${BASE}/prototype/ticket`;

const shots = [
  { name: 'ticket-desktop-dark', width: 1280, height: 1400, theme: 'dark' },
  { name: 'ticket-desktop-light', width: 1280, height: 1400, theme: 'light' },
  { name: 'ticket-mobile-dark', width: 390, height: 1800, theme: 'dark' },
];

const browser = await chromium.launch();
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2 });
  await page.goto(TARGET, { waitUntil: 'networkidle' });
  // Toggle to light if needed (default is dark).
  if (s.theme === 'light') {
    await page.getByText(/Light/).click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500); // let fonts settle
  await page.screenshot({ path: join(OUT, `${s.name}.png`), fullPage: true });
  console.log('shot:', s.name);
  await page.close();
}
await browser.close();
console.log('done →', OUT);
