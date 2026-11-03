// Smoke test of the production build (npm run build, then npm run preview on port 4173).
// Loads the game, checks every mission opens and plays for a moment, and reports errors.
// Usage: node qa/prod.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(r.status() + ' ' + r.url()));
const t0 = Date.now();
await page.goto(url + '?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'qa/prod_menu.png' });
const q = (fn, arg) => page.evaluate(fn, arg);
for (let n = 1; n <= 9; n++) {
  await q((n) => window.__qa.mission(n), n);
  await page.waitForTimeout(1200);
  await q(async () => { await window.__qa.play(); });
  await page.waitForTimeout(2500);
  const s = await q(() => ({ screen: window.__qa.state().screen, title: document.querySelector('.objective .panel-title')?.textContent }));
  console.log('mission', n, s.screen, '|', s.title);
}
await page.screenshot({ path: 'qa/prod_m9.png' });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
