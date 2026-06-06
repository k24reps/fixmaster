/**
 * Mobile responsive audit screenshot script.
 * Captures all major pages in 390x844 mobile viewport with touch support.
 * Assumes the dev server is running at http://localhost:5173.
 *
 * Run: node scripts/shoot-mobile.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';

const PAGES = [
  { path: '/', name: 'mobile-dash', ready: "div[class*='kpisGrid']" },
  { path: '/services', name: 'mobile-services', ready: "div[class*='mobileCard']" },
  { path: '/pos', name: 'mobile-pos', ready: "button[class*='catBtn']" },
  { path: '/inventory', name: 'mobile-inventory', ready: "div[class*='invGrid']" },
  { path: '/customers', name: 'mobile-cust', ready: "div[class*='custGrid']" },
  { path: '/suppliers', name: 'mobile-sup', ready: "div[class*='docket'], div[class*='vendor']" },
  { path: '/finance', name: 'mobile-fin', ready: "div[class*='tape']" },
  { path: '/reports', name: 'mobile-rep', ready: "div[class*='metric']" },
  { path: '/tasks', name: 'mobile-tsk', ready: "[class*='taskList']" },
  { path: '/attendance', name: 'mobile-att', ready: "div[class*='clock']" },
  { path: '/settings', name: 'mobile-settings', ready: "text=Operasional" },
];

const browser = await chromium.launch();

async function capture(page, { path, name, ready }) {
  console.log(`Navigating to ${path}...`);
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    
    // Wait for page specific selector
    if (ready) {
      try {
        await page.waitForSelector(ready, { timeout: 6000 });
      } catch (e) {
        console.log(`  (Selector "${ready}" not found for ${name}, capturing anyway)`);
      }
    }
    await page.waitForTimeout(1000); // stable animation
    
    // Take screenshot
    const shotPath = join(OUT, `${name}-dark.png`);
    await page.screenshot({ path: shotPath });
    console.log(`Captured: ${name}-dark.png`);
  } catch (err) {
    console.error(`Error capturing ${name} (${path}):`, err.message);
  }
}

async function main() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  
  const page = await context.newPage();
  
  // Track console messages & page errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`PAGE LOG ERROR: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    console.log(`PAGE EXCEPTION: ${err.message}`);
  });
  
  // Setup theme and seed database first
  console.log('Seeding database and setting theme...');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('fixmaster-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    
    await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
    await page.evaluate(async () => { await window.__fixmasterSeed(); });
    await page.waitForTimeout(500);
  } catch (err) {
    console.error('Setup/seeding failed:', err.message);
  }

  // Capture all main pages
  for (const pageCfg of PAGES) {
    await capture(page, pageCfg);
  }

  // Also capture a Service Detail Page
  console.log('Navigating to a service detail page...');
  try {
    await page.goto(`${BASE}/services`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('a[class*="jobNo"]', { timeout: 8000 });
    const detailLink = await page.evaluate(() => {
      const link = document.querySelector('a[class*="jobNo"]');
      return link ? link.getAttribute('href') : null;
    });
    
    if (detailLink) {
      await page.goto(`${BASE}${detailLink}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForSelector('text=REPAIR TICKET', { timeout: 8000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: join(OUT, 'mobile-detail-dark.png') });
      console.log('Captured: mobile-detail-dark.png');
    } else {
      console.log('No service detail link found to capture.');
    }
  } catch (err) {
    console.error('Error capturing service detail page:', err.message);
  }

  await context.close();
}

try {
  await main();
} catch (e) {
  console.error('Main error:', e);
} finally {
  await browser.close();
}

