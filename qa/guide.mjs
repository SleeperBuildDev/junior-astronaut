// Screenshots of the guidance marker and the Burmese UI.
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
const lang = process.argv[2] ?? 'en';
await q((l) => { const s = JSON.parse(localStorage.getItem('junior-astronaut.settings') || '{}'); s.lang = l; localStorage.setItem('junior-astronaut.settings', JSON.stringify(s)); }, lang);
await page.reload();
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 60000 });
await wait(800);
await page.screenshot({ path: `qa/g_${lang}_0_menu.png` });
await q(async () => { window.__qa.start(); await window.__qa.play(); });
await q(() => window.__qa.key('KeyW', 7000));
await wait(7600);
await q(() => window.__qa.key('Space', 100));
await wait(3600);
// facing away from Earth: marker should sit at the screen edge
await q(() => window.__qa.look(Math.PI * 0.2, 0));
await wait(700);
await page.screenshot({ path: `qa/g_${lang}_1_earth_edge.png` });
await q(() => { const d = { x: -0.36, y: 0.19, z: -1 }; const l = Math.hypot(d.x, d.y, d.z); window.__qa.look(Math.atan2(-d.x, -d.z), Math.asin(d.y / l) - 0.08); });
await wait(1500);
// now 'reach': look roughly toward the base from the landing area
await q(() => window.__qa.teleport(10, 50, 0.1, -0.02));
await wait(1200);
await page.screenshot({ path: `qa/g_${lang}_2_reach.png` });
await q(() => window.__qa.teleport(0, -2, Math.PI, 0));
await wait(1200);
await q(() => window.__qa.look(-Math.PI / 2 - 0.3, -0.05));
await wait(600);
await page.screenshot({ path: `qa/g_${lang}_3_sensor.png` });
// settings panel
await q(() => window.__qa.key('KeyK', 80));
await wait(600);
await page.screenshot({ path: `qa/g_${lang}_4_knowledge.png` });
console.log(lang, 'errors:', errors.length ? errors : 'none');
await browser.close();
