// Measures frame rate on the real GPU with the installed Chrome (no browser download).
// Usage: node qa/perf.mjs [url]   (dev server must be running)
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/?qa=1';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack).split(String.fromCharCode(10)).slice(0, 4).join(' | ')));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(r.status() + ' ' + r.url()));
await page.goto(url);
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 60000 });
const gpu = await page.evaluate(() => window.__qa.gpu());
console.log('GPU:', gpu);
if (/swiftshader|llvmpipe/i.test(gpu)) console.log('WARNING: software rendering, numbers are meaningless');
await page.evaluate(async () => { window.__qa.start(); await window.__qa.play(); });
const wait = (ms) => page.waitForTimeout(ms);
async function measure(label, setup) {
  if (setup) await page.evaluate(setup);
  await wait(3000);
  const i = await page.evaluate(() => window.__qa.info());
  console.log(label.padEnd(14), `${i.fps} fps  ${Math.round(i.triangles / 1000)}k tris  ${i.calls} calls`);
}
await measure('medium');
await measure('with card', async () => { window.__qa.teleport(-32.8, 9.1, Math.atan2(1.2, 1.1), -0.35); await new Promise(r => setTimeout(r, 500)); window.__qa.key('KeyE', 120); });
await measure('card+comms', () => {});
await measure('no shadows', () => window.__qa.shadows(false));
await measure('no rocks', () => { window.__qa.shadows(true); window.__qa.show('rocks', false); });
await measure('no terrain', () => { window.__qa.show('rocks', true); window.__qa.show('terrain', false); });
await measure('low', () => { window.__qa.show('terrain', true); window.__qa.quality('low'); });
await measure('high', () => window.__qa.quality('high'));
await measure('medium again', () => window.__qa.quality('medium')); // first reading includes warm-up
await page.screenshot({ path: 'qa/last.png' });
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
