// Secret discoveries: plays each find's legendary cutscene and screenshots its shots and
// the gold card, plus footprints and dust in normal play.
// Usage: node qa/secrets.mjs [en|my] [ids comma-separated | all] [quality]   (dev server must be running)
import { chromium } from 'playwright-core';

const lang = process.argv[2] ?? 'en';
const want = process.argv[3] ?? 'golf';
const quality = process.argv[4] ?? 'high';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript((lang) => localStorage.setItem('junior-astronaut.settings', JSON.stringify({ lang })), lang);
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate((q) => window.__qa.quality(q), quality);
const q = (fn, arg) => page.evaluate(fn, arg);
const list = await q(() => window.__qa.discoveries());
const ids = want === 'all' ? list.map((d) => d.id) : want.split(',');
console.log(list.filter((d) => ids.includes(d.id)).map((d) => `${d.id} m${d.mission} (${d.x}, ${d.y}, ${d.z})`).join('\n'));
let mission = 0;
for (const id of ids) {
  const d = list.find((x) => x.id === id);
  if (d.mission !== mission) {
    mission = d.mission;
    await q((n) => window.__qa.mission(n), mission);
    await page.waitForTimeout(1200);
    await q(async () => { await window.__qa.play(); });
    await page.waitForTimeout(1500);
  }
  await q((id) => window.__qa.discover(id), id);
  const marks = [1.8, 6.0, 11.2, 15.5];
  let t = 0;
  for (const [i, at] of marks.entries()) {
    await page.waitForTimeout((at - t) * 1000);
    t = at;
    await page.screenshot({ path: `qa/secret_${id}_${i + 1}.png` });
  }
  await page.waitForFunction(() => window.__qa.state().screen === 'discovery', null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `qa/secret_${id}_card.png` });
  await q(() => window.__qa.closeDiscovery());
  await page.waitForTimeout(600);
  console.log(id, 'ok');
}
if (process.argv.includes('--walk')) {
  // Walk away from a secret, then look back at the boot prints, mid-step dust.
  await q(() => window.__qa.look(Math.PI * 0.75, -0.2));
  await q(() => window.__qa.key('KeyW', 3500));
  await page.waitForTimeout(3600);
  await q(() => window.__qa.key('ShiftLeft', 2500));
  await q(() => window.__qa.key('KeyW', 2500));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'qa/secret_walk_dust.png' });
  await page.waitForTimeout(1400);
  await q(() => window.__qa.look(Math.PI * 0.75 + Math.PI, -0.55));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'qa/secret_walk_prints.png' });
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
