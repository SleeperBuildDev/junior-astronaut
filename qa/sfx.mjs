// Plays every sound effect once and reports the audio engine state and any errors.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate(async () => { window.__qa.start(); await window.__qa.play(); });
const names = ['step', 'jump', 'scan', 'terminal', 'click', 'hover', 'refill', 'airlock', 'complete', 'unlock', 'alarm', 'ratchet', 'clunk', 'powerup', 'lamp', 'panel'];
for (const n of names) { await page.evaluate((n) => window.__qa.sfx(n), n); await page.waitForTimeout(150); }
console.log('audio:', await page.evaluate(() => window.__qa.audio()), 'errors:', errors.length ? errors : 'none');
await browser.close();
