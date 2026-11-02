// Deterministic lunar terrain: rolling regolith, crater stamps, distant massifs and
// flattened work areas for the outpost. Everything derives from one seed, so the
// physics mesh, the render mesh and object placement always agree.

export const LAYOUT = {
  base: { x: 0, z: -20 },
  lander: { x: 12, z: 60 },
  sensors: [
    { x: -34, z: 8 },
    { x: 31, z: 12 },
    { x: -6, z: -64 },
  ],
  playRadius: 360,
} as const;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves: number) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise(x * freq + i * 17.3, y * freq - i * 9.1) * 2 - 1);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
  rim: number;
}

const CELL = 64;
const craterGrid = new Map<string, Crater[]>();

function addCrater(c: Crater) {
  const reach = c.r * 2.6;
  for (let gx = Math.floor((c.x - reach) / CELL); gx <= Math.floor((c.x + reach) / CELL); gx++) {
    for (let gz = Math.floor((c.z - reach) / CELL); gz <= Math.floor((c.z + reach) / CELL); gz++) {
      const key = gx + ',' + gz;
      let list = craterGrid.get(key);
      if (!list) craterGrid.set(key, (list = []));
      list.push(c);
    }
  }
}

const KEEP_CLEAR = [
  { ...LAYOUT.base, r: 55 },
  { ...LAYOUT.lander, r: 26 },
  ...LAYOUT.sensors.map((s) => ({ ...s, r: 8 })),
];

(function generateCraters() {
  const rand = mulberry32(20261102);
  for (let i = 0; i < 900; i++) {
    // Power-law sizes: many small craters, a few large ones.
    const r = 4 + Math.pow(rand(), 3.2) * 95;
    const dist = Math.sqrt(rand()) * 1400;
    const ang = rand() * Math.PI * 2;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const blocked = KEEP_CLEAR.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + r * 1.4);
    if (blocked) continue;
    const fresh = 0.6 + rand() * 0.6; // older craters are shallower and softer
    addCrater({ x, z, r, depth: 0.19 * r * fresh, rim: 0.045 * r * fresh });
  }
  // One big landmark crater on the way from the lander to the far ridge.
  addCrater({ x: 120, z: 150, r: 70, depth: 15, rim: 3.4 });
})();

function craterHeight(x: number, z: number) {
  const list = craterGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!list) return 0;
  let h = 0;
  for (const c of list) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1) h += -c.depth * (1 - d * d) + c.rim * d * d * d * d;
    else if (d < 2.6) h += c.rim * Math.pow(d, -3) * (1 - smoothstep(2, 2.6, d));
  }
  return h;
}

/** Raw height before the flattened work areas are applied. */
function rawHeight(x: number, z: number) {
  const dist = Math.hypot(x, z);
  const rolling = 4 * fbm(x / 160, z / 160, 4) + 0.7 * fbm(x / 18, z / 18, 3);
  // Massifs rise beyond the play area so the horizon reads as mountains, not a plane.
  const massif = smoothstep(450, 2600, dist) * (260 * Math.max(0, fbm(x / 1100 + 3.1, z / 1100 - 1.7, 5) + 0.35));
  return rolling + craterHeight(x, z) + massif;
}

const flatAreas = KEEP_CLEAR.map((k) => ({ ...k, h: rawHeight(k.x, k.z) }));

export function heightAt(x: number, z: number) {
  let h = rawHeight(x, z);
  for (const f of flatAreas) {
    const d = Math.hypot(x - f.x, z - f.z);
    const inner = f.r * 0.62;
    if (d < f.r) h = f.h + (h - f.h) * smoothstep(inner, f.r, d);
  }
  return h;
}

export function padHeight(which: 'base' | 'lander') {
  return heightAt(LAYOUT[which].x, LAYOUT[which].z);
}
