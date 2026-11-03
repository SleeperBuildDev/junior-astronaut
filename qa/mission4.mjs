// Plays through Mission 4 with QA hooks and screenshots each stage.
// Usage: node qa/mission4.mjs [en|my]   (dev server must be running)
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
const shot = (name) => page.screenshot({ path: `qa/m4_${lang}_${name}.png` });
const done = () => q(() => [...document.querySelectorAll('.objective li.done')].length);
const promptText = () => q(() => document.querySelector('.prompt')?.textContent ?? null);
const hab = () => q(() => window.__qa.habitat());

await q(() => window.__qa.mission(4));
await wait(5500);
await shot('0_intro');
await q(async () => { await window.__qa.play(); });
await wait(1000);
await shot('1_start');

// Construction terminal
await q(() => window.__qa.goTo('build-terminal', 1.5));
await wait(700);
console.log('build prompt:', await promptText());
await q(() => window.__qa.key('KeyE', 120));
await wait(800);
await shot('2_construction');
await page.click('[data-action="build"]');
await wait(2500);
await shot('3_tunnel');
await wait(4000);
console.log('built:', JSON.stringify(await q(() => ({ t: window.__qa.habitat().tunnel, speed: window.__qa.speed() }))), 'done', await done());

// Inflate
await q(() => window.__qa.goTo('hab2-valve', 1.4));
await wait(700);
console.log('valve prompt:', await promptText());
await q(() => window.__qa.holdE(2500));
await wait(3500);
await q(() => window.__qa.teleport(-4, -2, -0.805, 0.08));
await wait(3500);
await shot('4_inflating');
await wait(7000);
console.log('inflated:', (await hab()).inflate, 'done', await done());
await shot('5_inflated');

// Habitat terminal: pressure (try the unsafe one first), heat, outfit
await q(() => window.__qa.goTo('hab2-terminal', 1.5));
await wait(700);
console.log('hab prompt:', await promptText());
await q(() => window.__qa.key('KeyE', 120));
await wait(800);
await page.click('[data-kpa="30"]');
await wait(300);
console.log('unsafe pressure refused:', !!(await q(() => document.querySelector('.hab-term .fault'))));
await shot('6_pressure_choice');
await page.click('[data-kpa="70"]');
await wait(4500);
await shot('7_leak_test');
await wait(6000);
console.log('pressurized:', (await hab()).pressurized, 'done', await done());
for (let i = 0; i < 9; i++) {
  await page.click('.thermo .btn:nth-of-type(2)');
  await wait(80);
}
console.log('set temp:', (await hab()).setTemp);
await page.click('[data-action="heaters"]');
await wait(4000);
await shot('8_heating');
await wait(5500);
for (const a of ['lines', 'water', 'beds']) {
  await page.click(`[data-action="${a}"]`);
  await wait(500);
}
await shot('9_outfit');
console.log('outfit done:', JSON.stringify(await q(() => { const h = window.__qa.habitat(); return [h.lines, h.water, h.beds]; })), 'done', await done());
await q(() => window.__qa.closeTerminal());

// Crew moves in; check the crew panel
await wait(10000);
await q(() => window.__qa.key('KeyC', 120));
await wait(1200);
await shot('10_crew_panel');
await page.waitForFunction(() => window.__qa.cutscene(), null, { timeout: 30000 });
await wait(6000);
await shot('11_ending');
await q(() => window.__qa.skip());
await wait(900);
await shot('12_complete');
console.log('final:', JSON.stringify(await q(() => ({ s: window.__qa.state().screen, reached: window.__qa.progress().reached, crewIn: window.__qa.habitat().crewIn }))));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
