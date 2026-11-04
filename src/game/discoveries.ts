import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sfx } from '../audio/audio';
import type { Astronaut } from '../world/astronaut';
import type { ColliderSpec, Interactable } from '../world/base';
import type { GroundEffects } from '../world/effects';
import { cratersNear, heightAt, LAYOUT, mulberry32 } from '../world/heightfield';
import { EARTH_DIR, SUN_DIR } from '../world/sky';
import type { Shot } from './cutscenes';

// Secret discoveries: two or three hidden finds in every mission's area, off the guided
// path. A gold glint gives each one away from a distance and the suit scanner chirps when
// you get close. Pressing E plays a "legendary" cutscene (your astronaut kneels by the
// find, the visor reflects it, a beam of light, a slow reveal), then unlocks a bonus
// science card. Easter eggs are tributes to real moments from the Apollo missions.

export type Special = 'golf' | 'hammer' | 'ice' | 'flash' | 'laser' | 'eclipse' | 'sunpeak' | 'earth';
export interface DiscoveryDef {
  id: string;
  mission: number;
  egg?: boolean;
  special?: Special;
}

/** Every secret, in mission order. Card ids match the Knowledge Center cards. */
export const DISCOVERIES: DiscoveryDef[] = [
  { id: 'glass', mission: 1 },
  { id: 'freshcrater', mission: 1 },
  { id: 'golf', mission: 1, egg: true, special: 'golf' },
  { id: 'meteorite', mission: 2 },
  { id: 'thermalcrack', mission: 2 },
  { id: 'eternallight', mission: 3, special: 'sunpeak' },
  { id: 'earthshine', mission: 3, special: 'earth' },
  { id: 'hammerfeather', mission: 3, egg: true, special: 'hammer' },
  { id: 'scarp', mission: 4 },
  { id: 'moonquake', mission: 4 },
  { id: 'familyphoto', mission: 4, egg: true },
  { id: 'vesicles', mission: 5 },
  { id: 'solarwind', mission: 5 },
  { id: 'plush', mission: 5, egg: true },
  { id: 'skylight', mission: 6 },
  { id: 'radmeasure', mission: 6 },
  { id: 'icefrost', mission: 7, special: 'ice' },
  { id: 'surveyor', mission: 7 },
  { id: 'impactflash', mission: 8, special: 'flash' },
  { id: 'dustglow', mission: 8 },
  { id: 'retroreflector', mission: 9, special: 'laser' },
  { id: 'eclipse', mission: 9, special: 'eclipse' },
];
export const SECRET_IDS = new Set(DISCOVERIES.map((d) => d.id));

// ---------- materials and little builders ----------
const M = {
  white: new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.7 }),
  foil: new THREE.MeshStandardMaterial({ color: 0xd8a24a, roughness: 0.32, metalness: 0.9 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xc4c7cc, roughness: 0.28, metalness: 0.9 }),
  grey: new THREE.MeshStandardMaterial({ color: 0x7d8086, roughness: 0.55, metalness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.45, metalness: 0.3 }),
  tan: new THREE.MeshStandardMaterial({ color: 0xbfae8c, roughness: 0.75, metalness: 0.15 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.25, metalness: 0.6 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x6f6b65, roughness: 0.95, flatShading: true }),
  basalt: new THREE.MeshStandardMaterial({ color: 0x3d3b39, roughness: 0.9, flatShading: true }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.42, metalness: 0.85, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb8352c, roughness: 0.6 }),
};

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A lumpy rock: an icosphere pushed in and out by seeded noise. */
function lumpy(radius: number, seed: number, detail = 2, squash = 0.7) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const r = mulberry32(seed);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const bumps = Array.from({ length: 7 }, () => [new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), (r() - 0.5) * 0.5] as const);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let k = 1;
    for (const [d, a] of bumps) k += a * Math.max(0, n.dot(d)) ** 3;
    v.multiplyScalar(k);
    v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A flat disc decal that follows the ground, with a canvas-drawn texture. */
function groundDecal(x: number, z: number, radius: number, draw: (g: CanvasRenderingContext2D, s: number) => void, opts: { opacity?: number; emissive?: boolean } = {}) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d')!, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.CircleGeometry(radius, 48, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(x + pos.getX(i), z + pos.getZ(i)) + 0.02);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0, z);
  m.receiveShadow = true;
  m.renderOrder = 2;
  return m;
}

function tripod(parent: THREE.Object3D, h: number) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = add(parent, new THREE.CylinderGeometry(0.015, 0.02, h * 1.05, 6), M.grey, Math.cos(a) * h * 0.18, h / 2, Math.sin(a) * h * 0.18);
    leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
  }
}

function labelCanvas(lines: string[], w = 256, h = 96) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9d4c7';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#26282c';
  g.font = 'bold 30px monospace';
  lines.forEach((l, i) => g.fillText(l, 12, 38 + i * 36));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
}

/** Faded family photo in a plastic sleeve (made up: the junior astronaut's family). */
function photoMaterial() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 190;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 190);
  sky.addColorStop(0, '#9fc3d9');
  sky.addColorStop(1, '#e8dcc2');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 190);
  g.fillStyle = '#7f9a6a';
  g.fillRect(0, 130, 256, 60);
  // Four people and a dog, smiling (very simple shapes; the sun has faded it).
  const people = [
    [62, 1.0, '#b5523b'],
    [104, 0.82, '#3d6ea8'],
    [146, 0.92, '#d9a33d'],
    [190, 1.05, '#5a7d4f'],
  ] as const;
  for (const [x, s, col] of people) {
    g.fillStyle = col;
    g.fillRect(x - 15 * s, 150 - 70 * s, 30 * s, 60 * s);
    g.fillStyle = '#e5b896';
    g.beginPath();
    g.arc(x, 150 - 82 * s, 13 * s, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#6b4a2f';
  g.fillRect(212, 140, 26, 14);
  g.beginPath();
  g.arc(240, 138, 7, 0, Math.PI * 2);
  g.fill();
  // Sun-bleached: wash everything toward white.
  g.fillStyle = 'rgba(255,250,240,0.38)';
  g.fillRect(0, 0, 256, 190);
  g.strokeStyle = '#f7f3ea';
  g.lineWidth = 10;
  g.strokeRect(0, 0, 256, 190);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.25, metalness: 0.05 });
}

function starTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  glow.addColorStop(0, 'rgba(255,248,220,1)');
  glow.addColorStop(0.12, 'rgba(255,214,120,0.9)');
  glow.addColorStop(0.4, 'rgba(255,170,60,0.18)');
  glow.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  // Four long rays: a camera-lens star.
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [
    [S, 3],
    [3, S],
  ]) {
    const ray = g.createLinearGradient(0, 0, w > h ? S : 0, w > h ? 0 : S);
    ray.addColorStop(0, 'rgba(255,220,140,0)');
    ray.addColorStop(0.5, 'rgba(255,240,200,0.95)');
    ray.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = ray;
    g.fillRect((S - w) / 2, (S - h) / 2, w, h);
  }
  return new THREE.CanvasTexture(c);
}

// ---------- the props ----------
interface Built {
  obj: THREE.Group;
  /** Where the camera and the glint look (relative to obj). */
  focus: THREE.Vector3;
  colliders: ColliderSpec[];
  /** Props the special cutscenes animate. */
  parts?: Record<string, THREE.Object3D>;
  update?: (dt: number, t: number, lamp: number) => void;
}

const ground = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
const cyl = (p: THREE.Vector3, r: number, h: number): ColliderSpec => ({ kind: 'cylinder', center: p.clone().add(new THREE.Vector3(0, h / 2, 0)), halfHeight: h / 2, radius: r });

function findPeak() {
  // The highest ground 70-200 m from the base: the "peak of light" survey stake.
  let best = { x: 0, z: 0, h: -1e9 };
  for (let r = 70; r <= 200; r += 6)
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = LAYOUT.base.x + Math.cos(a) * r;
      const z = LAYOUT.base.z + Math.sin(a) * r;
      const h = heightAt(x, z);
      if (h > best.h) best = { x, z, h };
    }
  return best;
}

function findIce() {
  const s = LAYOUT.sites[2];
  const near = cratersNear(s.x, s.z, 0, 45).sort((a, b) => b.r - a.r)[0];
  if (!near) return { x: s.x + 8, z: s.z + 8 };
  const d = new THREE.Vector2(s.x - near.x, s.z - near.z);
  if (d.length() < 0.01) d.set(1, 0);
  d.normalize().multiplyScalar(near.r * 0.45);
  return { x: near.x + d.x, z: near.z + d.y };
}

