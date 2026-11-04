// HAB-1: the walk in through the airlock (hatch, chamber, pressure, inner door), the inside and
// its stations, the walk back out, and the rover's get-in / get-out moves.
// Saves qa/hab_*.png. Usage: node qa/habitat.mjs [en|my] [quality]
import { chromium } from 'playwright-core';

const lang = process.argv[2] ?? 'en';
const quality = process.argv[3] ?? 'high';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript((l) => localStorage.setItem('junior-astronaut.settings', JSON.stringify({ lang: l })), lang);
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate((q) => window.__qa.quality(q), quality);
const q = (fn, arg) => page.evaluate(fn, arg);
const wait = (s) => page.waitForTimeout(s * 1000);
const shot = (name) => page.screenshot({ path: `qa/hab_${name}.png` });
const hab = () => q(() => window.__qa.hab());

await q(() => window.__qa.mission(3));
await wait(1.2);
await q(async () => { await window.__qa.play(); });
await wait(1);
await q(() => window.__qa.goTo('airlock', 2.6, -Math.PI / 2));
await wait(0.8);
await shot('00_outside');
console.log('prompt outside:', await q(() => document.querySelector('.prompt')?.textContent));

// Walk in: grab frames through the sequence.
await q(() => window.__qa.habEnter());
for (const [name, at] of [['01_hatch', 1.5], ['02_step', 2.9], ['03_lookback', 4.1], ['04_pressure', 6.3], ['05_inner', 8.4]]) {
  await page.waitForTimeout(0);
  await wait(at - (globalThis.__last ?? 0));
  globalThis.__last = at;
  await shot(name);
}
await page.waitForFunction(() => !window.__qa.hab().moving, null, { timeout: 15000 });
await wait(0.6);
console.log('after walk-in:', JSON.stringify(await hab()));
await shot('06_inside_east');

// Look around.
await q(() => window.__qa.look(Math.PI / 2, -0.05)); // west: airlock door + suit station
await wait(0.5);
await shot('07_inside_west');
await q(() => window.__qa.key('KeyW', 1400)); // walk east
await wait(0.2);
await q(() => window.__qa.look(-Math.PI / 2, 0));
await wait(1.8);
await shot('08_walk_east');
await q(() => window.__qa.look(0, -0.1)); // north wall: galley, console, Earth window
await wait(0.5);
await shot('09_north');
await q(() => window.__qa.look(Math.PI, -0.1)); // south wall: bike, plants, photos
await wait(0.5);
await shot('10_south');

// O2 refills inside.
await q(() => { const s = window.__qa.state(); void s; });
const o2a = await q(() => window.__qa.info?.().suit?.o2 ?? null);
console.log('o2 sample (info):', o2a);

// Stations.
await q(() => window.__qa.habUse('hab-window'));
await wait(3.4);
await shot('11_earth_window');
await page.waitForFunction(() => !window.__qa.hab().moving, null, { timeout: 15000 });
await q(() => window.__qa.habUse('hab-bike'));
await wait(2.5);
await shot('12_bike');
await page.waitForFunction(() => !window.__qa.hab().moving, null, { timeout: 15000 });
await q(() => window.__qa.habUse('hab-bunk'));
await wait(1.15);
await shot('13_bunk');
await page.waitForFunction(() => !window.__qa.hab().moving, null, { timeout: 15000 });
await q(() => window.__qa.habUse('hab-suit'));
await wait(1.3);
await shot('14_suit');
await page.waitForFunction(() => !window.__qa.hab().moving, null, { timeout: 15000 });
await q(() => window.__qa.habUse('hab-console'));
await wait(0.8);
await shot('15_console');
await q(() => window.__qa.closeTerminal());
await wait(0.4);

// Walk out.
await q(() => window.__qa.habUse('hab-exit'));
for (const [name, at] of [['16_out_inner', 1.6], ['17_out_vent', 4.2], ['18_out_hatch', 7.6]]) {
  await wait(at - (globalThis.__last2 ?? 0));
  globalThis.__last2 = at;
  await shot(name);
}
await page.waitForFunction(() => !window.__qa.hab().moving, null, { timeout: 15000 });
await wait(0.8);
console.log('after walk-out:', JSON.stringify(await hab()));
await shot('19_outside_again');

// Rover (Mission 7): get in, then out.
await q(() => window.__qa.mission(7));
await wait(1.2);
await q(async () => { await window.__qa.play(); });
await wait(1);
await q(() => window.__qa.teleport(-6.0, -6.4, 1.07, -0.35)); // in front of the parked rover (as mission7.mjs)
await wait(0.7);
await q(() => window.__qa.key('KeyE', 120));
await wait(0.55);
await shot('20_rover_in_mid');
await wait(1.2);
await shot('21_rover_seat');
console.log('rover:', JSON.stringify(await q(() => window.__qa.rover())));
await q(() => window.__qa.key('KeyE', 120));
await wait(0.5);
await shot('22_rover_out_mid');
await wait(1.2);
await shot('23_rover_out');
console.log('rover after:', JSON.stringify(await q(() => window.__qa.rover())));
console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
