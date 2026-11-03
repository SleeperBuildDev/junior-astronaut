// Plays through Mission 6 with QA hooks and screenshots each stage.
// Usage: node qa/mission6.mjs [en|my]   (dev server must be running)
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
const shot = (name) => page.screenshot({ path: `qa/m6_${lang}_${name}.png` });
const done = () => q(() => [...document.querySelectorAll('.objective li.done')].length);
const promptText = () => q(() => document.querySelector('.prompt')?.textContent ?? null);
const rad = () => q(() => window.__qa.rad());

await q(() => window.__qa.mission(6));
await wait(9000);
await shot('0_intro');
await q(async () => { await window.__qa.play(); });
await wait(1000);
console.log('clock day:', await q(() => document.querySelector('.clock b')?.textContent));

// Radiation monitor
await q(() => window.__qa.goTo('rad-monitor', 1.5));
await wait(700);
console.log('monitor prompt:', await promptText());
await q(() => window.__qa.key('KeyE', 120));
await wait(800);
await q(() => window.__qa.closeTerminal());

// Wall survey
for (const id of ['hab1', 'hab2', 'gh']) {
  await q((id) => window.__qa.goTo('survey-' + id, 1.4), id);
  await wait(600);
  await q(() => window.__qa.key('KeyE', 120));
  await wait(600);
}
console.log('scans:', (await rad()).scans, 'done', await done());
await q(() => window.__qa.goTo('rad-monitor', 1.5));
await wait(600);
await q(() => window.__qa.key('KeyE', 120));
await wait(800);
await shot('1_monitor_survey');
await q(() => window.__qa.closeTerminal());

// Regolith berms
for (const id of ['west', 'east', 'south']) {
  await q((id) => window.__qa.goTo('berm-' + id, 1.4), id);
  await wait(600);
  if (id === 'west') console.log('berm prompt:', await promptText());
  await q(() => window.__qa.holdE(2400));
  await wait(id === 'east' ? 3000 : 7000);
  if (id === 'east') {
    await q(() => window.__qa.teleport(18, -10, 1.0, -0.12));
    await wait(1500);
    await shot('2_berm_rising');
    await wait(2500);
  }
}
console.log('berms:', JSON.stringify((await rad()).berms), 'done', await done());

// Solar storm warning: send the crew, then get inside
await page.waitForFunction(() => window.__qa.rad().weather === 'warning', null, { timeout: 20000 });
await wait(1500);
await shot('3_storm_warning');
await q(() => window.__qa.key('KeyC', 120));
await wait(800);
for (const id of ['sci', 'cmdr', 'med']) await page.click(`[data-send="${id}"]`);
await wait(1200);
await shot('4_crew_orders');
await page.waitForFunction(() => { const c = window.__qa.crew(); return ['cmdr', 'sci', 'med'].every((k) => c[k].where === 'moving' || c[k].where === 'shelter'); }, null, { timeout: 30000 });
console.log('crew sheltered, done', await done(), 'countdown', Math.round((await rad()).countdown));
await page.click('.modal .close');
await wait(500);
await q(() => window.__qa.goTo('airlock', 1.6, -Math.PI / 2));
await wait(700);
console.log('airlock prompt:', await promptText());
await q(() => window.__qa.key('KeyE', 120));
await wait(6000);
await shot('5_shelter');
await page.waitForFunction(() => window.__qa.rad().weather === 'clear', null, { timeout: 40000 });
await wait(800);
await shot('6_all_clear');
console.log('storm over, done', await done(), 'lateDose', (await rad()).lateDose);
await page.waitForFunction(() => window.__qa.cutscene(), null, { timeout: 40000 });
await wait(7000);
await shot('7_ending');
await q(() => window.__qa.skip());
await wait(900);
await shot('8_complete');
console.log('final:', JSON.stringify(await q(() => ({ s: window.__qa.state().screen, reached: window.__qa.progress().reached }))));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
