// Plays through Mission 5 with QA hooks and screenshots each stage.
// Usage: node qa/mission5.mjs [en|my]   (dev server must be running)
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
const shot = (name) => page.screenshot({ path: `qa/m5_${lang}_${name}.png` });
const done = () => q(() => [...document.querySelectorAll('.objective li.done')].length);
const promptText = () => q(() => document.querySelector('.prompt')?.textContent ?? null);
const gh = () => q(() => window.__qa.greenhouse());

await q(() => window.__qa.mission(5));
await wait(9000);
await shot('0_intro');
await q(async () => { await window.__qa.play(); });
await wait(1000);

// Build the greenhouse
await q(() => window.__qa.goTo('build-terminal', 1.5));
await wait(700);
await q(() => window.__qa.key('KeyE', 120));
await wait(800);
await page.click('.bt-item:nth-child(2)');
await wait(400);
await shot('1_construction');
await page.click('[data-action="build"]');
await wait(800);
// watch it assemble from the west side of the lab
await q(() => window.__qa.teleport(-6, -30, -1.35, 0.05));
await wait(2500);
await shot('2_assembling');
await wait(4500);
console.log('assembled:', (await gh()).assemble, 'done', await done());

// Greenhouse terminal: setup, plant (try an unbalanced choice first)
await q(() => window.__qa.goTo('gh-terminal', 1.5));
await wait(800);
console.log('gh prompt:', await promptText(), 'done', await done());
await q(() => window.__qa.key('KeyE', 120));
await wait(800);
await page.click('[data-action="tank"]');
await page.click('[data-light="16"]');
await wait(500);
for (const c of ['tomato', 'wheat', 'potato']) await page.click(`[data-crop="${c}"]`);
await wait(300);
console.log('unbalanced refused:', await q(() => document.querySelector('[data-action="plant"]').disabled), await q(() => document.querySelector('.gh-term .fault')?.textContent));
await page.click('[data-crop="tomato"]');
await page.click('[data-crop="lettuce"]');
await wait(300);
await shot('3_crops');
await page.click('[data-action="plant"]');
await wait(500);

// Time-lapse until the pH alarm, then fix it
await page.waitForFunction(() => window.__qa.greenhouse().phAlarm, null, { timeout: 30000 });
await wait(1200);
await shot('4_ph_alarm');
for (let i = 0; i < 6 && (await gh()).phAlarm; i++) {
  await page.click('[data-action="ph-down"]');
  await wait(250);
}
console.log('alarm fixed:', !(await gh()).phAlarm, 'ph', (await gh()).ph);
await wait(9000);
await shot('5_growing');
await page.waitForFunction(() => window.__qa.greenhouse().day >= 8, null, { timeout: 40000 });
await wait(1200);
await shot('6_grown');
console.log('grown, day', Math.round((await gh()).day * 10) / 10, 'done', await done());
await q(() => window.__qa.closeTerminal());

// Harvest
await q(() => window.__qa.goTo('gh-hatch', 1.4));
await wait(700);
console.log('hatch prompt:', await promptText());
await q(() => window.__qa.holdE(2500));
await wait(3500);
await shot('7_harvested');
await q(() => window.__qa.teleport(-2, -40, -2.0, 0.12));
await wait(1500);
await shot('8_greenhouse');
await page.waitForFunction(() => window.__qa.cutscene(), null, { timeout: 40000 });
await wait(6000);
await shot('9_ending');
await q(() => window.__qa.skip());
await wait(900);
await shot('10_complete');
console.log('final:', JSON.stringify(await q(() => ({ s: window.__qa.state().screen, reached: window.__qa.progress().reached, food: Math.round(window.__qa.greenhouse().foodDays * 10) / 10, day: document.querySelector('.clock b')?.textContent }))));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