const SPOTS: Record<string, () => { x: number; z: number }> = {
  glass: () => ({ x: -24, z: 52 }),
  freshcrater: () => ({ x: 44, z: 82 }),
  golf: () => ({ x: 32, z: 34 }),
  meteorite: () => ({ x: -52, z: -58 }),
  thermalcrack: () => ({ x: 58, z: -64 }),
  eternallight: findPeak,
  earthshine: () => ({ x: -62, z: -34 }),
  hammerfeather: () => ({ x: 24, z: -82 }),
  scarp: () => ({ x: -96, z: 62 }),
  moonquake: () => ({ x: 74, z: -6 }),
  familyphoto: () => ({ x: -16, z: 96 }),
  vesicles: () => ({ x: 96, z: -38 }),
  solarwind: () => ({ x: -78, z: -88 }),
  plush: () => ({ x: LAYOUT.sensors[2].x + 1.6, z: LAYOUT.sensors[2].z + 1.2 }),
  skylight: () => ({ x: -150, z: 96 }),
  radmeasure: () => ({ x: 62, z: 106 }),
  icefrost: findIce,
  surveyor: () => ({ x: -186, z: 124 }),
  impactflash: () => ({ x: 36, z: 116 }),
  dustglow: () => ({ x: -104, z: -126 }),
  retroreflector: () => ({ x: -40, z: 142 }),
  eclipse: () => ({ x: 116, z: -116 }),
};

