// The music video after Mission 9: finish the settlement (jump to day 30), skip the ending
// cutscene with Space (the video must NOT skip too), check it plays and the game sound is muted,
// skip with Enter, replay from the complete screen, skip with the button, and let it end.
// Saves qa/mv_*.png. Usage: node qa/musicvideo.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url + (url.includes('?') ? '&' : '?') + 'qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
const q = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const screen = () => q(() => window.__qa.state().screen);
const vid = () => q(() => {
  const v = document.querySelector('.mtv video');
  return v ? { t: +v.currentTime.toFixed(1), paused: v.paused, vol: v.volume, w: v.videoWidth, ready: v.readyState } : null;
});
const check = (label, ok) => console.log(ok ? 'PASS' : 'FAIL', label);

await q(() => window.__qa.mission(9));
await wait(1500);
await q(async () => { await window.__qa.play(); });
await wait(1000);
await q(() => window.__qa.settleDay(30));
await page.waitForFunction(() => window.__qa.state().terminal === 'final', null, { timeout: 30000 });
await wait(500);
await page.click('[data-action="finish"]');
await page.waitForFunction(() => window.__qa.state().screen === 'cutscene', null, { timeout: 20000 });
await wait(2500);
await page.keyboard.press('Space'); // skip the ending cutscene
await wait(300);
check('Space that skipped the ending did not skip the video', (await screen()) === 'mtv');
await page.keyboard.down('Space'); // a held key (auto-repeat) must not skip it either
await wait(1500);
await page.keyboard.up('Space');
check('held Space did not skip the video', (await screen()) === 'mtv');
await wait(2500);
let v = await vid();
console.log('video:', JSON.stringify(v), 'game audio:', await q(() => window.__qa.audio?.()));
check('video is playing', v && !v.paused && v.t > 1 && v.w === 1920);
await page.screenshot({ path: 'qa/mv_1_playing.png' });
await page.keyboard.press('Enter');
await wait(400);
check('Enter skipped to the complete screen', (await screen()) === 'complete');
await wait(500);
await page.screenshot({ path: 'qa/mv_2_complete.png' });

// Replay from the complete screen, then skip with the button.
await page.click('text=Watch the music video');
await wait(3000);
check('replay plays the video', (await screen()) === 'mtv' && (await vid())?.t > 0.5);
await page.screenshot({ path: 'qa/mv_3_replay.png' });
await page.click('.mtv-skip');
await wait(400);
check('Skip button returns to the complete screen', (await screen()) === 'complete');

// Let it end on its own (jump near the end).
await page.click('text=Watch the music video');
await wait(1500);
await q(() => { const v = document.querySelector('.mtv video'); v.currentTime = v.duration - 1.5; });
await wait(3500);
check('the end of the video returns to the complete screen', (await screen()) === 'complete');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
