import { chromium } from '@playwright/test';
import { join } from 'node:path';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('fixmaster-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForFunction(() => typeof window.__fixmasterSeed === 'function', { timeout: 10000 });
  await page.evaluate(async () => { await window.__fixmasterSeed(); });
  await page.goto('http://localhost:5173/services', { waitUntil: 'networkidle' });
  await page.waitForSelector('a[class*="jobNo"]', { timeout: 8000 });
  const link = await page.evaluate(() => {
    const a = document.querySelector('a[class*="jobNo"]');
    return a ? a.getAttribute('href') : null;
  });
  console.log('Link found:', link);
  if (link) {
    await page.goto('http://localhost:5173' + link, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'scripts/shots/mobile-detail-dark.png' });
    console.log('Saved to scripts/shots/mobile-detail-dark.png');
  }
} catch (e) {
  console.error('Error:', e);
} finally {
  await browser.close();
}
