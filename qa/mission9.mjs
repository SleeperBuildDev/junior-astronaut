// Plays through Mission 9 with QA hooks (jumping the settlement clock) and screenshots each stage.
// Usage: node qa/mission9.mjs [en|my]   (dev server must be running)
import { chromium } from 'playwright-core';

const lang = process.argv[2] ?? 'en';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(r.status() + ' ' + r.url()));
await page.addInitScript((l) => {
  const s = JSON.parse(localStorage.getItem('junior-astronaut.settings') || '{}');
  localStorage.setItem('junior-astronaut.settings', JSON.stringify({ ...s, lang: l }));
}, lang);
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 60000 });
const q = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `qa/m9_${lang}_${name}.png` });
const done = () => q(() => [...document.querySelectorAll('.objective li.done')].length);
const em = () => q(() => window.__qa.emergency());
const st = () => q(() => window.__qa.settlement());
const termIs = (name, timeout = 30000) => page.waitForFunction((n) => window.__qa.state().terminal === n, name, { timeout });
const day = (d) => q((d) => window.__qa.settleDay(d), d);
const TARGET = { thermal: 'pump-a', recycler: 'ls-filter', comms: 'antenna-box', battery: 'battery-cab' };

await q(() => window.__qa.mission(9));
await wait(9000);
await shot('0_intro');
await q(async () => { await window.__qa.play(); });
await wait(1500);
console.log('clock day:', await q(() => document.querySelector('.clock b')?.textContent));

// Settlement panel and speed
await q(() => window.__qa.key('KeyT', 120));
await wait(600);
await shot('1_panel');
await page.click('[data-speed="fastest"]');
await q(() => (document.querySelector('.modal .close')).click());
await wait(800);
console.log('speed:', (await st()).speed, 'gameSpeed', await q(() => window.__qa.speed?.() ?? null), 'done', await done());

// Cargo on day 4, then the spare blanket for tower 3
await day(3.97);
await wait(1500);
console.log('after cargo: speed', (await st()).speed);
await q(() => window.__qa.goTo('vsat-2', 1.5));
await wait(600);
console.log('tower 3 prompt:', await q(() => document.querySelector('.prompt')?.textContent));
await q(() => window.__qa.holdE(3400));
await wait(3900);
console.log('tower 3 health:', await q(() => window.__qa.power().arrays[2].health), 'done', await done());

// Build battery storage and the second water recycler
for (const idx of [6, 8]) {
  await q(() => window.__qa.goTo('build-terminal', 1.5));
  await wait(500);
  await q(() => window.__qa.key('KeyE', 120));
  await wait(700);
  await page.locator('.bt-item').nth(idx).click();
  await wait(300);
  if (idx === 6) await shot('2_build');
  await page.click('[data-action="build"]');
  await wait(600);
}
console.log('building:', JSON.stringify((await st()).building.map((b) => b.id)));
// The cargo landing set time back to normal: speed it up again while the crews build.
await q(() => window.__qa.key('KeyT', 120));
await wait(500);
await page.click('[data-speed="fastest"]');
await q(() => (document.querySelector('.modal .close')).click());
await wait(7000);
console.log('running:', JSON.stringify((await st()).running), 'capacity extra', await q(() => window.__qa.power().extraKWh), 'done', await done());
await q(() => window.__qa.teleport(10.5, 3.5, 2.2, -0.05));
await wait(800);
await shot('3_facilities');

// The long shadow: switch off the greenhouse lights and extras from the panel
await day(8.6);
await wait(1200);
await q(() => window.__qa.key('KeyT', 120));
await wait(500);
for (const id of ['gh', 'lab', 'rover', 'flood']) await page.click(`[data-load="${id}"]`);
await wait(300);
await shot('4_shadow_panel');
await q(() => (document.querySelector('.modal .close')).click());
await wait(800);
await q(() => window.__qa.teleport(-4, 10, 0.9, 0.1));
await wait(1000);
await shot('5_shadow_world');
console.log('shadow sun:', (await q(() => window.__qa.power().sun)).toFixed(2), 'battery', Math.round((await q(() => window.__qa.power().batteryKWh))));

async function handle(label) {
  await termIs('alert');
  await wait(400);
  const e = await em();
  if (label) await shot(label);
  await page.click('[data-response="0"]');
  await wait(300);
  await page.click('[data-action="go"]');
  await wait(300);
  if (e.active === 'storm') {
    await q(() => window.__qa.goTo('airlock', 1.6));
    await wait(500);
    await q(() => window.__qa.key('KeyE', 120));
    await wait(1500);
    await shot('8_storm_shelter');
  } else if (e.active === 'leak') {
    await q((i) => window.__qa.goTo('leak-' + i, 1.5), e.leak);
    await wait(600);
    await q(() => window.__qa.key('KeyE', 120));
    await wait(500);
    await q(() => window.__qa.holdE(3400));
    await wait(3900);
  } else {
    await q((id) => window.__qa.goTo(id, 1.5), TARGET[e.active]);
    await wait(700);
    await q(() => window.__qa.key('KeyE', 120));
    await wait(700);
    await page.click('[data-cause="0"]');
    await wait(300);
    if (label) await shot(label + '_diag');
    await q(() => window.__qa.closeTerminal());
    await wait(300);
    await q(() => window.__qa.holdE(3400));
    await wait(3900);
  }
  await termIs('aar', 60000);
  await wait(400);
  await page.click('[data-action="file"]');
  await wait(600);
  console.log('handled', e.active, '-> done', await done());
}

// Leave the shadow, then the emergencies and the storm
await day(12.01);
await handle('6_event1');
await day(16.51);
await handle(null);
await day(20.51);
await handle('7_storm');
await day(24.51);
await handle(null);

// Day 30 and the settlement report
await q(() => window.__qa.teleport(-4, 10, 0.9, 0.05));
await day(30);
await termIs('final', 30000);
await wait(600);
await shot('9_report');
console.log('report:', await q(() => document.querySelector('.fin-stars')?.textContent));
await page.click('[data-action="finish"]');
await page.waitForFunction(() => window.__qa.cutscene(), null, { timeout: 20000 });
await wait(7000);
await shot('10_ending');
await q(() => window.__qa.skip());
await wait(900);
await shot('11_complete');
console.log('final:', JSON.stringify(await q(() => ({ s: window.__qa.state().screen, reached: window.__qa.progress().reached }))), 'done', await done());
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
