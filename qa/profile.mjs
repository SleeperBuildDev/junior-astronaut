// Where the frame time goes: vsync frame times, GPU time per frame, draw calls/triangles,
// and the top JavaScript functions (CPU profile), for a few scenes.
// Usage: node qa/profile.mjs [quality] [url]
import { chromium } from 'playwright-core';

const quality = process.argv[2] ?? 'high';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${process.argv[3] ?? 'http://localhost:5173/'}?qa=1`);
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate((q) => window.__qa.quality(q), quality);
const q = (fn, arg) => page.evaluate(fn, arg);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const p = (k) => s[Math.floor(k * (s.length - 1))].toFixed(1);
  return `median ${p(0.5)} p95 ${p(0.95)}`;
};

async function measure(label) {
  await page.waitForTimeout(1200);
  const frames = await q(async () => {
    const times = [];
    let last = performance.now();
    await new Promise((done) => {
      const step = (t) => {
        times.push(t - last);
        last = t;
        if (times.length < 150) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    return times.slice(5);
  });
  const gpu = await q(() => window.__qa.gpuTime(60));
  const info = await q(() => window.__qa.info());
  await cdp.send('Profiler.start');
  await page.waitForTimeout(2500);
  const { profile } = await cdp.send('Profiler.stop');
  // Self time per function.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const idle = [...self.entries()].filter(([k]) => k.startsWith('(idle)') || k.startsWith('(program)') || k.startsWith('(garbage')).reduce((a, [, v]) => a + v, 0);
  const top = [...self.entries()].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log(`\n== ${label} [${quality}]  frames ${stats(frames)} ms | GPU ${gpu ? stats(gpu) : 'n/a'} ms | calls ${info.calls} tris ${(info.triangles / 1e6).toFixed(2)}M`);
  console.log(`   JS busy ${(((total - idle) / total) * 100).toFixed(0)}% of the time (idle/program/GC excluded)`);
  for (const [k, v] of top) console.log(`   ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
}

await q(() => window.__qa.mission(3));
await page.waitForTimeout(1500);
await q(async () => { await window.__qa.play(); });
await page.waitForTimeout(2500);
await measure('base, standing');
await q(() => window.__qa.key('ArrowLeft', 6000));
await measure('base, turning');
await q(() => window.__qa.mission(7));
await page.waitForTimeout(1500);
await q(async () => { await window.__qa.play(); });
await page.waitForTimeout(1000);
await q(() => window.__qa.teleport(-6.0, -6.4, 1.07, -0.35));
await page.waitForTimeout(700);
await q(() => window.__qa.key('KeyE', 120));
await page.waitForTimeout(1800);
await q(() => window.__qa.drive(9000));
await page.waitForTimeout(1500);
await measure('driving');
console.log('\nerrors:', errors.length ? errors.slice(0, 4) : 'none');
await browser.close();
