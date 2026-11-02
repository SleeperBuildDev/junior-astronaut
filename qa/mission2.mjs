// Plays through Mission 2 with QA hooks and screenshots each stage.
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
const shot = (name) => page.screenshot({ path: `qa/m2_${name}.png` });
const done = () => q(() => [...document.querySelectorAll('.objective li.done')].length);
const promptText = () => q(() => document.querySelector('.prompt')?.textContent ?? null);

await q(() => window.__qa.next());
await wait(1500);
await shot('0_start');
await q(() => window.__qa.teleport(12.8, -14.4, 0, -0.08));
await wait(800);
await shot('0b_at_terminal');
console.log('mission', await q(() => window.__qa.state().mission), 'done', await done());
// stand in front of the terminal, facing it (terminal at about x 12.8, z -16)
await q(() => window.__qa.teleport(12.8, -14.4, 0, -0.08));
await wait(800);
console.log('terminal prompt:', await promptText(), 'done', await done());
await q(() => window.__qa.key('KeyE', 120));
await wait(800);
console.log('terminal open:', await q(() => window.__qa.state().terminal));
for (let i = 0; i < 3; i++) {
  await page.click('.checklist li.next .btn');
  await wait(400);
}
await shot('1_terminal_o2');
console.log('after o2 start, done', await done());
await q(() => window.__qa.closeTerminal());
await wait(600);
// filter housing at about x 14.05, z -16.5
await q(() => window.__qa.teleport(14.05, -15.2, 0, -0.55));
await wait(800);
console.log('filter prompt:', await promptText());
await q(() => window.__qa.holdE(3200));
await wait(1200);
await shot('2_filter_hold');
await wait(2400);
console.log('after filter, done', await done());
await q(() => window.__qa.teleport(12.8, -14.4, 0, -0.08));
await wait(700);
await q(() => window.__qa.key('KeyE', 120));
await wait(700);
console.log('terminal reopened:', await q(() => window.__qa.state().terminal), await q(() => document.querySelector('.terminal')?.innerText.slice(0, 400)));
await shot('2b_reopen');
await page.click('.terminal >> text=Start water recovery', { timeout: 5000 });
await wait(9000);
await shot('3_terminal_water');
await wait(12000);
console.log('final state:', JSON.stringify(await q(() => ({ s: window.__qa.state().screen, t: window.__qa.state().terminal }))));
await shot('4_complete');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
