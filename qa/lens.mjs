// The helmet view and your own body: looking down (standing, running), sun glare + lens flare,
// low-oxygen visor fog, both mirrors, the rover seat + motion blur, cutscene depth of field,
// storm flashes. Saves qa/lens_*.png. Usage: node qa/lens.mjs [quality] [url]
import { chromium } from 'playwright-core';

const quality = process.argv[2] ?? 'high';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${process.argv[3] ?? 'http://localhost:5173/'}?qa=1`);
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate((q) => window.__qa.quality(q), quality);
const q = (fn, arg) => page.evaluate(fn, arg);
const wait = (s) => page.waitForTimeout(s * 1000);
const shot = (name) => page.screenshot({ path: `qa/lens_${quality}_${name}.png` });
const lens = () => q(() => window.__qa.lens());

await q(() => window.__qa.mission(3));
await wait(1.2);
await q(async () => { await window.__qa.play(); });
await wait(1);

// 1. Look down at yourself, standing, then running.
await q(() => window.__qa.look(0.4, -1.15));
await wait(0.6);
await shot('01_look_down');
console.log('body:', JSON.stringify(await lens()));
await q(() => {
  dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  window.__qa.key('KeyW', 2600);
});
await wait(1.6);
await q(() => window.__qa.look(0.4, -0.9));
await wait(0.35);
await shot('02_run_down');
await q(() => window.__qa.look(0.4, 0));
await wait(0.3);
await shot('03_run_ahead');
await wait(0.8);
await q(() => dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })));

// 2. Face the Sun.
const l = await lens();
await q(() => window.__qa.teleport(60, 25, 0, 0));
await wait(0.8);
await q((a) => window.__qa.look(a.y + 0.14, a.p + 0.02), { y: l.sunYaw, p: l.sunPitch });
await wait(0.6);
await shot('04_sun_glare');
console.log('sun:', JSON.stringify((await lens()).visor));

// 3. Low oxygen: the visor fogs up.
await q(() => window.__qa.look(-1.2, -0.05));
await q(() => window.__qa.setO2(6));
await wait(4.5);
await shot('05_fog');
console.log('fog:', JSON.stringify((await lens()).visor));
await q(() => window.__qa.setO2(100));

// 4. The suit-check mirror by the airlock.
await q(() => window.__qa.mirrorView('outside'));
await wait(1.2);
await shot('06_mirror_outside');
console.log('mirrors:', JSON.stringify((await lens()).mirrors));
await q(() => window.__qa.key('KeyA', 700));
await wait(0.9);
await shot('07_mirror_outside_walk');

// 5. Inside HAB-1: the locker mirror.
await q(() => window.__qa.mirrorView('inside'));
await wait(1.2);
await shot('08_mirror_inside');
console.log('mirrors:', JSON.stringify((await lens()).mirrors));
await q(() => window.__qa.habExit());
await page.waitForFunction(() => !window.__qa.hab().moving, null, { timeout: 20000 });

// 6. Storm flashes + a shake.
await q(() => window.__qa.storm(true));
await q(() => window.__qa.shake(0.6));
await wait(0.15);
await shot('09_storm');
await q(() => window.__qa.storm(false));

// 7. Rover: sitting, looking down, then driving fast (motion blur).
await q(() => window.__qa.mission(7));
await wait(1.2);
await q(async () => { await window.__qa.play(); });
await wait(1);
await q(() => window.__qa.teleport(-6.0, -6.4, 1.07, -0.35));
await wait(0.7);
await q(() => window.__qa.key('KeyE', 120));
await wait(1.8);
await q(() => window.__qa.roverLook(0.25, -0.95));
await wait(0.5);
await shot('10_rover_seat');
await q(() => window.__qa.roverLook(0, -0.08));
await q(() => window.__qa.drive(4000));
await wait(3.2);
await shot('11_rover_blur');
console.log('drive:', JSON.stringify(await q(() => window.__qa.rover())), JSON.stringify((await lens()).visor));
await wait(1.5);

// 8. Cutscene depth of field (Mission 1 landing).
await q(() => window.__qa.cut('intro'));
await wait(10.5);
await shot('12_cutscene_dof');
await wait(4);
await shot('13_cutscene_touchdown');

console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