function build(id: string, x: number, z: number, terrainMat: THREE.Material): Built {
  const g = new THREE.Group();
  const p = ground(x, z);
  g.position.copy(p);
  const out: Built = { obj: g, focus: new THREE.Vector3(0, 0.3, 0), colliders: [] };
  const r = mulberry32(id.length * 977 + Math.round(x * 13));
  switch (id) {
    case 'glass': {
      // Orange soil made of tiny glass beads (like Apollo 17's Shorty crater).
      g.add(
        groundDecal(x, z, 2.6, (c, S) => {
          const grd = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
          grd.addColorStop(0, 'rgba(214,112,40,0.95)');
          grd.addColorStop(0.6, 'rgba(190,96,40,0.7)');
          grd.addColorStop(1, 'rgba(160,90,50,0)');
          c.fillStyle = grd;
          c.fillRect(0, 0, S, S);
          for (let i = 0; i < 1600; i++) {
            c.fillStyle = `rgba(${200 + r() * 55},${90 + r() * 70},${30 + r() * 30},${0.4 + r() * 0.5})`;
            const a = r() * Math.PI * 2;
            const d = Math.sqrt(r()) * S * 0.45;
            c.fillRect(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 2, 2);
          }
        }),
      );
      g.children[0].position.sub(p);
      const beadMat = new THREE.MeshPhysicalMaterial({ color: 0xff8a2a, roughness: 0.08, metalness: 0.1, clearcoat: 1, emissive: 0x3a1400 });
      const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), beadMat, 260);
      const mm = new THREE.Matrix4();
      for (let i = 0; i < 260; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 1.8;
        const bx = Math.cos(a) * d;
        const bz = Math.sin(a) * d;
        const s = 0.012 + r() * 0.02;
        mm.makeScale(s, s, s).setPosition(bx, heightAt(x + bx, z + bz) - p.y + s * 0.6, bz);
        beads.setMatrixAt(i, mm);
      }
      g.add(beads);
      out.focus.set(0, 0.1, 0);
      break;
    }
    case 'freshcrater': {
      // A young crater: bright fresh rock and rays, not yet darkened by space weathering.
      g.add(
        groundDecal(x, z, 6.5, (c, S) => {
          c.translate(S / 2, S / 2);
          for (let i = 0; i < 26; i++) {
            const a = r() * Math.PI * 2;
            const len = S * (0.22 + r() * 0.28);
            const grd = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
            grd.addColorStop(0, 'rgba(235,232,225,0.85)');
            grd.addColorStop(1, 'rgba(235,232,225,0)');
            c.strokeStyle = grd;
            c.lineWidth = 2 + r() * 6;
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
            c.stroke();
          }
          const bowl = c.createRadialGradient(0, 0, 0, 0, 0, S * 0.2);
          bowl.addColorStop(0, 'rgba(60,58,55,0.9)');
          bowl.addColorStop(0.55, 'rgba(120,117,110,0.8)');
          bowl.addColorStop(0.8, 'rgba(245,242,235,0.95)');
          bowl.addColorStop(1, 'rgba(235,232,225,0)');
          c.fillStyle = bowl;
          c.beginPath();
          c.arc(0, 0, S * 0.2, 0, Math.PI * 2);
          c.fill();
        }),
      );
      g.children[0].position.sub(p);
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const d = 1.7 + r() * 1.5;
        add(g, lumpy(0.05 + r() * 0.1, 40 + i, 1), new THREE.MeshStandardMaterial({ color: 0xcfcbc2, roughness: 0.9, flatShading: true }), Math.cos(a) * d, 0.03, Math.sin(a) * d);
      }
      out.focus.set(0, 0.1, 0);
      break;
    }
    case 'golf': {
      const ball = add(g, new THREE.SphereGeometry(0.0215, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x222222 }), 0, 0.02, 0);
      // A club head clipped onto a sample-scoop handle, as Alan Shepard did.
      const club = new THREE.Group();
      add(club, new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8), M.silver, 0, 0.5, 0);
      add(club, new RoundedBoxGeometry(0.09, 0.05, 0.025, 2, 0.008), M.silver, 0.035, 0.01, 0);
      club.position.set(0.5, 0.01, 0.3);
      club.rotation.set(0, 0.4, Math.PI / 2 - 0.04);
      g.add(club);
      out.parts = { ball, club };
      out.focus.set(0, 0.05, 0);
      break;
    }
    case 'meteorite': {
      // A heavy iron chunk with thumbprint dents, half buried in its own small pit.
      g.add(
        groundDecal(x, z, 1.6, (c, S) => {
          const grd = c.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S / 2);
          grd.addColorStop(0, 'rgba(40,38,36,0.85)');
          grd.addColorStop(0.7, 'rgba(70,68,64,0.5)');
          grd.addColorStop(1, 'rgba(70,68,64,0)');
          c.fillStyle = grd;
          c.fillRect(0, 0, S, S);
        }),
      );
      g.children[0].position.sub(p);
      const rock = add(g, lumpy(0.38, 91, 3, 0.75), M.iron, 0, 0.12, 0, 0.3, 0.8, 0.1);
      rock.scale.set(1.2, 1, 0.9);
      out.colliders.push(cyl(p, 0.42, 0.4));
      out.focus.set(0, 0.25, 0);
      break;
    }
    case 'thermalcrack': {
      // A boulder split into pieces by two weeks of heat and two weeks of cold, over and over.
      const pieces = [
        [-0.42, 0.25, 0.1, -0.12],
        [0.38, -0.2, -0.05, 0.14],
        [0.05, 0.05, 0.55, 0.05],
      ];
      pieces.forEach(([px, pz, rot, tilt], i) => {
        const m = add(g, lumpy(0.75, 300 + i, 2, 0.8), M.rock, px, 0.45, pz, tilt, rot, tilt);
        m.scale.set(0.8, 1, 0.75);
      });
      out.colliders.push(cyl(p, 1.25, 1.2));
      out.focus.set(0, 0.7, 0);
      break;
    }
    case 'eternallight': {
      // A survey stake with a little sun sensor on the highest ridge nearby.
      add(g, new THREE.CylinderGeometry(0.03, 0.04, 1.6, 8), M.silver, 0, 0.8, 0);
      add(g, new THREE.BoxGeometry(0.34, 0.02, 0.26), M.panel, 0, 1.62, 0, -0.5, 0, 0).lookAt(SUN_DIR.clone().multiplyScalar(100));
      add(g, new THREE.SphereGeometry(0.05, 12, 8), M.foil, 0, 1.68, 0);
      for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.05, 0.05, 0.05), M.red, Math.cos(i * 1.57) * 0.6, 0.025, Math.sin(i * 1.57) * 0.6);
      out.focus.set(0, 1.2, 0);
      break;
    }
    case 'earthshine':
    case 'eclipse':
    case 'impactflash': {
      // A camera / telescope on a tripod, aimed at Earth or the far horizon.
      tripod(g, 1.25);
      const head = new THREE.Group();
      head.position.y = 1.28;
      g.add(head);
      const aim = id === 'impactflash' ? new THREE.Vector3(-0.6, 0.02, 1).normalize() : EARTH_DIR.clone();
      head.lookAt(head.getWorldPosition(new THREE.Vector3()).add(aim));
      const tubeLen = id === 'impactflash' ? 0.75 : 0.32;
      add(head, new THREE.CylinderGeometry(0.07, 0.08, tubeLen, 16), id === 'impactflash' ? M.white : M.dark, 0, 0, tubeLen / 2 - 0.08, Math.PI / 2, 0, 0);
      add(head, new THREE.BoxGeometry(0.16, 0.14, 0.18), M.grey, 0, 0, -0.12);
      add(head, new THREE.CircleGeometry(0.066, 16), id === 'eclipse' ? M.dark : new THREE.MeshStandardMaterial({ color: 0x3a5a7a, roughness: 0.05, metalness: 0.9 }), 0, 0, tubeLen - 0.079);
      if (id === 'eclipse') add(g, new THREE.BoxGeometry(0.22, 0.03, 0.15), labelCanvas(['ECLIPSE', 'CAM-2']), 0, 0.6, 0.25, -0.6, 0, 0);
      out.focus.set(0, 1.1, 0);
      break;
    }
    case 'hammerfeather': {
      // A geology hammer and a falcon feather on a flat rock (Apollo 15 tribute).
      add(g, lumpy(0.5, 77, 2, 0.35), M.rock, 0, 0.12, 0);
      const hammer = new THREE.Group();
      add(hammer, new THREE.CylinderGeometry(0.014, 0.016, 0.38, 8), M.wood, 0, 0, 0, 0, 0, Math.PI / 2);
      add(hammer, new THREE.BoxGeometry(0.04, 0.12, 0.035), M.silver, 0.19, 0, 0);
      hammer.position.set(-0.08, 0.3, 0.05);
      g.add(hammer);
      const feather = new THREE.Group();
      const vaneGeo = new THREE.PlaneGeometry(0.06, 0.3, 1, 6);
      const vp = vaneGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < vp.count; i++) {
        const y = vp.getY(i);
        vp.setX(i, vp.getX(i) * (1 - Math.abs(y / 0.16) ** 2) + Math.sin(y * 10) * 0.004);
        vp.setZ(i, Math.abs(vp.getX(i)) * 0.3);
      }
      vaneGeo.computeVertexNormals();
      add(feather, vaneGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.9, side: THREE.DoubleSide }), 0, 0, 0, -Math.PI / 2, 0, 0);
      add(feather, new THREE.CylinderGeometry(0.002, 0.003, 0.32, 4), M.white, 0, 0, 0, Math.PI / 2, 0, 0);
      feather.position.set(0.12, 0.28, -0.06);
      feather.rotation.y = 0.6;
      g.add(feather);
      out.parts = { hammer, feather };
      out.colliders.push(cyl(p, 0.5, 0.25));
      out.focus.set(0, 0.3, 0);
      break;
    }
    case 'scarp': {
      // A lobate scarp: a steep step where the shrinking crust was pushed up and over.
      const L = 30;
      const W = 9;
      const yaw = 0.5;
      const geo = new THREE.PlaneGeometry(L, W, 60, 18);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i); // along
        const w = pos.getY(i); // across: -W/2 front base -> +W/2 back
        const along = 1 - Math.abs(u / (L / 2)) ** 2;
        const front = THREE.MathUtils.smoothstep(w, -W / 2, -W / 2 + 1.6);
        const back = 1 - THREE.MathUtils.smoothstep(w, -W / 2 + 2, W / 2);
        const hgt = 2.3 * Math.max(0, along) * front * back * (0.85 + 0.15 * Math.sin(u * 0.7));
        const wx = x + u * c - w * s;
        const wz = z - u * s - w * c;
        pos.setXYZ(i, wx - x, heightAt(wx, wz) - p.y + hgt - (1 - front) * 0.05, wz - z);
        uv.setXY(i, wx / 4, wz / 4);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, terrainMat);
      m.receiveShadow = m.castShadow = true;
      g.add(m);
      // Loose boulders that tumbled off the steep face.
      for (let i = 0; i < 7; i++) {
        const u = (r() - 0.5) * L * 0.7;
        const w = -W / 2 + 0.4 + r() * 0.8;
        add(g, lumpy(0.18 + r() * 0.3, 500 + i), M.rock, u * c - w * s, 0.1 + heightAt(x + u * c - w * s, z - u * s - w * c) - p.y, -u * s - w * c);
      }
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      out.colliders.push({ kind: 'box', center: p.clone().add(new THREE.Vector3(-s * 0.6, 0.7, -c * 0.6)), half: new THREE.Vector3(L * 0.36, 0.8, 1.6), quat: q });
      // The marker the player inspects: a geologist's flag at the foot of the cliff.
      const fx = -(-W / 2 + 0.6) * s;
      const fz = -(-W / 2 + 0.6) * c;
      add(g, new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), M.silver, fx, heightAt(x + fx, z + fz) - p.y + 0.55, fz);
      add(g, new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }), fx + 0.11, heightAt(x + fx, z + fz) - p.y + 1.02, fz);
      out.focus.set(fx, heightAt(x + fx, z + fz) - p.y + 0.8, fz);
      break;
    }
    case 'moonquake': {
      // An old, made-up seismometer station: foil-wrapped drum, two solar wings, a cable.
      add(g, new THREE.CylinderGeometry(0.28, 0.3, 0.42, 20), M.foil, 0, 0.21, 0);
      add(g, new THREE.SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.foil, 0, 0.42, 0);
      for (const sgn of [-1, 1]) {
        add(g, new THREE.BoxGeometry(0.7, 0.02, 0.5), M.panel, sgn * 0.75, 0.32, 0, 0, 0, sgn * 0.12);
        add(g, new THREE.BoxGeometry(0.15, 0.03, 0.06), M.grey, sgn * 0.36, 0.3, 0);
      }
      add(g, new THREE.BoxGeometry(0.3, 0.12, 0.2), labelCanvas(['SEIS-1', '1999']), 0, 0.06, 0.45);
      const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.05, 0.4), new THREE.Vector3(0.6, 0.02, 1.3), new THREE.Vector3(1.6, 0.02, 1.8), new THREE.Vector3(2.4, 0.02, 3.4)]);
      add(g, new THREE.TubeGeometry(cable, 30, 0.012, 5), M.dark);
      out.colliders.push(cyl(p, 0.4, 0.7));
      out.focus.set(0, 0.4, 0);
      break;
    }
    case 'familyphoto': {
      const photo = add(g, new THREE.PlaneGeometry(0.2, 0.15), photoMaterial(), 0, 0.012, 0, -Math.PI / 2 + 0.06, 0, 0.3);
      photo.castShadow = false;
      out.focus.set(0, 0.05, 0);
      break;
    }
    case 'vesicles': {
      // Dark basalt full of round gas-bubble holes.
      const geo = lumpy(0.7, 123, 4, 0.75);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const holes = Array.from({ length: 70 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = v.clone().normalize();
        let dent = 0;
        for (const hd of holes) dent = Math.max(dent, 1 - THREE.MathUtils.smoothstep(n.angleTo(hd), 0.02, 0.09));
        v.multiplyScalar(1 - dent * 0.09);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      add(g, geo, new THREE.MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.92 }), 0, 0.45, 0, 0.2, 0.4, 0);
      out.colliders.push(cyl(p, 0.75, 1));
      out.focus.set(0, 0.6, 0);
      break;
    }
    case 'solarwind': {
      // A drive-tube core sampler, hammered in, with the top cap off.
      add(g, new THREE.CylinderGeometry(0.022, 0.022, 0.55, 12), M.silver, 0, 0.26, 0, 0.12, 0, 0.05);
      add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), M.red, 0.01, 0.53, 0.03, 0.12, 0, 0.05);
      // A split second tube lying beside it, showing soil layers of different ages.
      const layers = new THREE.Group();
      layers.position.set(0.35, 0.03, 0.15);
      layers.rotation.set(0, 0.7, Math.PI / 2);
      g.add(layers);
      const cols = [0x6d6a64, 0x847f77, 0x5a5751, 0x9a958c, 0x6b6660];
      cols.forEach((col, i) => add(layers, new THREE.CylinderGeometry(0.024, 0.024, 0.11, 10, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: col, roughness: 1 }), 0, -0.22 + i * 0.11, 0));
      out.focus.set(0, 0.25, 0);
      break;
    }
    case 'plush': {
      // A crew member's zero-g indicator: a little bear in a tiny space suit.
      const bear = new THREE.Group();
      const fur = new THREE.MeshStandardMaterial({ color: 0xa8774a, roughness: 1 });
      const suitM = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.9 });
      add(bear, new THREE.SphereGeometry(0.075, 16, 12), suitM, 0, 0.08, 0).scale.set(1, 1.1, 0.9);
      add(bear, new THREE.SphereGeometry(0.06, 16, 12), fur, 0, 0.2, 0.005);
      for (const s of [-1, 1]) {
        add(bear, new THREE.SphereGeometry(0.022, 10, 8), fur, s * 0.045, 0.255, 0);
        add(bear, new THREE.SphereGeometry(0.03, 10, 8), suitM, s * 0.075, 0.1, 0.02);
        add(bear, new THREE.SphereGeometry(0.032, 10, 8), suitM, s * 0.04, 0.02, 0.045);
        add(bear, new THREE.SphereGeometry(0.006, 6, 6), M.dark, s * 0.02, 0.215, 0.055);
      }
      add(bear, new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8b48a }), 0, 0.19, 0.058);
      add(bear, new THREE.SphereGeometry(0.007, 6, 6), M.dark, 0, 0.196, 0.075);
      add(bear, new THREE.TorusGeometry(0.07, 0.008, 6, 20, Math.PI * 2), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.0, transparent: true, opacity: 0.25, roughness: 0.05 }), 0, 0.2, 0, Math.PI / 2, 0, 0);
      add(bear, new THREE.CylinderGeometry(0.02, 0.02, 0.006, 12), new THREE.MeshStandardMaterial({ color: 0x2f7fd8 }), 0, 0.11, 0.07, Math.PI / 2, 0, 0);
      bear.rotation.y = -0.6;
      g.add(bear);
      out.focus.set(0, 0.15, 0);
      break;
    }
    case 'skylight': {
      // A pit: the roof of a lava tube that fell in. The rim boulders and the shaded walls
      // are drawn on a ground decal, so it reads as a deep hole from above.
      const R = 4.6;
      g.add(
        groundDecal(x, z, R, (c, S) => {
          const sunA = Math.atan2(SUN_DIR.z, SUN_DIR.x);
          c.translate(S / 2, S / 2);
          const wall = c.createRadialGradient(0, 0, 0, 0, 0, S / 2);
          wall.addColorStop(0, 'rgba(0,0,0,1)');
          wall.addColorStop(0.62, 'rgba(4,4,5,1)');
          wall.addColorStop(0.86, 'rgba(40,39,37,1)');
          wall.addColorStop(0.97, 'rgba(90,88,84,1)');
          wall.addColorStop(1, 'rgba(90,88,84,0)');
          c.fillStyle = wall;
          c.beginPath();
          c.arc(0, 0, S / 2, 0, Math.PI * 2);
          c.fill();
          // The far wall catches the low sun: a pale crescent on the side away from it.
          c.rotate(sunA + Math.PI);
          const lit = c.createRadialGradient(S * 0.28, 0, S * 0.02, S * 0.28, 0, S * 0.22);
          lit.addColorStop(0, 'rgba(150,146,138,0.85)');
          lit.addColorStop(1, 'rgba(150,146,138,0)');
          c.fillStyle = lit;
          c.beginPath();
          c.ellipse(S * 0.33, 0, S * 0.12, S * 0.3, 0, 0, Math.PI * 2);
          c.fill();
        }),
      );
      g.children[0].position.sub(p);
      (g.children[0] as THREE.Mesh).material = Object.assign((g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial, { roughness: 1, metalness: 0 });
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + r() * 0.2;
        const d = R + 0.3 + r() * 1.2;
        add(g, lumpy(0.2 + r() * 0.45, 600 + i), M.rock, Math.cos(a) * d, heightAt(x + Math.cos(a) * d, z + Math.sin(a) * d) - p.y + 0.1, Math.sin(a) * d);
      }
      // Nobody falls in: a ring of colliders around the rim.
      out.colliders.push(cyl(p.clone().add(new THREE.Vector3(0, -1, 0)), R, 4));
      // Survey marker at the rim, nearest the base.
      const toBase = new THREE.Vector2(LAYOUT.base.x - x, LAYOUT.base.z - z).normalize().multiplyScalar(R + 1.6);
      add(g, new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), M.silver, toBase.x, heightAt(x + toBase.x, z + toBase.y) - p.y + 0.6, toBase.y);
      add(g, new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x401800 }), toBase.x, heightAt(x + toBase.x, z + toBase.y) - p.y + 1.22, toBase.y);
      out.focus.set(toBase.x * 0.55, 0.4, toBase.y * 0.55);
      break;
    }
    case 'radmeasure': {
      // A made-up radiation detector box with a whip antenna and a small solar panel.
      add(g, new RoundedBoxGeometry(0.42, 0.3, 0.34, 3, 0.03), M.foil, 0, 0.15, 0);
      add(g, new THREE.BoxGeometry(0.3, 0.02, 0.3), M.panel, 0, 0.32, 0, -0.3, 0, 0);
      add(g, new THREE.CylinderGeometry(0.004, 0.006, 0.9, 5), M.silver, 0.16, 0.75, -0.12);
      add(g, new THREE.BoxGeometry(0.3, 0.1, 0.01), labelCanvas(['RAD-D', 'mSv/day']), 0, 0.17, 0.176);
      out.focus.set(0, 0.25, 0);
      break;
    }
    case 'icefrost': {
      // Frost in the coldest shadow: pale patches and glittering crystals that light up in your lamp.
      g.add(
        groundDecal(x, z, 3.2, (c, S) => {
          for (let i = 0; i < 90; i++) {
            const a = r() * Math.PI * 2;
            const d = Math.sqrt(r()) * S * 0.42;
            const grd = c.createRadialGradient(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 0, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 6 + r() * 18);
            grd.addColorStop(0, 'rgba(220,235,255,0.75)');
            grd.addColorStop(1, 'rgba(220,235,255,0)');
            c.fillStyle = grd;
            c.fillRect(0, 0, S, S);
          }
        }),
      );
      g.children[0].position.sub(p);
      const n = 420;
      const gp = new Float32Array(n * 3);
      const ph = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 3;
        gp.set([Math.cos(a) * d, heightAt(x + Math.cos(a) * d, z + Math.sin(a) * d) - p.y + 0.03, Math.sin(a) * d], i * 3);
        ph[i] = r() * 100;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, lamp: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float phase;
          uniform float time;
          uniform float lamp;
          varying float vB;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float tw = pow(max(0.0, sin(time * 3.0 + phase)), 12.0);
            vB = (0.15 + lamp * 1.6) * (0.25 + tw * 2.5);
            gl_PointSize = clamp(9.0 / -mv.z, 1.0, 10.0) * (0.6 + tw);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vB;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = max(0.0, 1.0 - length(c) * 2.0);
            float cross = max(0.0, 1.0 - abs(c.x) * 14.0) + max(0.0, 1.0 - abs(c.y) * 14.0);
            gl_FragColor = vec4(vec3(0.8, 0.92, 1.0) * vB * (d * d + cross * d), 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glitter = new THREE.Points(geo, mat);
      g.add(glitter);
      out.update = (_dt, t, lamp) => {
        mat.uniforms.time.value = t;
        mat.uniforms.lamp.value += (lamp - mat.uniforms.lamp.value) * 0.08;
      };
      out.focus.set(0, 0.1, 0);
      break;
    }
    case 'surveyor': {
      // A 1960s-style robot lander (made up, in the style of Surveyor): triangular frame,
      // three legs with crushable footpads, a camera with a mirror hood, antenna and panel.
      const lander = new THREE.Group();
      lander.position.y = 0.0;
      lander.rotation.y = 0.8;
      g.add(lander);
      const top = 1.25;
      const pts = [0, 1, 2].map((i) => new THREE.Vector3(Math.cos((i / 3) * Math.PI * 2) * 0.8, top, Math.sin((i / 3) * Math.PI * 2) * 0.8));
      for (let i = 0; i < 3; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % 3];
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const beam = add(lander, new THREE.CylinderGeometry(0.05, 0.05, a.distanceTo(b), 8), M.tan, mid.x, mid.y, mid.z);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        // Leg out to a footpad, slightly sunk in the dust.
        const foot = new THREE.Vector3(a.x * 1.9, 0.08, a.z * 1.9);
        const legMid = a.clone().add(foot).multiplyScalar(0.5);
        const leg = add(lander, new THREE.CylinderGeometry(0.06, 0.045, a.distanceTo(foot), 8), M.silver, legMid.x, legMid.y, legMid.z);
        // A shock absorber strut from the leg to the bottom of the frame.
        const strutTop = a.clone().multiplyScalar(0.35).setY(top - 0.45);
        const strutBot = a.clone().lerp(foot, 0.55);
        const sm = strutTop.clone().add(strutBot).multiplyScalar(0.5);
        add(lander, new THREE.CylinderGeometry(0.03, 0.03, strutTop.distanceTo(strutBot), 6), M.grey, sm.x, sm.y, sm.z).quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), strutBot.clone().sub(strutTop).normalize());
        // Thermal boxes on the frame.
        add(lander, new THREE.BoxGeometry(0.34, 0.24, 0.26), i === 0 ? M.white : M.foil, mid.x * 0.75, top - 0.1, mid.z * 0.75);
        leg.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(foot).normalize()));
        add(lander, new THREE.CylinderGeometry(0.17, 0.2, 0.08, 16), M.tan, foot.x, 0.04, foot.z);
      }
      add(lander, new THREE.CylinderGeometry(0.28, 0.4, 0.5, 16), M.white, 0, top - 0.15, 0);
      add(lander, new THREE.BoxGeometry(0.4, 0.3, 0.3), M.foil, 0.25, top + 0.2, 0.1);
      // The mast with antenna and solar panel.
      add(lander, new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), M.silver, 0, top + 0.7, 0);
      add(lander, new THREE.BoxGeometry(0.9, 0.02, 0.7), M.panel, 0, top + 1.42, -0.1, 0.5, 0, 0);
      add(lander, new THREE.BoxGeometry(0.7, 0.02, 0.6), M.silver, 0.1, top + 1.25, 0.35, -0.7, 0.3, 0);
      // TV camera with its tilted mirror hood.
      const cam = new THREE.Group();
      cam.position.set(-0.45, top + 0.35, 0.2);
      lander.add(cam);
      add(cam, new THREE.CylinderGeometry(0.09, 0.09, 0.45, 14), M.white, 0, 0, 0);
      add(cam, new THREE.CylinderGeometry(0.1, 0.06, 0.16, 14), M.dark, 0, 0.3, 0, 0.6, 0, 0);
      // Dust on it: a faint tan tint over everything (it has sat here for decades).
      out.colliders.push(cyl(p, 1.6, 1.6));
      out.focus.set(0, 1.3, 0);
      break;
    }
    case 'dustglow': {
      // A made-up dust detector looking at the horizon.
      add(g, new RoundedBoxGeometry(0.36, 0.26, 0.3, 3, 0.03), M.white, 0, 0.13, 0);
      const cone = add(g, new THREE.CylinderGeometry(0.1, 0.04, 0.22, 16, 1, true), M.silver, 0, 0.3, 0.12, -1.0, 0, 0);
      cone.material = M.silver;
      add(g, new THREE.BoxGeometry(0.34, 0.02, 0.28), M.panel, 0, 0.27, -0.03);
      add(g, new THREE.BoxGeometry(0.28, 0.09, 0.01), labelCanvas(['DUST-3']), 0, 0.13, 0.152);
      out.focus.set(0, 0.25, 0);
      break;
    }
    case 'retroreflector': {
      // A laser mirror panel: 100 glass corner cubes in a tilted tray, pointing at Earth.
      const tray = new THREE.Group();
      tray.position.y = 0.38;
      g.add(tray);
      tray.lookAt(g.position.clone().add(new THREE.Vector3(0, 0.38, 0)).add(EARTH_DIR));
      add(tray, new THREE.BoxGeometry(0.62, 0.62, 0.06), M.silver, 0, 0, -0.02);
      const cubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 12).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x9fb8d6, metalness: 1, roughness: 0.02, clearcoat: 1 }), 100);
      const mm = new THREE.Matrix4();
      for (let i = 0; i < 100; i++) cubes.setMatrixAt(i, mm.makeTranslation(-0.27 + (i % 10) * 0.06, -0.27 + Math.floor(i / 10) * 0.06, 0.02));
      tray.add(cubes);
      for (const sx of [-0.25, 0.25]) add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), M.silver, sx, 0.2, -0.1);
      out.parts = { tray };
      out.focus.set(0, 0.4, 0);
      break;
    }
  }
  return out;
}

