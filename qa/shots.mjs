// Eye-level beauty shots of the outpost for visual review: node qa/shots.mjs <prefix>
import { chromium } from 'playwright-core';

const prefix = process.argv[2] ?? 'v';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.status() >= 400 && errors.push(r.status() + ' ' + r.url()));
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate(async () => { window.__qa.start(); await window.__qa.play(); });
await page.addStyleTag({ content: '#ui-root{display:none}' });
// [name, standX, standZ, lookAtX, lookAtZ, pitch]
const views = [
  ['1_approach', -20, 18, 2, -20, 0.03],
  ['2_habitat', -10, -9, 0, -20, 0.08],
  ['3_rover', -15, -2, -9, -8, -0.1],
  ['4_east', 30, -2, 8, -22, 0.06],
];
for (const [name, x, z, tx, tz, pitch] of views) {
  const yaw = Math.atan2(-(tx - x), -(tz - z));
  await page.evaluate(([x, z, yaw, pitch]) => window.__qa.teleport(x, z, yaw, pitch), [x, z, yaw, pitch]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `qa/${prefix}_${name}.png` });
}
const info = await page.evaluate(() => window.__qa.info());
console.log('fps', info.fps, 'tris', Math.round(info.triangles / 1000) + 'k', 'calls', info.calls, 'errors:', errors.length ? errors : 'none');
await browser.close();
