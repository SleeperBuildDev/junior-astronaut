// Fixed views for before/after image comparison (e.g. performance work that must not change the look).
// Saves qa/cmp_<tag>_<n>.png. Usage: node qa/compare.mjs <tag> [quality] [url]
import { chromium } from 'playwright-core';

const tag = process.argv[2] ?? 'now';
const quality = process.argv[3] ?? 'high';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${process.argv[4] ?? 'http://localhost:5173/'}?qa=1`);
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate((q) => window.__qa.quality(q), quality);
const q = (fn, a) => page.evaluate(fn, a);
const shot = async (n) => {
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: '#ui-root { visibility: hidden !important; }' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `qa/cmp_${tag}_${n}.png` });
  await page.addStyleTag({ content: '#ui-root { visibility: visible !important; }' });
};
await q(() => window.__qa.mission(3));
await page.waitForTimeout(1500);
await q(async () => { await window.__qa.play(); });
await page.waitForTimeout(1500);
await q(() => window.__qa.teleport(-30, 10, -1.75, -0.06));
await shot(1); // the outpost from the west, long shadows
await q(() => window.__qa.teleport(60, 25, 1.4, -0.1));
await shot(2); // rock field and crater rims, toward the base
await q(() => window.__qa.teleport(60, 25, -1.6, -0.25));
await shot(3); // toward the Sun
await q(() => window.__qa.teleport(-120, -60, 0.8, -0.12));
await shot(4); // far out, terrain detail
await q(() => window.__qa.goTo('airlock', 2.6, -Math.PI / 2));
await q(() => window.__qa.habEnter());
await page.waitForFunction(() => !window.__qa.hab().moving, null, { timeout: 20000 });
await shot(5); // inside HAB-1
await browser.close();
