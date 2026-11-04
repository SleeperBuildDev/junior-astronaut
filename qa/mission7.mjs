// Plays through Mission 7 with QA hooks and screenshots each stage.
// Usage: node qa/mission7.mjs [en|my]   (dev server must be running)
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
const shot = (name) => page.screenshot({ path: `qa/m7_${lang}_${name}.png` });
const done = () => q(() => [...document.querySelectorAll('.objective li.done')].length);
const promptText = () => q(() => document.querySelector('.prompt')?.textContent ?? null);
const sci = () => q(() => window.__qa.science());
const SITES = [{ x: -111, z: -22 }, { x: 82, z: 46 }, { x: 143, z: -196 }];

await q(() => window.__qa.mission(7));
await wait(9000);
await shot('0_intro');
await q(async () => { await window.__qa.play(); });
await wait(1000);
console.log('clock day:', await q(() => document.querySelector('.clock b')?.textContent));

// Into the rover (stand in front of the parked rover, facing it) and drive off
await q(() => window.__qa.teleport(-6.0, -6.4, 1.07, -0.35));
await wait(700);
console.log('rover prompt:', await promptText());
await q(() => window.__qa.key('KeyE', 120));
await wait(600);
await q(() => window.__qa.drive(5000));
await wait(4000);
await shot('1_driving');
await wait(1500);
console.log('rover:', JSON.stringify(await q(() => window.__qa.rover())), 'done', await done());
// Park near site C and look at the crater from the seat
await q(() => window.__qa.roverTo(152, -188, 2.6));
await wait(1500);
await shot('2_near_crater');
await q(() => window.__qa.key('KeyE', 120)); // get out (the climb-out move takes about a second)
await wait(1600);
console.log('out of rover:', !(await q(() => window.__qa.rover().driving)));

// Study each site
for (let i = 0; i < 3; i++) {
  await q((s) => window.__qa.teleport(s.x - 2, s.z + 2.5, 0, 0), SITES[i]);
  await wait(300);
  await q((i) => window.__qa.goTo('site-' + i, 1.5), i);
  await wait(700);
  if (i === 0) console.log('site prompt:', await promptText());
  await q(() => window.__qa.key('KeyE', 120));
  await wait(700);
  const correct = [0, 1, 2][i];
  const wrong = (correct + 1) % 3;
  if (i === 0) {
    await page.click(`[data-answer="${wrong}"]`);
    await wait(400);
    console.log('wrong answer hint shown:', !!(await q(() => document.querySelector('.notes .fault'))));
  }
  await page.click(`[data-answer="${correct}"]`);
  await wait(500);
  await shot(`3_notes_${i}`);
  await q(() => window.__qa.closeTerminal());
  await wait(300);
  await q(() => window.__qa.holdE(2400));
  await wait(3000);
  console.log(`site ${i}:`, (await sci()).sites[i], 'done', await done());
}
await q(() => window.__qa.teleport(147, -194, 1.5, -0.18));
await wait(1200);
await shot('4_shadowed_crater');

// Deliver and analyse
await q(() => window.__qa.teleport(2.5, -26.9, 0, 0));
await wait(300);
await q(() => window.__qa.goTo('lab-port', 1.5));
await wait(700);
console.log('port prompt:', await promptText());
await q(() => window.__qa.key('KeyE', 120));
await wait(900);
await shot('5_lab');
await page.click('[data-action="send"]');
await wait(1000);
console.log('analyzed:', (await sci()).analyzed, 'done', await done());
await page.waitForFunction(() => window.__qa.cutscene(), null, { timeout: 40000 });
await wait(6000);
await shot('6_ending');
await q(() => window.__qa.skip());
await wait(900);
await shot('7_complete');
console.log('final:', JSON.stringify(await q(() => ({ s: window.__qa.state().screen, reached: window.__qa.progress().reached }))));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
