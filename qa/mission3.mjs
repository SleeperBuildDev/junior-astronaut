// Plays through Mission 3 with QA hooks and screenshots each stage.
// Usage: node qa/mission3.mjs [en|my]   (dev server must be running)
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
const shot = (name) => page.screenshot({ path: `qa/m3_${lang}_${name}.png` });
const done = () => q(() => [...document.querySelectorAll('.objective li.done')].length);
const promptText = () => q(() => document.querySelector('.prompt')?.textContent ?? null);
const pw = () => q(() => window.__qa.power());

await q(() => window.__qa.mission(3));
await wait(2500);
await shot('0_intro');
console.log('intro cutscene playing:', await q(() => window.__qa.cutscene()));
await q(async () => { await window.__qa.play(); });
await wait(1000);
await shot('1_start');

// Power terminal
await q(() => window.__qa.goTo('pw-terminal', 1.5));
await wait(700);
console.log('terminal prompt:', await promptText());
await q(() => window.__qa.key('KeyE', 120));
await wait(900);
await shot('2_power_terminal');
console.log('terminal:', await q(() => window.__qa.state().terminal), 'done', await done());
await q(() => window.__qa.closeTerminal());
await wait(400);

// Each tower: deploy, then aim
for (let i = 0; i < 3; i++) {
  await q((i) => window.__qa.goTo('vsat-' + i, 1.5), i);
  await wait(700);
  console.log(`tower ${i} prompt:`, await promptText());
  await q(() => window.__qa.key('KeyE', 120));
  await wait(700);
  await page.click('[data-action="deploy"]');
  await wait(i === 0 ? 2500 : 600);
  if (i === 0) await shot('3_tower_deploying');
  await wait(i === 0 ? 3000 : 4800);
  // Aim halfway first (to see partial power), then straight at the Sun.
  const sunYaw = await q(() => {
    const p = window.__qa.power();
    return p.sunYaw;
  });
  const setYaw = (v) =>
    page.evaluate((v) => {
      const el = document.querySelector('.aim-slider');
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  await setYaw(((sunYaw + 50) % 360 + 360) % 360);
  await wait(500);
  if (i === 0) await shot('4_tower_aim_50deg');
  await setYaw(((sunYaw + 0.5) % 360 + 360) % 360);
  await wait(1200);
  if (i === 0) await shot('5_tower_locked');
  await q(() => window.__qa.closeTerminal());
  await wait(300);
}
console.log('towers tracking:', (await pw()).arrays.map((a) => a.tracking), 'done', await done());
await q(() => window.__qa.teleport(30, -30, 0.6, 0.35));
await wait(1500);
await shot('6_towers_deployed');

// Main switch
await q(() => window.__qa.goTo('pw-bus', 1.4));
await wait(700);
console.log('bus prompt:', await promptText());
await q(() => window.__qa.holdE(2600));
await wait(3200);
console.log('bus:', (await pw()).bus, 'speed', await q(() => window.__qa.speed()));
await q(() => window.__qa.goTo('pw-terminal', 4.5, -1.2));
await wait(9000);
await shot('7_charging');
await page.waitForFunction(() => window.__qa.power().batteryKWh >= 60, null, { timeout: 60000 });
await wait(1500);
console.log('charged, done', await done());

// Power plan
await q(() => window.__qa.goTo('pw-terminal', 1.5));
await wait(600);
await q(() => window.__qa.key('KeyE', 120));
await wait(800);
console.log('confirm disabled (all on):', await q(() => document.querySelector('.confirm')?.disabled));
for (const n of [3, 4, 5]) {
  await page.click(`.load-list .load:nth-child(${n + 1})`);
  await wait(200);
}
await wait(400);
await shot('8_power_plan');
console.log('budget:', await q(() => document.querySelector('.budget')?.textContent));
await page.click('.confirm');
await wait(1000);
console.log('plan locked:', (await pw()).planLocked, 'terminal', await q(() => window.__qa.state().terminal));

// The dark: look toward the base with the helmet lamp on
await q(() => window.__qa.key('KeyF', 100));
await wait(12000);
await shot('9_night');
await wait(16000);
await shot('10_sunrise');
await page.waitForFunction(() => window.__qa.cutscene(), null, { timeout: 30000 });
await wait(5000);
await shot('11_ending');
await q(() => window.__qa.skip());
await wait(900);
await shot('12_complete');
console.log('final:', JSON.stringify(await q(() => ({ s: window.__qa.state().screen, battery: Math.round(window.__qa.power().batteryKWh), reached: window.__qa.progress().reached }))));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
