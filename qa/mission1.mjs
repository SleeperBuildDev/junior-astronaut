// Plays through Mission 1 with QA hooks and screenshots each stage.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.status() >= 400 && errors.push(r.status() + ' ' + r.url()));
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 60000 });
const q = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `qa/m1_${name}.png` });
const steps = async () => q(() => document.querySelectorAll('.objective li.done').length);

await shot('0_menu');
await q(async () => { window.__qa.start(); });
await wait(400);
await shot('1_briefing');
await q(async () => { await window.__qa.play(); });
await q(() => window.__qa.key('KeyW', 7000));
await wait(7500);
console.log('after walk, done steps:', await steps());
await q(() => window.__qa.key('Space', 100));
await wait(900);
await shot('2_jump');
await wait(2500);
console.log('after jump, done steps:', await steps());
// Look at Earth: direction (-0.36, 0.19, -1)
await q(() => { const d = { x: -0.36, y: 0.19, z: -1 }; const l = Math.hypot(d.x, d.y, d.z); window.__qa.look(Math.atan2(-d.x, -d.z), Math.asin(d.y / l)); });
await wait(1500);
await shot('3_earth');
console.log('after earth, done steps:', await steps());
await q(() => window.__qa.teleport(0, -1, Math.PI, 0.05));
await wait(1500);
console.log('after reach, done steps:', await steps());
await shot('4_outpost');
const sensors = [[-34, 8], [31, 12], [-6, -64]];
for (const [x, z] of sensors) {
  // stand 1.6 m south-east of the sensor and face it
  const px = x + 1.2, pz = z + 1.1;
  await q(([px, pz, x, z]) => window.__qa.teleport(px, pz, Math.atan2(-(x - px), -(z - pz)), -0.35), [px, pz, x, z]);
  await wait(600);
  const promptText = await q(() => document.querySelector('.prompt')?.textContent ?? null);
  await q(() => window.__qa.key('KeyE', 120));
  await wait(900);
  console.log('sensor', x, z, 'prompt:', promptText);
}
await shot('5_sensor_card');
console.log('after scans, done steps:', await steps());
// Airlock hatch at about (-7.05, h+1.95, -20); stand west of it facing east.
await q(() => window.__qa.teleport(-8.6, -20, -Math.PI / 2, -0.2));
await wait(800);
console.log('airlock prompt:', await q(() => document.querySelector('.prompt')?.textContent ?? null));
await q(() => window.__qa.key('KeyE', 120));
await wait(1200);
await shot('6_airlock');
await wait(3500);
console.log('ending cutscene playing:', await q(() => window.__qa.cutscene()));
await q(() => window.__qa.skip());
await wait(800);
await shot('7_complete');
console.log('screen:', await q(() => window.__qa.state().screen), 'done steps:', await steps());
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
