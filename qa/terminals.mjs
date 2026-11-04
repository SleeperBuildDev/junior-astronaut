// Close-ups of every terminal and control box, to check each screen sits on the front of its
// board. Saves qa/term_<id>.png and qa/sheet_terminals.png. Usage: node qa/terminals.mjs
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate(() => window.__qa.quality('high'));
const q = (fn, arg) => page.evaluate(fn, arg);
// [mission, interactable id, distance, angle offset in radians (0 = straight on from the base side)]
const only = process.argv[2]?.split(',');
const list = [
  [1, 'o2', 2.2, 0.3],
  [2, 'ls-terminal', 2.2, 0.3],
  [3, 'pw-terminal', 2.2],
  [3, 'vsat-0', 2.4],
  [4, 'build-terminal', 2.0],
  [4, 'hab2-terminal', 2.0],
  [5, 'gh-terminal', 2.0],
  [6, 'rad-monitor', 2.2],
  [7, 'lab-port', 2.0],
  [8, 'pump-a', 2.0],
];
let mission = 0;
const shots = [];
if (only) list.splice(0, list.length, ...list.filter((l) => only.includes(l[1])));
for (const [m, id, dist, angle] of list) {
  if (m !== mission) {
    mission = m;
    await q((n) => window.__qa.mission(n), m);
    await page.waitForTimeout(1200);
    await q(async () => { await window.__qa.play(); });
    await page.waitForTimeout(800);
  }
  const ok = await q(([id, dist, angle]) => {
    try {
      window.__qa.goTo(id, dist, angle ?? undefined);
      return true;
    } catch {
      return false;
    }
  }, [id, dist, angle ?? null]);
  if (!ok) {
    console.log('missing', id);
    continue;
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `qa/term_${id}.png` });
  shots.push(id);
  console.log(id, 'ok');
}
console.log('errors:', errors.length ? errors : 'none');
console.log(JSON.stringify(shots));
await browser.close();
