// The astronaut: the model in a cutscene, and its shadow walking, loping and jumping ahead
// of you (Sun behind). Saves qa/astro_*.png. Usage: node qa/astronaut.mjs [quality]
import { chromium } from 'playwright-core';

const quality = process.argv[2] ?? 'high';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate((q) => window.__qa.quality(q), quality);
const q = (fn, arg) => page.evaluate(fn, arg);
const wait = (s) => page.waitForTimeout(s * 1000);

await q(() => window.__qa.mission(4));
await wait(1.2);
await q(async () => { await window.__qa.play(); });
await wait(1);
// The model: the seismometer cutscene (kneeling, the visor close-up).
await q(() => window.__qa.discover('moonquake'));
for (const [i, at] of [1.2, 4.6, 10.6].entries()) {
  await wait(i === 0 ? at : at - [1.2, 4.6, 10.6][i - 1]);
  await page.screenshot({ path: `qa/astro_model_${i + 1}.png` });
}
await q(() => window.__qa.skip());
await page.waitForFunction(() => window.__qa.state().screen === 'discovery', null, { timeout: 20000 });
await q(() => window.__qa.closeDiscovery());
await wait(0.5);

// Walk west with the low Sun behind: the long shadow walks ahead of you.
await q(() => window.__qa.teleport(-20, 30, Math.PI / 2, -0.32));
await wait(0.8);
await q(() => window.__qa.key('KeyW', 6000));
await wait(1.2);
for (let i = 0; i < 4; i++) {
  await page.screenshot({ path: `qa/astro_walk_${i + 1}.png` });
  await wait(0.22);
}
await wait(3.5);
// Walking north-west: the shadow falls to the side, so the legs scissor.
await q(() => window.__qa.teleport(-20, 30, Math.PI / 4, -0.42));
await q(() => window.__qa.key('KeyW', 4000));
await wait(1.2);
for (let i = 0; i < 4; i++) {
  await page.screenshot({ path: `qa/astro_side_${i + 1}.png` });
  await wait(0.2);
}
await wait(2.5);
// Lope (sprint).
await q(() => window.__qa.teleport(-20, 30, Math.PI / 2, -0.32));
await q(() => window.__qa.key('ShiftLeft', 6000));
await q(() => window.__qa.key('KeyW', 6000));
await wait(1.8);
for (let i = 0; i < 4; i++) {
  await page.screenshot({ path: `qa/astro_lope_${i + 1}.png` });
  await wait(0.25);
}
await wait(3.5);
// Jump and land.
await q(() => window.__qa.teleport(-20, 30, Math.PI / 2, -0.32));
await wait(0.8);
await q(() => window.__qa.key('Space', 150));
for (let i = 0; i < 3; i++) {
  await wait(i === 0 ? 0.6 : 0.9);
  await page.screenshot({ path: `qa/astro_jump_${i + 1}.png` });
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
