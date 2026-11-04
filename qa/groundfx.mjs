// Footprints, dust, the body shadow, a discovery's glint and rover tracks in normal play.
// Usage: node qa/groundfx.mjs [quality]   (dev server must be running)
import { chromium } from 'playwright-core';

const quality = process.argv[2] ?? 'high';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5173/?qa=1');
await page.waitForFunction(() => window.__qa?.ready, null, { timeout: 90000 });
await page.evaluate((q) => window.__qa.quality(q), quality);
const q = (fn, arg) => page.evaluate(fn, arg);
const wait = (s) => page.waitForTimeout(s * 1000);

// Mission 1: walk toward the orange glass glint with the low Sun behind, look down, look back.
await q(() => window.__qa.mission(1));
await wait(1.2);
await q(async () => { await window.__qa.play(); });
await wait(1);
const glass = (await q(() => window.__qa.discoveries())).find((d) => d.id === 'glass');
const sx = glass.x + 2;
const sz = glass.z - 26;
const yaw = Math.atan2(-(glass.x - sx), -(glass.z - sz));
await q(([x, z, yaw]) => window.__qa.teleport(x, z, yaw, -0.08), [sx, sz, yaw]);
await wait(1.5);
await page.screenshot({ path: 'qa/fx_glint.png' });
await q(() => window.__qa.key('KeyW', 4000));
await wait(2.5);
await q(([yaw]) => window.__qa.look(yaw, -0.75), [yaw]);
await wait(0.4);
await page.screenshot({ path: 'qa/fx_dust.png' });
await wait(1.4);
await q(() => window.__qa.key('Space', 200));
await wait(2.6);
await page.screenshot({ path: 'qa/fx_land.png' });
await q(([yaw]) => window.__qa.look(yaw + Math.PI, -0.45), [yaw]);
await wait(0.6);
await page.screenshot({ path: 'qa/fx_prints.png' });
console.log('scanner state', await q(() => window.__qa.state().pos));

// Mission 7: drive the rover and look back at the tracks.
await q(() => window.__qa.mission(7));
await wait(1.2);
await q(async () => { await window.__qa.play(); });
await wait(1);
await q(() => window.__qa.teleport(-6.0, -6.4, 1.07, -0.35));
await wait(0.7);
await q(() => window.__qa.key('KeyE', 150));
await wait(1);
console.log('in rover', await q(() => window.__qa.rover().driving));
await q(() => window.__qa.drive(5000));
await wait(3);
await page.screenshot({ path: 'qa/fx_rover_drive.png' });
await wait(2.5);
await q(() => window.__qa.key('ArrowLeft', 900));
await wait(1.2);
await page.screenshot({ path: 'qa/fx_rover_tracks.png' });
console.log('rover', await q(() => window.__qa.rover()));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
