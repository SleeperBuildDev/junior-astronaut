// Records the music video (src/mtv/film.ts) frame by frame. The dev server must be running.
//   node qa/film.mjs                    full render: mtv/frames.mp4 (1920x1080, 30 fps, no sound)
//   node qa/film.mjs --stills 15,20,40  preview stills mtv/still_<t>.png (1280x720, 15 fps steps)
//   node qa/film.mjs --from 38 --to 64  render part of it (mtv/part_38-64.mp4)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const stills = arg('--stills')?.split(',').map(Number).sort((a, b) => a - b);
const preview = !!stills;
const fps = preview ? 15 : 30;
const [W, H] = preview ? [1280, 720] : [1920, 1080];
const from = Number(arg('--from') ?? 0);
const to = arg('--to') ? Number(arg('--to')) : undefined;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : m.type() === 'info' && console.log('page:', m.text())));
await page.addInitScript(() => localStorage.setItem('junior-astronaut.settings', JSON.stringify({ quality: 'high', volume: 0 })));
await page.goto('http://localhost:5173/?film');
await page.waitForFunction(() => window.__film, null, { timeout: 120000 });
const length = await page.evaluate(() => window.__film.length);
const end = Math.min(to ?? length, length);
await page.evaluate(() => window.__film.start());
const total = Math.round(end * fps);
const first = Math.round(from * fps);
console.log(`rendering ${preview ? 'stills' : 'video'} ${from}-${end}s at ${fps} fps, ${W}x${H}`);

let ff = null;
if (!preview) {
  const out = to || from ? `mtv/part_${from}-${end}.mp4` : 'mtv/frames.mp4';
  ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  console.log('->', out);
}
const t0 = Date.now();
let next = 0;
for (let i = 1; i <= total; i++) {
  const t = i / fps;
  const wantStill = preview && next < stills.length && t >= stills[next];
  const grab = (!preview && i > first) || wantStill;
  const data = await page.evaluate(([g, f]) => {
    window.__film.frame(f);
    return g ? window.__film.grab(0.93) : null;
  }, [grab, fps]);
  if (data) {
    const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    if (preview) {
      writeFileSync(`mtv/still_${stills[next]}.jpg`, buf);
      next++;
    } else if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  if (i % (fps * 10) === 0) console.log(`${t.toFixed(0)} s  (${((Date.now() - t0) / 1000).toFixed(0)} s elapsed)`);
  if (preview && next >= stills.length) break;
}
if (ff) {
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
}
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