// ---------- the world side: glints, hit boxes, the scanner ----------
const ease = (t: number) => t * t * (3 - 2 * t);

export interface DiscoveryEnv {
  scene: THREE.Scene;
  sky: THREE.Group;
  renderer: THREE.WebGLRenderer;
  astronaut: Astronaut;
  fx: GroundEffects;
  terrainMat: THREE.Material;
  /** Multiplies the sunlight (cutscenes dim it for the ice and the eclipse). */
  sunScale: { value: number };
  quality: () => 'low' | 'medium' | 'high';
}

export function buildDiscoveries(env: DiscoveryEnv) {
  const group = new THREE.Group();
  group.name = 'discoveries';
  const starTex = starTexture();
  const items = DISCOVERIES.map((d) => {
    const at = SPOTS[d.id]();
    const b = build(d.id, at.x, at.z, env.terrainMat);
    b.obj.visible = false;
    group.add(b.obj);
    // An invisible box to aim at with the crosshair.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(b.focus);
    b.obj.add(hit);
    // The gold glint that gives it away.
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffd27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glint.position.copy(b.focus).add(new THREE.Vector3(0, 0.35, 0));
    b.obj.add(glint);
    const world = b.obj.position.clone().add(b.focus);
    return { def: d, b, hit, glint, world };
  });
  const interactables: Interactable[] = items.map((it) => ({ id: 'disc-' + it.def.id, object: it.hit, label: () => 'p.disc' }));
  const colliders = items.flatMap((it) => it.b.colliders);

  // Cube camera for the gold visor reflection.
  let cubeRT: THREE.WebGLCubeRenderTarget | null = null;
  let cubeCam: THREE.CubeCamera | null = null;
  const visorMat = env.astronaut.visor.material as THREE.MeshPhysicalMaterial;
  function refreshVisor() {
    const size = env.quality() === 'high' ? 256 : env.quality() === 'medium' ? 128 : 64;
    if (!cubeRT || cubeRT.width !== size) {
      cubeRT?.dispose();
      cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      cubeCam = new THREE.CubeCamera(0.05, 3000, cubeRT);
    }
    env.astronaut.visorWorld(cubeCam!.position);
    const was = env.astronaut.root.visible;
    env.astronaut.root.visible = false;
    const skyPos = env.sky.position.clone();
    env.sky.position.copy(cubeCam!.position);
    const tm = env.renderer.toneMapping;
    env.renderer.toneMapping = THREE.NoToneMapping;
    cubeCam!.update(env.renderer, env.scene);
    env.renderer.toneMapping = tm;
    env.sky.position.copy(skyPos);
    env.astronaut.root.visible = was;
    visorMat.envMap = cubeRT!.texture;
    visorMat.needsUpdate = true;
  }

  // ---------- cutscene props: light, beam, motes ----------
  const goldLight = new THREE.PointLight(0xffc35a, 0, 9, 1.6);
  // A soft column of light: bright in the middle, fading at its edges and toward the sky.
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 }, color: { value: new THREE.Color(0xffc862) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vY = uv.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      uniform vec3 color;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(facing, 2.5) * (1.0 - smoothstep(0.05, 0.9, vY)) * smoothstep(0.0, 0.02, vY);
        gl_FragColor = vec4(color * a * opacity * 2.0, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.1, 60, 32, 1, true), beamMat);
  const moteN = 160;
  const motePos = new Float32Array(moteN * 3);
  const moteSeed = Array.from({ length: moteN }, (_, i) => [((i * 2.399) % (Math.PI * 2)), 0.4 + ((i * 0.618) % 1) * 1.6, (i * 0.37) % 1] as const);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,230,170,0.6)');
    grd.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: dotTex, color: 0xffd98a, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  motes.frustumCulled = false;
  // Laser (retroreflector), eclipse ring, impact flash.
  const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x4dff6a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ringTex = (() => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.08, 'rgba(255,90,40,1)');
    grd.addColorStop(0.25, 'rgba(255,140,60,0.55)');
    grd.addColorStop(1, 'rgba(120,20,10,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  })();
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xfff1d6, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  const flashLight = new THREE.PointLight(0xfff1d6, 0, 400, 1.2);
  for (const o of [goldLight, beam, motes, laser, flash, flashLight]) {
    o.visible = false;
    env.scene.add(o);
  }
  ring.visible = false;
  env.sky.add(ring);
  const earthMesh = env.sky.children.find((c) => (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).material as THREE.ShaderMaterial).uniforms?.dayMap) as THREE.Mesh | undefined;
  const earthSun = earthMesh ? ((earthMesh.material as THREE.ShaderMaterial).uniforms.sunDir.value as THREE.Vector3) : null;
  const earthSunHome = earthSun?.clone() ?? null;

  let active: (typeof items)[number] | null = null;
  /** Temporary objects a cutscene added (removed in cleanup). */
  const extras: THREE.Object3D[] = [];
  const saved: { parent: THREE.Object3D; obj: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion }[] = [];
  function borrow(obj: THREE.Object3D) {
    saved.push({ parent: obj.parent!, obj, pos: obj.position.clone(), quat: obj.quaternion.clone() });
  }

  /** Puts everything a cutscene changed back the way it was. */
  function cleanup() {
    for (const s of saved.splice(0)) {
      s.parent.add(s.obj);
      s.obj.position.copy(s.pos);
      s.obj.quaternion.copy(s.quat);
    }
    for (const o of [goldLight, beam, motes, laser, flash, flashLight, ring]) o.visible = false;
    for (const o of extras.splice(0)) o.removeFromParent();
    env.astronaut.root.visible = false;
    env.astronaut.lamp.intensity = 0;
    env.astronaut.lamp.visible = false;
    env.sunScale.value = 1;
    if (earthSun && earthSunHome) earthSun.copy(earthSunHome);
    active = null;
  }

  // ---------- the legendary cutscene ----------
  /** plain: no gold light, title, narration or sounds (the music video reuses the camera work). */
  function shots(id: string, feet: THREE.Vector3, plain = false): Shot[] {
    const it = items.find((i) => i.def.id === id)!;
    active = it;
    const P = it.world.clone();
    const base = it.b.obj.position.clone();
    const A = env.astronaut;
    // Stand 1.3 m from the find, on the side you walked up from.
    const away = new THREE.Vector3(feet.x - P.x, 0, feet.z - P.z);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x);
    // Big finds (a lander, a boulder) push the astronaut back to just outside them.
    const bulk = it.b.colliders.reduce((r, c) => Math.max(r, c.kind === 'cylinder' ? c.radius : 0), 0);
    const standXZ = P.clone().addScaledVector(away, it.def.special === 'golf' ? 0.55 : Math.max(1.3, bulk + 0.8));
    const stand = new THREE.Vector3(standXZ.x, heightAt(standXZ.x, standXZ.z), standXZ.z);
    const up = (o: THREE.Vector3, h: number) => o.clone().add(new THREE.Vector3(0, h, 0));
    const clampAbove = (p: THREE.Vector3, h = 0.4) => {
      p.y = Math.max(p.y, heightAt(p.x, p.z) + h);
      return p;
    };
    let elapsed = 0;

    const setupAstronaut = () => {
      A.root.visible = true;
      A.root.userData = {};
      A.place(stand, P);
      A.pose('look', 0);
      A.lamp.intensity = 0;
    };
    const glow = (k: number) => {
      if (plain) k = 0;
      goldLight.visible = beam.visible = motes.visible = k > 0.001;
      goldLight.position.copy(up(P, 0.8));
      goldLight.intensity = 14 * k;
      beam.position.copy(up(base, 30));
      beamMat.uniforms.opacity.value = 0.3 * k;
      for (let i = 0; i < moteN; i++) {
        const [a0, r0, h0] = moteSeed[i];
        const a = a0 + elapsed * (0.5 + h0 * 0.6);
        const h = ((h0 + elapsed * 0.12) % 1) * 3.2;
        motePos.set([P.x + Math.cos(a) * r0 * (1 - h / 5), base.y + h, P.z + Math.sin(a) * r0 * (1 - h / 5)], i * 3);
      }
      moteGeo.attributes.position.needsUpdate = true;
      (motes.material as THREE.PointsMaterial).opacity = 0.9 * k;
    };
    // Shots that zoom in change the lens; the others put it back.
    let fov0 = 0;
    const lens = (cam: THREE.PerspectiveCamera, fov = fov0) => {
      if (!fov0) fov0 = cam.fov;
      if (Math.abs(cam.fov - (fov || fov0)) > 0.01) {
        cam.fov = fov || fov0;
        cam.updateProjectionMatrix();
      }
    };
    const tick = (dt: number) => {
      elapsed += dt;
      A.update(dt);
    };

    // 1. Over the shoulder, pushing in, as the glint flares.
    const approach: Shot = {
      dur: 3.2,
      start: () => {
        setupAstronaut();
        it.glint.visible = !plain;
        if (!plain) sfx('legend');
      },
      update: (k, dt) => {
        tick(dt);
        glow(ease(k) * 0.6);
        it.glint.scale.setScalar(0.6 + ease(k) * 2.2);
        if (k > 0.55 && A.root.userData.k !== 1) {
          A.root.userData.k = 1;
          A.pose(it.def.special === 'golf' || it.def.special === 'hammer' ? 'stand' : 'kneel', 1.2);
        }
      },
      cam: (k, cam) => {
        lens(cam);
        const a = stand.clone().addScaledVector(away, 3.6 - k * 1.2).addScaledVector(side, 0.9).add(new THREE.Vector3(0, 1.75 - k * 0.25, 0));
        cam.position.copy(clampAbove(a));
        cam.lookAt(P);
      },
    };
    // 2. The reveal: a slow low orbit with the gold light, the title and the narration.
    const reveal: Shot = {
      dur: 6.5,
      gold: true,
      sub: `cs.d.${id}`,
      vo: `cs_d_${id}`,
      start: () => {
        it.glint.visible = false;
        A.root.userData.k = 0;
      },
      update: (k, dt) => {
        tick(dt);
        glow(Math.min(1, 0.6 + k * 1.5) * (k > 0.85 ? 1 - (k - 0.85) / 0.15 * 0.5 : 1));
      },
      cam: (k, cam) => {
        const a0 = Math.atan2(away.z, away.x) + 0.9;
        const a = a0 + ease(k) * 1.5;
        const rr = 3.4 - k * 0.6;
        const p = new THREE.Vector3(P.x + Math.cos(a) * rr, P.y + 0.9 + k * 0.4, P.z + Math.sin(a) * rr);
        cam.position.copy(clampAbove(p, 0.5));
        cam.lookAt(P.clone().lerp(up(stand, 1), 0.3));
      },
    };
    // 3. The gold visor, reflecting the find and the Moon around it.
    const visor: Shot = {
      dur: 3.4,
      // The narration runs on into this shot, so its subtitle stays up.
      sub: `cs.d.${id}`,
      start: () => {
        A.pose('look', 1.0);
        refreshVisor();
      },
      update: (k, dt) => {
        tick(dt);
        glow(0.5 * (1 - k));
        if (env.quality() === 'high' || k < 0.05) refreshVisor();
      },
      cam: (k, cam) => {
        lens(cam);
        const vp = A.visorWorld();
        const toFind = P.clone().sub(vp).setY(0).normalize();
        const s2 = new THREE.Vector3(-toFind.z, 0, toFind.x);
        cam.position.copy(vp).addScaledVector(toFind, 0.7 - k * 0.15).addScaledVector(s2, 0.26 + k * 0.08).add(new THREE.Vector3(0, 0.04, 0));
        cam.lookAt(vp);
      },
    };
    // 4. Crane up and away: the find, the astronaut, the landscape and Earth.
    const crane: Shot = {
      dur: 4,
      update: (_k, dt) => tick(dt),
      cam: (k, cam) => {
        lens(cam);
        const e = ease(k);
        const p = up(P, 2 + e * 14).addScaledVector(away, 4 + e * 10).addScaledVector(side, -2 - e * 4);
        cam.position.copy(clampAbove(p, 1));
        cam.lookAt(P.clone().lerp(up(P, 0).add(EARTH_DIR.clone().multiplyScalar(60)), e * 0.35));
      },
    };

    const special = it.def.special;
    const parts = it.b.parts ?? {};
    if (special === 'golf') {
      // Swing! In one-sixth gravity with no air, the ball flies far and never curves.
      const ball = parts.ball;
      const club = parts.club;
      const fwd = away.clone().negate();
      const vel = new THREE.Vector3();
      const ballP = new THREE.Vector3();
      // A glow and a fading trail so you can follow the tiny ball across the sky.
      const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xfff0c8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      ballGlow.scale.setScalar(0.5);
      const trailN = 60;
      const trailPos = new Float32Array(trailN * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      trail.frustumCulled = false;
      let trailAcc = 0;
      let flying = false;
      let landed = false;
      const swing: Shot = {
        dur: 3.0,
        start: () => {
          A.pose('stand', 0.4);
          borrow(club);
          A.rHand.add(club);
          // Hands at the top of the grip, the club head down by the ball.
          club.position.set(0, -0.98, 0);
          club.rotation.set(0, 0, 0);
          // Stand beside the ball, facing it; the shot goes off to the golfer's left.
          const gx = P.x + side.x * 0.62;
          const gz = P.z + side.z * 0.62;
          A.place(new THREE.Vector3(gx, heightAt(gx, gz), gz), new THREE.Vector3(P.x, 0, P.z));
        },
        update: (k, dt) => {
          tick(dt);
          glow(0.5);
          if (k > 0.1 && A.root.userData.s !== 1) {
            A.root.userData.s = 1;
            A.pose('swingBack', 1.1);
          }
          if (k > 0.62 && A.root.userData.s === 1) {
            A.root.userData.s = 2;
            A.pose('swingHit', 0.18);
            sfx('golf');
            borrow(ball);
            env.scene.attach(ball);
            ball.add(ballGlow);
            env.scene.add(trail);
            extras.push(ballGlow, trail);
            ballP.copy(ball.getWorldPosition(new THREE.Vector3()));
            for (let i = 0; i < trailN; i++) trailPos.set([ballP.x, ballP.y, ballP.z], i * 3);
            vel.copy(fwd).multiplyScalar(11.5).add(new THREE.Vector3(0, 7.5, 0));
            flying = true;
          }
          if (flying && !landed) {
            // Time runs a little fast so the long Moon flight fits the shot.
            const h = dt * 1.6;
            vel.y -= 1.62 * h;
            ballP.addScaledVector(vel, h);
            if (ballP.y < heightAt(ballP.x, ballP.z) && vel.y < 0) {
              landed = true;
              ballP.y = heightAt(ballP.x, ballP.z) + 0.02;
              env.fx.dust.kick(ballP.x, ballP.y, ballP.z, vel.x, vel.z, 30, 1.2, 1.5, 0.8);
            }
            ball.position.copy(ballP);
            trailAcc += dt;
            if (trailAcc > 0.05) {
              trailAcc = 0;
              trailPos.copyWithin(3, 0, (trailN - 1) * 3);
              trailPos.set([ballP.x, ballP.y, ballP.z], 0);
              trailGeo.attributes.position.needsUpdate = true;
            }
          }
        },
        cam: (k, cam) => {
          const p = up(P, 1.0).addScaledVector(side, -3.2).addScaledVector(fwd, -0.8);
          cam.position.copy(clampAbove(p));
          cam.lookAt(up(P, 0.6).addScaledVector(fwd, k * 1.2));
        },
      };
      const follow: Shot = {
        dur: 6.5,
        gold: true,
        sub: `cs.d.${id}`,
        vo: `cs_d_${id}`,
        update: (k, dt) => {
          swing.update!(1, dt);
          glow(0.4 * (1 - k));
        },
        cam: (_k, cam) => {
          const behind = ballP.clone().addScaledVector(fwd, -3.5).addScaledVector(side, 1.6);
          behind.y = Math.max(ballP.y + 0.8, heightAt(behind.x, behind.z) + 1.2);
          cam.position.lerp(behind, cam.position.distanceTo(behind) > 30 ? 1 : 0.12);
          cam.lookAt(ballP.clone().addScaledVector(fwd, 2));
        },
      };
      return plain ? strip([approach, swing, follow, visor, crane, end()]) : [approach, swing, follow, visor, crane, end()];
    }
    if (special === 'hammer') {
      // Hammer and feather, dropped together: they land together (no air to slow the feather).
      const hammer = parts.hammer;
      const feather = parts.feather;
      const hp = new THREE.Vector3();
      const fp = new THREE.Vector3();
      let fall = -1;
      let done = false;
      const drop: Shot = {
        dur: 7,
        gold: true,
        sub: `cs.d.${id}`,
        vo: `cs_d_${id}`,
        start: () => {
          A.place(stand, P);
          A.pose('hold', 0.8);
          borrow(hammer);
          borrow(feather);
          A.rHand.add(hammer);
          hammer.position.set(0, -0.05, 0.05);
          hammer.rotation.set(0, Math.PI / 2, 0);
          A.lHand.add(feather);
          feather.position.set(0, -0.04, 0.08);
          feather.rotation.set(0, 0, 0);
          fall = -1;
          done = false;
        },
        update: (k, dt) => {
          tick(dt);
          glow(0.55);
          if (k > 0.3 && fall < 0) {
            fall = 0;
            env.scene.attach(hammer);
            env.scene.attach(feather);
            hp.copy(hammer.position);
            fp.copy(feather.position);
          }
          if (fall >= 0 && !done) {
            // Slow motion (x0.45) so you can watch them fall side by side.
            fall += dt * 0.45;
            const drop = 0.5 * 1.62 * fall * fall;
            const gH = heightAt(hp.x, hp.z) + 0.02;
            const gF = heightAt(fp.x, fp.z) + 0.01;
            hammer.position.y = Math.max(gH, hp.y - drop);
            feather.position.y = Math.max(gF, fp.y - drop);
            if (hammer.position.y <= gH) {
              done = true;
              env.fx.dust.kick(hp.x, gH, hp.z, 1, 0, 26, 0.7, 3, 0.5);
              env.fx.dust.kick(fp.x, gF, fp.z, 1, 0, 16, 0.6, 3, 0.5);
              sfx('step', 1);
            }
          }
        },
        cam: (k, cam) => {
          // Side-on and wide enough to see the hands, the falling pair and the ground.
          const mid = up(stand, 0).addScaledVector(away, -0.5);
          const p = up(mid, 1.05).addScaledVector(side, 3.6 - k * 0.4).addScaledVector(away, 0.6);
          cam.position.copy(clampAbove(p, 0.3));
          cam.lookAt(up(mid, 0.95 - k * 0.35));
        },
      };
      return plain ? strip([approach, drop, visor, crane, end()]) : [approach, drop, visor, crane, end()];
    }
    if (special === 'ice') {
      // The lamp sweeps across the dark crater floor and the frost glitters.
      reveal.start = () => {
        it.glint.visible = false;
        A.lamp.intensity = 40;
        A.lamp.visible = true;
        env.sunScale.value = 0.08;
      };
      const base0 = reveal.update!;
      reveal.update = (k, dt) => {
        base0(k, dt);
        env.sunScale.value = 0.08;
        A.lamp.intensity = 40;
      };
      visor.start = () => {
        A.pose('look', 1);
        A.lamp.intensity = 40;
        refreshVisor();
      };
      crane.update = (k, dt) => {
        tick(dt);
        env.sunScale.value = 0.08 + ease(k) * 0.92;
      };
    }
    if (special === 'flash') {
      // A meteoroid strikes the plain a few hundred metres away: a silent flash and debris.
      const dir = new THREE.Vector3(-0.6, 0, 1).normalize();
      const hitAt = P.clone().addScaledVector(dir, 150);
      hitAt.y = heightAt(hitAt.x, hitAt.z) + 1;
      let struck = false;
      reveal.update = (k, dt) => {
        tick(dt);
        glow(0.4);
        if (k > 0.3 && !struck) {
          struck = true;
          flash.visible = flashLight.visible = true;
          flash.position.copy(hitAt);
          flashLight.position.copy(hitAt);
          for (let i = 0; i < 6; i++) env.fx.dust.kick(hitAt.x, hitAt.y - 1, hitAt.z, 1, 0, 150, 16, 3, 1.3);
          sfx('impact');
        }
        if (struck) {
          const f = Math.max(0, 1 - (k - 0.3) / 0.35);
          (flash.material as THREE.SpriteMaterial).opacity = f;
          flash.scale.setScalar(55 + (1 - f) * 45);
          flashLight.intensity = 4000 * f * f;
        }
      };
      reveal.cam = (k, cam) => {
        const shake = struck ? Math.max(0, 1 - (k - 0.3) * 4) * 0.03 : 0;
        const p = up(stand, 1.4).addScaledVector(dir, -2.2).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 0.9);
        cam.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
        cam.lookAt(hitAt.clone().lerp(up(stand, 1.2), 0.02));
      };
    }
    if (special === 'laser') {
      // An observatory on Earth fires a laser; it bounces straight back off the mirror.
      const tray = parts.tray;
      reveal.update = (k, dt) => {
        tick(dt);
        glow(0.5);
        const on = k > 0.2;
        laser.visible = on;
        if (on) {
          const from = tray.getWorldPosition(new THREE.Vector3());
          laser.position.copy(from);
          laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), EARTH_DIR);
          laser.scale.set(1 + Math.sin(elapsed * 30) * 0.2, 900, 1 + Math.sin(elapsed * 30) * 0.2);
          (laser.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.abs(Math.sin(elapsed * 9));
        }
      };
      reveal.cam = (k, cam) => {
        const p = up(base, 0.5).addScaledVector(away, 2.8).addScaledVector(side, 1.4 - k * 2.8);
        cam.position.copy(clampAbove(p, 0.4));
        cam.lookAt(up(base, 0.4).add(EARTH_DIR.clone().multiplyScalar(4 + k * 6)));
      };
      crane.update = (k, dt) => {
        reveal.update!(1, dt);
        (laser.material as THREE.MeshBasicMaterial).opacity *= 1 - k;
      };
    }
    if (special === 'eclipse' && earthSun) {
      // Time skips ahead to an eclipse: Earth covers the Sun and turns into a red ring.
      const earthDist = earthMesh?.position.length() ?? 1000;
      reveal.start = () => {
        it.glint.visible = false;
        ring.visible = true;
        ring.position.copy(EARTH_DIR).multiplyScalar(earthDist * 0.995);
        const s = earthDist * Math.tan(THREE.MathUtils.degToRad(1.0)) * 2 * 1.55;
        ring.scale.set(s, s, 1);
      };
      reveal.update = (k, dt) => {
        tick(dt);
        const e = ease(Math.min(1, k * 1.6));
        env.sunScale.value = 1 - e * 0.85;
        earthSun.copy(earthSunHome!).lerp(EARTH_DIR.clone().negate(), e).normalize();
        (ring.material as THREE.SpriteMaterial).opacity = e;
        glow(0.3 * (1 - e));
      };
      reveal.cam = (k, cam) => {
        // Beside the astronaut, looking past the helmet up at Earth, then zooming in.
        const toE = EARTH_DIR.clone().setY(0).normalize();
        const p = up(stand, 1.0).addScaledVector(new THREE.Vector3(-toE.z, 0, toE.x), 1.6).addScaledVector(toE, -1.6);
        cam.position.copy(clampAbove(p, 0.4));
        cam.lookAt(cam.position.clone().add(EARTH_DIR.clone().multiplyScalar(100)));
        lens(cam, 50 - ease(k) * 38);
      };
      visor.update = (k, dt) => {
        tick(dt);
        if (k < 0.05 || env.quality() === 'high') refreshVisor();
      };
      crane.update = (k, dt) => {
        tick(dt);
        const e = 1 - ease(k);
        env.sunScale.value = 1 - e * 0.85;
        earthSun.copy(earthSunHome!).lerp(EARTH_DIR.clone().negate(), e).normalize();
        (ring.material as THREE.SpriteMaterial).opacity = e;
      };
    }
    if (special === 'sunpeak') {
      reveal.cam = (k, cam) => {
        const toSun = SUN_DIR.clone().setY(0).normalize();
        const p = up(base, 1.0).addScaledVector(toSun, -3.5 + k * 0.8).addScaledVector(new THREE.Vector3(-toSun.z, 0, toSun.x), 1.4 - k * 2);
        cam.position.copy(clampAbove(p, 0.5));
        cam.lookAt(up(base, 1.2).add(SUN_DIR.clone().multiplyScalar(30 * k)));
      };
    }
    if (special === 'earth') {
      reveal.cam = (k, cam) => {
        const toE = EARTH_DIR.clone().setY(0).normalize();
        const p = up(base, 1.4).addScaledVector(toE, -4.2).addScaledVector(new THREE.Vector3(-toE.z, 0, toE.x), 2.2 - k * 1.2);
        cam.position.copy(clampAbove(p, 0.5));
        cam.lookAt(up(base, 1.1).add(EARTH_DIR.clone().multiplyScalar(5 + k * 60)));
        lens(cam, 50 - ease(k) * 26);
      };
    }
    const out = [approach, reveal, visor, crane, end()];
    return plain ? strip(out) : out;

    function end(): Shot {
      return { dur: 0.01, cam: () => {} };
    }
  }

  function strip(list: Shot[]) {
    for (const sh of list) {
      sh.gold = false;
      sh.sub = undefined;
      sh.vo = undefined;
    }
    return list;
  }
  /** Finds shown regardless of the mission (the music video). */
  const forced = new Set<string>();

  let scanAcc = 0;
  let t = 0;
  const api = {
    group,
    interactables,
    colliders,
    shots,
    cleanup,
    /** Renders the gold visor's reflection of the scene right now. */
    refreshVisor,
    /** id of the find under an interactable id, or null. */
    idOf(interactId: string) {
      return interactId.startsWith('disc-') ? interactId.slice(5) : null;
    },
    /** Total and found counts for one mission (or all). */
    count(found: string[], mission?: number) {
      const list = DISCOVERIES.filter((d) => mission === undefined || d.mission === mission);
      return { found: list.filter((d) => found.includes(d.id)).length, total: list.length };
    },
    /** Shows this mission's finds, animates the glints; returns metres to the nearest unfound one. */
    update(dt: number, mission: number, feet: THREE.Vector3 | null, found: string[], lampOn: boolean, cutscene: boolean) {
      t += dt;
      let nearest = Infinity;
      for (const it of items) {
        const here = it.def.mission === mission || forced.has(it.def.id);
        it.b.obj.visible = here;
        if (!here) continue;
        const isFound = found.includes(it.def.id);
        it.b.update?.(dt, t, lampOn || (cutscene && active === it) ? 1 : 0);
        if (cutscene && active === it) continue;
        const d = feet ? Math.hypot(feet.x - it.world.x, feet.z - it.world.z) : Infinity;
        it.glint.visible = !isFound && d < 140 && api.glints;
        if (it.glint.visible) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + it.world.x);
          const s = (0.5 + pulse * 0.35) * THREE.MathUtils.clamp(d / 22, 0.6, 3.2);
          it.glint.scale.setScalar(s);
          it.glint.material.rotation = t * 0.3;
          it.glint.material.opacity = 0.55 + pulse * 0.45;
        }
        if (!isFound) nearest = Math.min(nearest, d);
      }
      // The suit scanner chirps faster as you close in (within 25 m).
      if (!cutscene && nearest < 25) {
        scanAcc += dt;
        const every = 0.35 + (nearest / 25) * 2.2;
        if (scanAcc >= every) {
          scanAcc = 0;
          sfx('anomaly', 1 - nearest / 25);
        }
      }
      return nearest;
    },
    /** Show these finds in every mission (or none with an empty list). */
    force(ids: string[]) {
      forced.clear();
      for (const id of ids) forced.add(id);
    },
    /** Hides the gold glints (the music video). */
    glints: true,
    /** QA: where each find is. */
    list() {
      return items.map((it) => ({ id: it.def.id, mission: it.def.mission, x: +it.world.x.toFixed(1), z: +it.world.z.toFixed(1), y: +it.world.y.toFixed(1) }));
    },
  };
  return api;
}
export type Discoveries = ReturnType<typeof buildDiscoveries>;
