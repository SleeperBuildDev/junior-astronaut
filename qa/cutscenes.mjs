// Plays each cutscene and screenshots it at a few moments: node qa/cutscenes.mjs [en|my]
import { chromium } from 'playwright-core';

const lang = process.argv[2] ?? 'en';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript((l) => localStorage.setItem('junior-astronaut.settings', JSON.stringify({ lang: l })), lang);
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
const plan = { intro: [2.5, 9, 14.5, 19, 25], m1End: [3, 8], m2Intro: [3, 9.5], m2End: [2, 9] };
for (const [name, times] of Object.entries(plan)) {
  await page.evaluate((n) => window.__qa.cut(n), name);
  let last = 0;
  for (const [i, sec] of times.entries()) {
    await page.waitForTimeout((sec - last) * 1000);
    last = sec;
    await page.screenshot({ path: `qa/cs_${lang}_${name}_${i}.png` });
  }
  await page.evaluate(() => window.__qa.skip());
  await page.waitForTimeout(500);
}
console.log(lang, 'errors:', errors.length ? errors : 'none');
await browser.close();
