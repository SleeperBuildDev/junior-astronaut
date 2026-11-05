// Credits: the main-menu Credits panel and the roll on the right of the music video.
// Saves qa/credits_*.png. Usage: node qa/credits.mjs [en|my] [url]
import { chromium } from 'playwright-core';

const lang = process.argv[2] ?? 'en';
const url = process.argv[3] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript((l) => localStorage.setItem('junior-astronaut.settings', JSON.stringify({ lang: l, quality: 'medium' })), lang);
await page.goto(url + (url.includes('?') ? '&' : '?') + 'qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
const q = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const check = (label, ok) => console.log(ok ? 'PASS' : 'FAIL', label);

// Main menu: the Credits button opens the list.
await page.waitForSelector('.menu-buttons');
const buttons = await page.$$('.menu-buttons .btn');
await buttons[buttons.length - 1].click();
await wait(400);
const n = await q(() => document.querySelectorAll('.modal.credits .credit').length);
check(`credits panel lists everyone and the tools (${n} entries)`, n === 89 + 8);
await page.screenshot({ path: `qa/credits_${lang}_menu.png` });
await q(() => (document.querySelector('.modal.credits').scrollTop = 1e6));
await wait(200);
await page.screenshot({ path: `qa/credits_${lang}_menu_end.png` });
await page.click('.modal.credits .close');

// The music video: the roll is tied to the video's clock.
await q(() => window.__qa.musicVideo());
await page.waitForFunction(() => document.querySelector('.mtv video')?.readyState >= 2, null, { timeout: 30000 });
const at = async (t) => {
  await q((s) => {
    const v = document.querySelector('.mtv video');
    v.pause();
    v.currentTime = s;
  }, t);
  await wait(700);
  return q(() => {
    const r = document.querySelector('.mtv-roll').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  });
};
const start = await at(0.5);
check('roll starts just below the screen', start.top > 820);
for (const t of [8, 40, 80, 120, 150]) {
  const r = await at(t);
  console.log(`t=${t}s roll top ${r.top} bottom ${r.bottom}`);
  await page.screenshot({ path: `qa/credits_${lang}_mv_${t}.png` });
}
const end = await at(160.6);
check('roll has left the top by the end', end.bottom < 10);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
