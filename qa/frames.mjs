// Real frame rate check with vsync on (what a player sees): measures how long frames really
// take on the GPU for several render settings. 16.7 ms = smooth 60 fps, 33.3 ms = 30 fps.
// Usage: node qa/frames.mjs [mission] [url]   (dev server must be running)
import { chromium } from 'playwright-core';

const n = Number(process.argv[2] ?? 1);
const url = process.argv[3] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(url + '?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate((n) => window.__qa.mission(n), n);
await page.waitForTimeout(1500);
await page.evaluate(async () => { await window.__qa.play(); });
await page.waitForTimeout(3000);

async function measure(label, setup) {
  if (setup) await page.evaluate(setup);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const times = [];
    window.__qa.key('ArrowLeft', 2200);
    let last = performance.now();
    await new Promise((done) => {
      const step = (t) => {
        times.push(t - last);
        last = t;
        if (times.length < 120) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    times.sort((a, b) => a - b);
    const pick = (q) => times[Math.floor(q * (times.length - 1))].toFixed(1);
    return { median: pick(0.5), p95: pick(0.95), worst: times[times.length - 1].toFixed(1) };
  });
  console.log(label.padEnd(16), `median ${r.median} ms  p95 ${r.p95}  worst ${r.worst}`);
}
const only = process.argv[4];
if (!only || only === 'all') {
  await measure('medium');
  await measure('no shadows', () => window.__qa.shadows(false));
  await measure('no rocks', () => { window.__qa.shadows(true); window.__qa.show('rocks', false); });
  await measure('no terrain', () => { window.__qa.show('rocks', true); window.__qa.show('terrain', false); });
  await measure('low', () => { window.__qa.show('terrain', true); window.__qa.quality('low'); });
  await measure('high', () => window.__qa.quality('high'));
  await measure('medium again', () => window.__qa.quality('medium'));
} else await measure(only);
await browser.close();
