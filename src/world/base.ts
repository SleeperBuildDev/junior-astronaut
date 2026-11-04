import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { heightAt, LAYOUT, padHeight } from './heightfield';
import { EARTH_DIR, SUN_DIR } from './sky';

export type ColliderSpec =
  | { kind: 'box'; center: THREE.Vector3; half: THREE.Vector3; quat?: THREE.Quaternion }
  | { kind: 'cylinder'; center: THREE.Vector3; halfHeight: number; radius: number; quat?: THREE.Quaternion }
  | { kind: 'ball'; center: THREE.Vector3; radius: number };

export interface Interactable {
  id: string;
  object: THREE.Object3D;
  label: () => string;
  /** First mission where it can be used (it is only scenery before that). */
  minMission?: number;
}

export interface Outpost {
  group: THREE.Group;
  colliders: ColliderSpec[];
  interactables: Interactable[];
  blinkers: { mesh: THREE.Mesh; period: number; phase: number }[];
  sensorLights: THREE.Mesh[];
  airlockPos: THREE.Vector3;
  o2StationPos: THREE.Vector3;
  habitatPos: THREE.Vector3;
  lifeSupport: { pos: THREE.Vector3; lights: { o2: THREE.Mesh; water: THREE.Mesh; co2: THREE.Mesh } };
  floodSpots: { pos: THREE.Vector3; target: THREE.Vector3 }[];
  lander: THREE.Object3D;
  airlockLight: THREE.Mesh;
  arrays: VsatRig[];
  power: {
    pos: THREE.Vector3;
    terminalPos: THREE.Vector3;
    busPos: THREE.Vector3;
    batteryPos: THREE.Vector3;
    /** Direction the battery cabinet doors face. */
    batteryFront: THREE.Vector3;
    lever: THREE.Object3D;
    busLight: THREE.Mesh;
    /** Glowing charge bars on the battery cabinet doors (scale.y = charge). */
    gauges: THREE.Mesh[];
  };
  /** The floodlights' emissive lamp material (dimmed when they are switched off). */
  floodLamp: THREE.MeshStandardMaterial | null;
  hab2: Hab2Rig;
  greenhouse: GreenhouseRig;
  radiation: RadiationRig;
  rover: THREE.Object3D;
  science: {
    sites: { marker: THREE.Group; light: THREE.Mesh; pos: THREE.Vector3 }[];
    labPortPos: THREE.Vector3;
  };
  emergency: EmergencyRig;
  settlement: SettlementRig;
}

/** Mission 9: repair points for the new emergencies and the facilities you can build. */
export interface SettlementRig {
  filterPos: THREE.Vector3;
  antennaPos: THREE.Vector3;
  batteryPos: THREE.Vector3;
  /** Each buildable facility: its model (grows while being built) and its collider. */
  facilities: Partial<Record<'solar' | 'battery' | 'oxygen' | 'water' | 'comms' | 'workshop' | 'lab' | 'shelter', { group: THREE.Group; collider: ColliderSpec }>>;
}

/** Mission 8: damage on the solar towers, leak-check fittings on HAB-2, the cooling radiator. */
export interface EmergencyRig {
  /** Crack and grit overlays on tower 2 (shorted) and tower 3 (lost cells). */
  towerDamage: THREE.Mesh[];
  /** Fittings you can check for a leak (world positions) and the patch shown on each. */
  leaks: THREE.Vector3[];
  patches: THREE.Mesh[];
  /** All leak fittings and patches (only on the inflated module, Mission 8 on). */
  fittings: THREE.Group;
  pumpPos: THREE.Vector3;
  pumpLights: { a: THREE.Mesh; b: THREE.Mesh };
  /** Spinning fan covers on the two pump motors. */
  rotors: { a: THREE.Object3D; b: THREE.Object3D };
}

/** Mission 6: radiation monitor, wall-survey tripods and regolith berms around HAB-2. */
export interface RadiationRig {
  monitorPos: THREE.Vector3;
  survey: Record<'hab1' | 'hab2' | 'gh', { group: THREE.Group; light: THREE.Mesh; pos: THREE.Vector3 }>;
  berms: Record<'west' | 'east' | 'south', { mesh: THREE.Mesh; marker: THREE.Group; light: THREE.Mesh; pos: THREE.Vector3; collider: ColliderSpec }>;
}

/** The greenhouse on pad G-1, joined to the lab's north hatch (Mission 5). */
export interface GreenhouseRig {
  /** Pivots on the south end; scale.z grows 0..1 as it is assembled. */
  body: THREE.Group;
  tunnel: THREE.Group;
  /** Window glass lit by the grow lights. */
  glass: THREE.MeshStandardMaterial | null;
  cradle: THREE.Object3D[];
  /** Harvest hatch meshes on the wall (shown once the greenhouse stands). */
  hatchParts: THREE.Object3D[];
  terminalPos: THREE.Vector3;
  hatchPos: THREE.Vector3;
  center: THREE.Vector3;
  collider: ColliderSpec;
}

/** The inflatable habitat module on build pad H-2 (Mission 4), animated by main.ts. */
export interface Hab2Rig {
  /** Connecting tunnel from the node's south port; scale.z 0..1. */
  tunnel: THREE.Group;
  /** Inflatable shell, pivoting on its north end: scale (radial, radial, length). */
  shell: THREE.Group;
  /** Cover on the node's spare port (hidden once the tunnel is attached). */
  cover: THREE.Mesh;
  /** Launch restraint bands around the packed module (hidden once it inflates). */
  bands: THREE.Object3D[];
  /** Window glass (glows once the crew lives inside). */
  glass: THREE.MeshStandardMaterial | null;
  valveLight: THREE.Mesh;
  valvePos: THREE.Vector3;
  terminalPos: THREE.Vector3;
  buildTerminalPos: THREE.Vector3;
  center: THREE.Vector3;
  packedCollider: ColliderSpec;
  fullCollider: ColliderSpec;
  /** Shell scale when packed: radial and lengthwise fractions of the inflated size. */
  packed: { r: number; l: number };
}

// ---------- procedural textures ----------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Photovoltaic blanket: dark cells, silver busbars and gaps between cells. */
function pvTexture() {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = '#c9ccd2';
    g.fillRect(0, 0, 512, 512);
    const n = 8;
    const s = 512 / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const shade = 18 + ((x * 7 + y * 13) % 5) * 2;
        g.fillStyle = `rgb(${shade},${shade + 10},${shade + 38})`;
        g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
        g.fillStyle = 'rgba(200,210,225,0.55)';
        for (let i = 1; i < 4; i++) g.fillRect(x * s + 3, y * s + (s * i) / 4, s - 6, 1.5);
        g.fillRect(x * s + s / 2 - 1, y * s + 3, 2, s - 6);
      }
  });
}

function hazardTexture() {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = '#f2b81c';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#1b1b1b';
    for (let x = -64; x < 256; x += 48) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 24, 64);
      g.lineTo(x + 88, 0);
      g.lineTo(x + 64, 0);
      g.fill();
    }
  });
}

/** Subtle panel seams for the white habitat shell. */
function panelTexture() {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(80,80,80,0.55)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(0, i * 128);
      g.lineTo(512, i * 128);
      g.stroke();
    }
    for (let i = 0; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * 256, 0);
      g.lineTo(i * 256, 512);
      g.stroke();
    }
    g.fillStyle = 'rgba(60,60,60,0.5)';
    for (let y = 8; y < 512; y += 128) for (let x = 10; x < 512; x += 24) g.fillRect(x, y, 3, 3);
    // faint regolith dust towards the bottom
    const grad = g.createLinearGradient(0, 380, 0, 512);
    grad.addColorStop(0, 'rgba(120,112,100,0)');
    grad.addColorStop(1, 'rgba(120,112,100,0.35)');
    g.fillStyle = grad;
    g.fillRect(0, 380, 512, 132);
  });
}

/** Sandblasted solar cells: dark pits, star cracks and a dusty haze (transparent). */
function damageTexture(seed: number) {
  return canvasTexture(256, 320, (g) => {
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const haze = g.createRadialGradient(128, 150, 10, 128, 150, 170);
    haze.addColorStop(0, 'rgba(70,62,52,0.85)');
    haze.addColorStop(0.6, 'rgba(110,100,86,0.45)');
    haze.addColorStop(1, 'rgba(120,110,95,0)');
    g.fillStyle = haze;
    g.fillRect(0, 0, 256, 320);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(20,18,16,${0.5 + rnd() * 0.5})`;
      g.beginPath();
      g.arc(rnd() * 256, rnd() * 320, 1 + rnd() * 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(225,230,240,0.85)';
    g.lineWidth = 1.4;
    for (let k = 0; k < 6; k++) {
      const cx = 30 + rnd() * 196;
      const cy = 30 + rnd() * 260;
      for (let j = 0; j < 6; j++) {
        const a = rnd() * Math.PI * 2;
        const len = 12 + rnd() * 40;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 8, cy + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 8);
        g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        g.stroke();
      }
      g.fillStyle = 'rgba(10,8,6,0.95)';
      g.beginPath();
      g.arc(cx, cy, 3 + rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Radiator panel: white coating with the coolant tubes running back and forth. */
function radiatorTexture() {
  return canvasTexture(128, 256, (g) => {
    g.fillStyle = '#eef0f2';
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#b9bec6';
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i < 9; i++) {
      const x = 12 + i * 13;
      g.moveTo(x, 8);
      g.lineTo(x, 248);
    }
    g.stroke();
    g.fillStyle = '#9aa1ab';
    g.fillRect(0, 0, 128, 7);
    g.fillRect(0, 249, 128, 7);
  });
}

function labelTexture(text: string, bg = '#e9e7e1', fg = '#1d2733') {
  return canvasTexture(512, 128, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = fg;
    g.font = 'bold 64px "B612 Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
  });
}

// ---------- materials ----------

const mats = {
  shell: new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.55, metalness: 0.05 }),
  foil: new THREE.MeshStandardMaterial({ color: 0xd4a640, roughness: 0.32, metalness: 1 }),
  alu: new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.5, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.7 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.9, metalness: 0 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.04, metalness: 0.2, emissive: 0xffc98a, emissiveIntensity: 0.9 }),
  pad: new THREE.MeshStandardMaterial({ color: 0x6d6a64, roughness: 0.95 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }),
  pv: new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.4 }),
  hazard: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
  red: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 4 }),
  green: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x31ff7a, emissiveIntensity: 3 }),
  amber: new THREE.MeshStandardMaterial({ color: 0x221500, emissive: 0xffa21a, emissiveIntensity: 4 }),
  cyan: new THREE.MeshStandardMaterial({ color: 0x002030, emissive: 0x38d8ff, emissiveIntensity: 3 }),
  strapDark: new THREE.MeshStandardMaterial({ color: 0x6b6b66, roughness: 0.85 }),
};

let texturesReady = false;
function initTextures() {
  if (texturesReady) return;
  texturesReady = true;
  mats.pv.map = pvTexture();
  mats.hazard.map = hazardTexture();
  const panel = panelTexture();
  panel.repeat.set(3, 1);
  mats.shell.map = panel;
}

// ---------- helpers ----------

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, pos?: [number, number, number], rot?: [number, number, number]) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function tube(points: THREE.Vector3[], radius: number, mat: THREE.Material, parent: THREE.Object3D) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 10), radius, 8, false), mat, parent);
}

function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, parent: THREE.Object3D) {
  const len = a.distanceTo(b);
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 8), mat, parent);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// ---------- modules ----------

function airlock(radius: number) {
  const g = new THREE.Group();
  const lift = radius + 0.9 + 1.2;
  mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.4, 32), mats.shell, g, [0, lift - 1.2 + 0.0, 0], [0, 0, Math.PI / 2]).position.set(-1.2, 1.25 + 0.9, 0);
  // hatch
  const hatch = mesh(new RoundedBoxGeometry(0.16, 1.7, 1.05, 3, 0.06), mats.white, g, [-2.45, 1.95, 0]);
  hatch.name = 'hatch';
  mesh(new THREE.BoxGeometry(0.08, 0.06, 0.5), mats.dark, g, [-2.56, 1.95, 0]);
  mesh(new THREE.BoxGeometry(0.05, 1.86, 0.08), mats.hazard, g, [-2.42, 1.95, 0.6]);
  mesh(new THREE.BoxGeometry(0.05, 1.86, 0.08), mats.hazard, g, [-2.42, 1.95, -0.6]);
  const light = mesh(new THREE.SphereGeometry(0.07, 12, 8), mats.amber, g, [-2.47, 2.95, 0]);
  // steps up to the hatch
  mesh(new RoundedBoxGeometry(1.1, 0.25, 1.3, 2, 0.04), mats.dark, g, [-3.0, 0.62, 0]);
  mesh(new RoundedBoxGeometry(0.9, 0.25, 1.3, 2, 0.04), mats.dark, g, [-3.2, 0.3, 0]);
  return { group: g, light, hatch };
}

/** A deployable solar tower: rig parts that main.ts animates from the power simulation. */
export interface VsatRig {
  group: THREE.Group;
  /** World position of the mast foot. */
  pos: THREE.Vector3;
  /** Telescoping upper mast; slides up as the tower deploys. */
  upper: THREE.Group;
  /** Turns to face the panels (yaw); a child of upper. */
  head: THREE.Group;
  /** Roll-out blankets, scaled 0..1 down from the top bar. */
  wings: THREE.Group[];
  /** Status light on the control box. */
  light: THREE.Mesh;
  /** The control box the player uses (interactable). */
  box: THREE.Mesh;
  stowedY: number;
  deployedY: number;
  height: number;
}

/**
 * Vertical solar array (after NASA's VSAT concept for the lunar south pole): the Sun
 * stays near the horizon there, so the panels stand upright on a tall mast and turn
 * to follow it. The blankets roll down from a top bar, like a window blind.
 */
function vsat(height: number) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 6), mats.dark, g, [0, 0.25, 0]);
  const lowerLen = height * 0.45;
  mesh(new THREE.CylinderGeometry(0.15, 0.18, lowerLen, 12), mats.alu, g, [0, lowerLen / 2, 0]);
  mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 12), mats.dark, g, [0, lowerLen, 0]);
  // Upper mast section (slides out of the lower one)
  const upperLen = height * 0.55;
  const upper = new THREE.Group();
  g.add(upper);
  mesh(new THREE.CylinderGeometry(0.11, 0.11, upperLen, 12), mats.alu, upper, [0, upperLen / 2, 0]);
  const stowedY = lowerLen - upperLen + 0.7;
  const deployedY = lowerLen - 0.4;
  upper.position.y = stowedY;

  const head = new THREE.Group();
  head.position.y = upperLen;
  upper.add(head);
  const w = 2.4;
  const h = height * 0.58;
  const reach = w + 0.16;
  strut(new THREE.Vector3(-reach, 0, 0), new THREE.Vector3(reach, 0, 0), 0.05, mats.alu, head);
  mesh(new THREE.BoxGeometry(0.4, 0.35, 0.35), mats.dark, head, [0, 0.05, 0]);
  const pvGeo = new THREE.PlaneGeometry(w, h);
  pvGeo.translate(0, -h / 2, 0);
  const uv = pvGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * (h / w) * 3);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const cx = s * (w / 2 + 0.16);
    // Storage canister the blanket rolls out of
    mesh(new THREE.CylinderGeometry(0.1, 0.1, w + 0.1, 12), mats.white, head, [cx, -0.05, 0.02], [0, 0, Math.PI / 2]);
    const wing = new THREE.Group();
    wing.position.set(cx, -0.12, 0);
    head.add(wing);
    mesh(pvGeo, mats.pv, wing, [0, 0, 0.02]);
    mesh(pvGeo, mats.foil, wing, [0, 0, -0.01], [0, Math.PI, 0]).castShadow = false;
    // side cables and the weighted bottom bar that pulls the blanket straight
    strut(new THREE.Vector3(-w / 2, 0, 0), new THREE.Vector3(-w / 2, -h, 0), 0.015, mats.alu, wing);
    strut(new THREE.Vector3(w / 2, 0, 0), new THREE.Vector3(w / 2, -h, 0), 0.015, mats.alu, wing);
    strut(new THREE.Vector3(-w / 2, -h, 0), new THREE.Vector3(w / 2, -h, 0), 0.035, mats.alu, wing);
    wing.scale.y = 0.02;
    wings.push(wing);
  }
  const beacon = mesh(new THREE.SphereGeometry(0.08, 12, 8), mats.red, head, [0, 0.33, 0]);

  // Control box on a post, facing the way the player walks up (+Z of the group)
  strut(new THREE.Vector3(0, 0, 1.55), new THREE.Vector3(0, 1.0, 1.55), 0.04, mats.alu, g);
  const box = mesh(new RoundedBoxGeometry(0.62, 0.46, 0.22, 2, 0.04), mats.white, g, [0, 1.18, 1.55], [-0.25, 0, 0]);
  mesh(new THREE.PlaneGeometry(0.44, 0.26), mats.cyan, g, [0, 1.21, 1.67], [-0.25, 0, 0]).castShadow = false;
  const light = mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.amber, g, [0.22, 1.47, 1.55]);
  tube([new THREE.Vector3(0, 0.6, 1.5), new THREE.Vector3(0, 0.15, 1.1), new THREE.Vector3(0, 0.3, 0.75)], 0.025, mats.rubber, g);
  return { group: g, beacon, upper, head, wings, light, box, stowedY, deployedY };
}

function antenna() {
  const g = new THREE.Group();
  const h = 7;
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) strut(new THREE.Vector3(x * 1.6, 0, z * 1.6), new THREE.Vector3(x * 0.4, h, z * 0.4), 0.05, mats.alu, g);
  for (let y = 1; y < h; y += 1.4) {
    const s = 1.6 - (1.2 * y) / h;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 0.7, 0.025, 4, 4), mats.alu);
    ring.position.y = y;
    ring.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    g.add(ring);
  }
  const dishPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const r = (i / 16) * 1.5;
    dishPts.push(new THREE.Vector2(r, (r * r) / 3.2));
  }
  const dish = new THREE.Group();
  dish.position.y = h + 0.3;
  g.add(dish);
  const bowl = mesh(new THREE.LatheGeometry(dishPts, 48), mats.white, dish);
  (bowl.material as THREE.Material).side = THREE.DoubleSide;
  strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.3, 0), 0.03, mats.alu, dish);
  mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.25, 12), mats.dark, dish, [0, 1.35, 0]);
  // Point the dish at Earth: radio contact with home needs a line of sight.
  dish.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), EARTH_DIR);
  mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mats.dark, g, [0, 0.4, 0]);
  return g;
}

function o2Station() {
  const g = new THREE.Group();
  mesh(new RoundedBoxGeometry(4.2, 0.18, 2.2, 2, 0.05), mats.dark, g, [0, 0.55, 0]);
  for (const [x, z] of [[-1.9, -0.9], [1.9, -0.9], [1.9, 0.9], [-1.9, 0.9]]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), mats.alu, g, [x, 0.27, z]);
  const tankGeo = new THREE.CapsuleGeometry(0.42, 3.0, 8, 24);
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.45, metalness: 0.15 });
  for (const z of [-0.5, 0.5]) mesh(tankGeo, tankMat, g, [0, 1.1, z], [0, 0, Math.PI / 2]);
  mesh(tankGeo, tankMat, g, [0, 1.85, 0], [0, 0, Math.PI / 2]);
  for (const x of [-1.2, 1.2]) mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 24, Math.PI), mats.hazard, g, [x, 1.1, 0], [0, Math.PI / 2, 0]);
  // refill panel the astronaut uses
  const panel = mesh(new RoundedBoxGeometry(0.7, 1.0, 0.18, 2, 0.04), mats.white, g, [2.45, 1.2, 0]);
  panel.name = 'o2-panel';
  // Screen and refill valve on the front (+Z), the side you walk up to from the lander.
  mesh(new THREE.PlaneGeometry(0.45, 0.3), mats.cyan, g, [2.45, 1.38, 0.095]).castShadow = false;
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10), mats.green, g, [2.6, 1.0, 0.18], [Math.PI / 2, 0, 0]);
  tube([new THREE.Vector3(2.3, 1.0, -0.1), new THREE.Vector3(2.0, 0.7, -0.4), new THREE.Vector3(1.4, 1.0, -0.5)], 0.04, mats.rubber, g);
  return { group: g, panel };
}

function lander() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(2.0, 2.2, 1.8, 8), mats.foil, g, [0, 2.3, 0]);
  body.rotation.y = Math.PI / 8;
  mesh(new THREE.CylinderGeometry(1.6, 1.9, 1.4, 8), mats.shell, g, [0, 3.9, 0]).rotation.y = Math.PI / 8;
  mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.6, 16), mats.dark, g, [0, 1.15, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = new THREE.Vector3(Math.cos(a) * 3.6, 0.08, Math.sin(a) * 3.6);
    strut(new THREE.Vector3(Math.cos(a) * 1.8, 2.6, Math.sin(a) * 1.8), foot, 0.09, mats.alu, g);
    strut(new THREE.Vector3(Math.cos(a) * 1.9, 1.5, Math.sin(a) * 1.9), foot, 0.06, mats.alu, g);
    mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 16), mats.foil, g, [foot.x, 0.06, foot.z]);
  }
  // ladder
  for (let y = 0.4; y < 3.3; y += 0.35) mesh(new THREE.BoxGeometry(0.6, 0.04, 0.04), mats.alu, g, [0, y, 2.35]);
  for (const x of [-0.3, 0.3]) strut(new THREE.Vector3(x, 0.1, 2.5), new THREE.Vector3(x, 3.3, 2.15), 0.03, mats.alu, g);
  mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), mats.hazard, g, [0, 4.0, 1.75]);
  return g;
}

function sensorStation(i: number) {
  const g = new THREE.Group();
  strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.1, 0), 0.04, mats.alu, g);
  const box = mesh(new RoundedBoxGeometry(0.55, 0.4, 0.4, 2, 0.04), mats.white, g, [0, 1.25, 0]);
  box.name = 'sensor-box';
  mesh(new THREE.PlaneGeometry(0.3, 0.16), mats.cyan, g, [0, 1.3, 0.205]);
  strut(new THREE.Vector3(0.18, 1.45, 0), new THREE.Vector3(0.18, 2.2, 0), 0.012, mats.dark, g);
  const light = mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.amber, g, [0.18, 2.25, 0]);
  // tripod feet
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + i;
    strut(new THREE.Vector3(0, 0.7, 0), new THREE.Vector3(Math.cos(a) * 0.55, 0.02, Math.sin(a) * 0.55), 0.02, mats.alu, g);
  }
  return { group: g, box, light };
}

function crate(w: number, h: number, d: number) {
  const g = new THREE.Group();
  mesh(new RoundedBoxGeometry(w, h, d, 2, 0.05), mats.white, g, [0, h / 2, 0]);
  mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), mats.hazard, g, [0, h * 0.75, 0]);
  return g;
}

/** Life Support unit (ECLSS skid): oxygen generator, water recovery, CO2 scrubber, terminal. */
function lifeSupportUnit() {
  const g = new THREE.Group();
  mesh(new RoundedBoxGeometry(4.8, 0.22, 2.7, 2, 0.05), mats.dark, g, [0, 0.4, 0]);
  for (const [x, z] of [[-2.2, -1.1], [2.2, -1.1], [2.2, 1.1], [-2.2, 1.1]]) mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 8), mats.alu, g, [x, 0.2, z]);
  // Oxygen generator: an electrolysis stack with cooling fins
  mesh(new RoundedBoxGeometry(1.2, 1.4, 1.1, 2, 0.06), mats.white, g, [-1.5, 1.21, -0.2]);
  for (let i = 0; i < 9; i++) mesh(new THREE.BoxGeometry(0.04, 1.1, 1.16), mats.alu, g, [-2.02 + i * 0.13, 1.21, -0.2]);
  const o2Label = new THREE.MeshStandardMaterial({ map: labelTexture('O2 GEN'), roughness: 0.6 });
  mesh(new THREE.PlaneGeometry(0.9, 0.22), o2Label, g, [-1.5, 1.6, 0.36]);
  // Oxygen storage tank
  mesh(new THREE.CapsuleGeometry(0.42, 1.0, 8, 20), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.45, metalness: 0.15 }), g, [-0.3, 1.35, -0.65]);
  mesh(new THREE.TorusGeometry(0.43, 0.03, 6, 24), mats.hazard, g, [-0.3, 1.35, -0.65], [Math.PI / 2, 0, 0]);
  // Water recovery unit with a removable filter housing at the front
  mesh(new RoundedBoxGeometry(1.4, 1.25, 1.15, 2, 0.06), mats.white, g, [1.05, 1.14, -0.15]);
  const wLabel = new THREE.MeshStandardMaterial({ map: labelTexture('H2O RECOVERY'), roughness: 0.6 });
  mesh(new THREE.PlaneGeometry(1.1, 0.22), wLabel, g, [1.05, 1.58, 0.43]);
  const filter = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 20), mats.hazard, g, [1.05, 0.95, 0.68], [Math.PI / 2, 0, 0]);
  filter.name = 'ls-filter';
  mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 20), mats.dark, g, [1.05, 0.95, 0.97], [Math.PI / 2, 0, 0]);
  // Water tank
  mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 24), mats.white, g, [2.05, 1.16, -0.55]);
  mesh(new THREE.CylinderGeometry(0.505, 0.505, 0.18, 24), new THREE.MeshStandardMaterial({ color: 0x2f7fd0, roughness: 0.4 }), g, [2.05, 1.3, -0.55]);
  // CO2 scrubber canister
  mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 16), mats.alu, g, [2.05, 0.96, 0.75]);
  // Status lights, one per system
  const light = (x: number, z: number) => mesh(new THREE.SphereGeometry(0.07, 12, 8), mats.red, g, [x, 2.0, z]);
  const lights = { o2: light(-1.5, -0.2), water: light(1.05, -0.15), co2: light(2.05, 0.75) };
  lights.co2.position.y = 1.5;
  // Control terminal on a post at the front
  strut(new THREE.Vector3(-0.2, 0.5, 1.45), new THREE.Vector3(-0.2, 1.25, 1.45), 0.06, mats.alu, g);
  const term = mesh(new RoundedBoxGeometry(0.8, 0.55, 0.1, 2, 0.03), mats.dark, g, [-0.2, 1.45, 1.5], [-0.5, 0, 0]);
  term.name = 'ls-terminal';
  mesh(new THREE.PlaneGeometry(0.66, 0.42), mats.cyan, g, [-0.2, 1.47, 1.56], [-0.5, 0, 0]).castShadow = false;
  // Pipes to the habitat node
  tube([new THREE.Vector3(-2.2, 1.0, -0.6), new THREE.Vector3(-3.4, 1.6, -0.9), new THREE.Vector3(-4.4, 2.6, -1.4)], 0.06, mats.alu, g);
  tube([new THREE.Vector3(-2.2, 0.7, 0.2), new THREE.Vector3(-3.5, 1.2, -0.4), new THREE.Vector3(-4.6, 2.2, -1.0)], 0.05, mats.foil, g);
  return { group: g, lights, filter, term };
}

// ---------- outpost ----------

/** Detailed models built in Blender (tools/blender/outpost_assets.py). */
export type OutpostModels = Record<'hab_module' | 'lab_module' | 'node_module' | 'rover' | 'floodlight' | 'power_unit' | 'battery_bank' | 'inflatable_hab' | 'greenhouse', THREE.Object3D>;

function instance(model: THREE.Object3D) {
  const o = model.clone(true);
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true;
  });
  return o;
}

/** A curved name band on a module's shell. */
function moduleLabel(radius: number, lift: number, text: string) {
  const lab = new THREE.MeshStandardMaterial({ map: labelTexture(text), roughness: 0.6, transparent: false });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.03, radius + 0.03, 1.3, 32, 1, true, -0.32, 0.64), lab);
  m.position.set(0, lift, 0);
  m.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  return m;
}

export function buildOutpost(models: OutpostModels): Outpost {
  initTextures();
  const group = new THREE.Group();
  group.name = 'outpost';
  const colliders: ColliderSpec[] = [];
  const interactables: Interactable[] = [];
  const blinkers: Outpost['blinkers'] = [];
  const sensorLights: THREE.Mesh[] = [];
  const by = padHeight('base');
  const bx = LAYOUT.base.x;
  const bz = LAYOUT.base.z;

  const place = (obj: THREE.Object3D, x: number, z: number, ry = 0, y?: number) => {
    obj.position.set(x, y ?? heightAt(x, z), z);
    obj.rotation.y = ry;
    group.add(obj);
    return obj;
  };

  // Habitat (along X) + node + lab (along Z)
  const hab = { group: instance(models.hab_module), lift: 3.0 };
  const habLabel = moduleLabel(2.1, 3.0, 'HAB-1');
  habLabel.position.x = 0.9;
  hab.group.add(habLabel);
  place(hab.group, bx, bz, 0, by);
  colliders.push({ kind: 'box', center: new THREE.Vector3(bx, by + hab.lift, bz), half: new THREE.Vector3(5.2, 2.15, 2.2) });

  // The node's third port faces north toward the lab.
  const node = instance(models.node_module);
  place(node, bx + 6.4, bz, Math.PI, by);
  colliders.push({ kind: 'ball', center: new THREE.Vector3(bx + 6.4, by + hab.lift, bz), radius: 2.1 });

  const lab = { group: instance(models.lab_module), lift: 2.8 };
  const labLabel = moduleLabel(1.9, 2.8, 'LAB-1');
  labLabel.position.x = -1.2;
  lab.group.add(labLabel);
  place(lab.group, bx + 6.4, bz - 6.9, Math.PI / 2, by);
  colliders.push({ kind: 'box', center: new THREE.Vector3(bx + 6.4, by + lab.lift, bz - 6.6), half: new THREE.Vector3(2.0, 2.0, 4.8) });

  const lock = airlock(2.1);
  place(lock.group, bx - 4.6, bz, 0, by);
  colliders.push({ kind: 'box', center: new THREE.Vector3(bx - 6.0, by + 2.1, bz), half: new THREE.Vector3(1.3, 1.3, 1.3) });
  blinkers.push({ mesh: lock.light, period: 1.2, phase: 0 });
  interactables.push({ id: 'airlock', object: lock.hatch, label: () => 'p.airlock' });

  // Regolith berm: a radiation-shielding mound of piled-up regolith on the habitat's north side.
  const berm = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.2, 2.6, 24, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1 }));
  berm.scale.set(1, 1, 0.6);
  berm.rotation.set(0, Math.PI / 2, 0);
  berm.position.set(bx, by + 1.2, bz - 3.6);
  berm.scale.set(3.4, 1, 0.8);
  berm.castShadow = berm.receiveShadow = true;
  group.add(berm);

  // Oxygen station
  const o2 = o2Station();
  place(o2.group, bx + 0.5, bz + 7.5, 0, by);
  colliders.push({ kind: 'box', center: new THREE.Vector3(bx + 0.5, by + 1.2, bz + 7.5), half: new THREE.Vector3(2.2, 1.2, 1.2) });
  interactables.push({ id: 'o2', object: o2.panel, label: () => 'p.o2refill' });

  // Power area: the power distribution unit (PDU), its battery bank, terminal and main switch.
  const pduX = bx + 15;
  const pduZ = bz - 9;
  const pduYaw = 0.3;
  const pduQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pduYaw, 0));
  const pduFrame = new THREE.Group();
  place(pduFrame, pduX, pduZ, pduYaw, by);
  pduFrame.updateMatrixWorld();
  const local = (x: number, y: number, z: number) => pduFrame.localToWorld(new THREE.Vector3(x, y, z));
  const pdu = instance(models.power_unit);
  pduFrame.add(pdu);
  colliders.push({ kind: 'box', center: local(0, 1.4, 0), half: new THREE.Vector3(1.4, 1.4, 1.0), quat: pduQuat });

  const bank = instance(models.battery_bank);
  bank.position.set(-0.4, 0, -2.95);
  bank.rotation.y = -Math.PI / 2;
  pduFrame.add(bank);
  colliders.push({ kind: 'box', center: local(-0.4, 1.0, -2.95), half: new THREE.Vector3(0.85, 1.0, 1.95), quat: pduQuat });
  const gaugeBack = new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.6 });
  const gauges: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    // The bank's front faces -X in the PDU frame; its cabinets run along Z.
    const z = -2.95 + 1.35 - i * 0.9 - 0.18;
    mesh(new THREE.PlaneGeometry(0.1, 0.62), gaugeBack, pduFrame, [-1.105, 1.0, z], [0, -Math.PI / 2, 0]).castShadow = false;
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.58).translate(0, 0.29, 0), mats.red);
    bar.position.set(-1.11, 0.71, z);
    bar.rotation.y = -Math.PI / 2;
    pduFrame.add(bar);
    gauges.push(bar);
  }

  // Power terminal on a post at the west end, facing the habitat
  strut(new THREE.Vector3(-2.15, 0, 0.55), new THREE.Vector3(-2.15, 1.2, 0.55), 0.06, mats.alu, pduFrame);
  const pwTerm = mesh(new RoundedBoxGeometry(0.1, 0.55, 0.8, 2, 0.03), mats.dark, pduFrame, [-2.2, 1.42, 0.55], [0, 0, -0.5]);
  const pwScreen = mesh(new THREE.PlaneGeometry(0.66, 0.42), mats.cyan, pduFrame, [-2.26, 1.45, 0.55]);
  pwScreen.rotation.set(0, -Math.PI / 2, 0);
  pwScreen.rotateX(-0.5);
  pwScreen.castShadow = false;
  interactables.push({ id: 'pw-terminal', object: pwTerm, label: () => 'p.pwTerminal' });
  colliders.push({ kind: 'cylinder', center: local(-2.15, 0.7, 0.55), halfHeight: 0.7, radius: 0.25 });

  // Main power switch: a breaker box on the PDU's west end with a big lever
  const busBox = mesh(new RoundedBoxGeometry(0.22, 0.7, 0.6, 2, 0.03), mats.white, pduFrame, [-1.42, 1.05, -0.3]);
  mesh(new THREE.BoxGeometry(0.02, 0.1, 0.62), mats.hazard, pduFrame, [-1.535, 1.32, -0.3]);
  const leverPivot = new THREE.Group();
  leverPivot.position.set(-1.56, 1.0, -0.3);
  pduFrame.add(leverPivot);
  mesh(new THREE.BoxGeometry(0.05, 0.38, 0.05), mats.red, leverPivot, [-0.02, 0.17, 0]);
  mesh(new THREE.BoxGeometry(0.09, 0.07, 0.22), mats.dark, leverPivot, [-0.03, 0.37, 0]);
  leverPivot.rotation.z = 0.9; // tilted out = OFF; swings down when connected
  const busLight = mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.red, pduFrame, [-1.54, 1.32, 0.05]);
  interactables.push({ id: 'pw-bus', object: busBox, label: () => 'p.busOff' });

  // Vertical solar towers on higher ground to the east, control boxes facing the PDU
  const arrays: VsatRig[] = [];
  for (const [x, z] of [[32, -38], [44, -26], [26, -52]]) {
    const v = vsat(12);
    const yaw = Math.atan2(pduX - x, pduZ - z);
    place(v.group, x, z, yaw);
    const fy = heightAt(x, z);
    colliders.push({ kind: 'cylinder', center: new THREE.Vector3(x, fy + 6, z), halfHeight: 6, radius: 0.5 });
    const bq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    colliders.push({ kind: 'box', center: new THREE.Vector3(0, 0.7, 1.55).applyQuaternion(bq).add(new THREE.Vector3(x, fy, z)), half: new THREE.Vector3(0.32, 0.7, 0.14), quat: bq });
    blinkers.push({ mesh: v.beacon, period: 2.0, phase: x * 0.1 });
    const i = arrays.length;
    v.box.name = 'vsat-' + i;
    interactables.push({ id: 'vsat-' + i, object: v.box, label: () => 'p.vsat' });
    arrays.push({ group: v.group, pos: new THREE.Vector3(x, fy, z), upper: v.upper, head: v.head, wings: v.wings, light: v.light, box: v.box, stowedY: v.stowedY, deployedY: v.deployedY, height: 12 });
    // Power cable from the tower to the PDU
    const pts: THREE.Vector3[] = [];
    const end = local(1.3, 0, 0.3);
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const px = THREE.MathUtils.lerp(x, end.x, t);
      const pz = THREE.MathUtils.lerp(z, end.z, t);
      pts.push(new THREE.Vector3(px, heightAt(px, pz) + 0.06, pz));
    }
    tube(pts, 0.05, mats.rubber, group).castShadow = false;
  }
  // Main feed from the PDU to the habitat node
  {
    const pts: THREE.Vector3[] = [];
    const a = local(-1.3, 0, 0.4);
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const px = THREE.MathUtils.lerp(a.x, bx + 6.4, t);
      const pz = THREE.MathUtils.lerp(a.z, bz - 2, t);
      pts.push(new THREE.Vector3(px, heightAt(px, pz) + 0.06, pz));
    }
    tube(pts, 0.07, mats.rubber, group).castShadow = false;
  }

  // Antenna
  const ant = antenna();
  place(ant, -24, -34);
  colliders.push({ kind: 'box', center: new THREE.Vector3(-24, heightAt(-24, -34) + 4, -34), half: new THREE.Vector3(0.9, 4, 0.9) });

  // Beacon mast over the habitat: the navigation target for Mission 1
  strut(new THREE.Vector3(bx + 2.5, by + 4, bz), new THREE.Vector3(bx + 2.5, by + 9, bz), 0.05, mats.alu, group);
  const beacon = mesh(new THREE.SphereGeometry(0.22, 16, 12), mats.green, group, [bx + 2.5, by + 9.2, bz]);
  blinkers.push({ mesh: beacon, period: 1.0, phase: 0.3 });

  // Parked surface rover, the power unit and floodlight masts around the work area
  const rover = instance(models.rover);
  place(rover, bx - 9, bz + 12, -0.5, by);
  // (The rover's collider is a moving body made in main.ts, because it can be driven.)
  let roverMesh: THREE.Object3D = rover;
  rover.traverse((c) => {
    if ((c as THREE.Mesh).isMesh && roverMesh === rover) roverMesh = c;
  });
  interactables.push({ id: 'rover', object: roverMesh, label: () => 'p.rover', minMission: 7 });

  const floodSpots: { pos: THREE.Vector3; target: THREE.Vector3 }[] = [];
  for (const [x, z] of [[-14, -8], [10, 14], [20, -22]]) {
    const fl = instance(models.floodlight);
    const fx = bx + x;
    const fz = bz + z;
    const fy = heightAt(fx, fz);
    // aim the light heads at the habitat
    place(fl, fx, fz, Math.atan2(-(bz - fz), bx - fx) , fy);
    colliders.push({ kind: 'cylinder', center: new THREE.Vector3(fx, fy + 3, fz), halfHeight: 3, radius: 0.3 });
    floodSpots.push({ pos: new THREE.Vector3(fx, fy + 5.9, fz), target: new THREE.Vector3(bx, by + 1, bz) });
  }

  // Crates near the habitat
  for (const [x, z, r, w, h, d] of [
    [-4.6, 7, 0.2, 1.2, 0.9, 0.9],
    [-3.2, 7.6, -0.1, 0.9, 0.7, 0.9],
    [-4.0, 7.4, 0.5, 0.8, 0.6, 0.6],
    [13.6, 7.5, 0.3, 1.6, 1.0, 1.0],
  ]) {
    place(crate(w, h, d), bx + x, bz + z, r, by);
    colliders.push({ kind: 'box', center: new THREE.Vector3(bx + x, by + h / 2, bz + z), half: new THREE.Vector3(w / 2, h / 2, d / 2), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)) });
  }

  // Landing site with the lander the crew arrived in
  const ly = padHeight('lander');
  const lpad = new THREE.Mesh(new THREE.RingGeometry(9.35, 9.6, 96), mats.hazard);
  lpad.rotation.x = -Math.PI / 2;
  lpad.position.set(LAYOUT.lander.x, ly + 0.03, LAYOUT.lander.z);
  group.add(lpad);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const mk = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), mats.hazard);
    mk.rotation.set(-Math.PI / 2, 0, a);
    mk.position.set(LAYOUT.lander.x + Math.cos(a) * 11, ly + 0.03, LAYOUT.lander.z + Math.sin(a) * 11);
    group.add(mk);
  }
  const landerObj = place(lander(), LAYOUT.lander.x, LAYOUT.lander.z, 0, ly);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = LAYOUT.lander.x + Math.cos(a) * 10.2;
    const pz = LAYOUT.lander.z + Math.sin(a) * 10.2;
    const py = heightAt(px, pz);
    mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.35, 10), mats.dark, group, [px, py + 0.17, pz]);
    const bulb = mesh(new THREE.SphereGeometry(0.09, 10, 8), mats.amber, group, [px, py + 0.4, pz]);
    blinkers.push({ mesh: bulb, period: 2.4, phase: i * 0.3 });
  }
  colliders.push({ kind: 'cylinder', center: new THREE.Vector3(LAYOUT.lander.x, ly + 2.6, LAYOUT.lander.z), halfHeight: 2.0, radius: 2.3 });

  // Environment sensors for the Mission 1 inspection
  LAYOUT.sensors.forEach((s, i) => {
    const st = sensorStation(i);
    place(st.group, s.x, s.z, i * 1.3);
    st.box.name = 'sensor-' + i;
    sensorLights.push(st.light);
    colliders.push({ kind: 'cylinder', center: new THREE.Vector3(s.x, heightAt(s.x, s.z) + 0.8, s.z), halfHeight: 0.8, radius: 0.35 });
    interactables.push({ id: 'sensor-' + i, object: st.box, label: () => 'p.scan' });
  });

  // Life Support unit east of the node
  const ls = lifeSupportUnit();
  const lx = bx + 13;
  const lz = bz + 2.5;
  place(ls.group, lx, lz, 0, by);
  colliders.push({ kind: 'box', center: new THREE.Vector3(lx, by + 1.05, lz - 0.1), half: new THREE.Vector3(2.45, 1.05, 1.35) });
  interactables.push({ id: 'ls-terminal', object: ls.term, label: () => 'p.terminal' });
  interactables.push({ id: 'ls-filter', object: ls.filter, label: () => 'p.filterInspect' });

  // ---------- Build pad H-2: inflatable habitat on the node's south port ----------
  const hx = bx + 6.4;
  const hy = by + 3.0; // module axis height, level with the node's ports
  const portZ = bz + 2.35;
  const shellLen = 8;
  // Spare docking port on the node, covered until a module is attached
  mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.7, 40), mats.alu, group, [hx, hy, bz + 2.0], [Math.PI / 2, 0, 0]);
  mesh(new THREE.TorusGeometry(1.12, 0.07, 8, 48), mats.dark, group, [hx, hy, portZ]);
  const cover = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 40), mats.white, group, [hx, hy, portZ + 0.03], [Math.PI / 2, 0, 0]);
  // Flexible connecting tunnel (grows out of the port)
  const tunnel = new THREE.Group();
  tunnel.position.set(hx, hy, portZ);
  group.add(tunnel);
  const tunnelLen = bz + 4.0 - portZ;
  mesh(new THREE.CylinderGeometry(0.95, 0.95, tunnelLen, 32, 1, true), mats.shell, tunnel, [0, 0, tunnelLen / 2], [Math.PI / 2, 0, 0]);
  for (let k = 0; k <= 6; k++) mesh(new THREE.TorusGeometry(0.97, 0.035, 6, 32), mats.strapDark, tunnel, [0, 0, (k / 6) * tunnelLen]);
  tunnel.scale.z = 0.001;
  // Inflatable shell, pivoting on its north end so it grows away from the node
  const shell = new THREE.Group();
  shell.position.set(hx, hy, bz + 4.0);
  group.add(shell);
  const shellModel = instance(models.inflatable_hab);
  shellModel.rotation.y = -Math.PI / 2;
  shellModel.position.z = shellLen / 2;
  shell.add(shellModel);
  let glass: THREE.MeshStandardMaterial | null = null;
  shellModel.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const mats_ = Array.isArray(m.material) ? m.material : [m.material];
    mats_.forEach((mt, i) => {
      if ((mt as THREE.MeshStandardMaterial).name === 'Glass') {
        glass = (mt as THREE.MeshStandardMaterial).clone();
        glass.emissiveIntensity = 0;
        if (Array.isArray(m.material)) m.material[i] = glass;
        else m.material = glass;
      }
    });
  });
  const packed = { r: 0.48, l: 0.33 };
  shell.scale.set(packed.r, packed.r, packed.l);
  // Launch restraint bands around the packed module
  const bands: THREE.Object3D[] = [];
  for (const z of [0.5, 1.3, 2.1]) bands.push(mesh(new THREE.TorusGeometry(1.2, 0.05, 6, 40), mats.hazard, group, [hx, hy, bz + 4.0 + z]));
  // Pedestal under the packed module and saddles under the inflated one
  mesh(new THREE.CylinderGeometry(0.35, 0.6, hy - by - 1.1, 12), mats.dark, group, [hx, by + (hy - by - 1.1) / 2, bz + 5.3]);
  for (const z of [5.6, 10.2]) {
    mesh(new THREE.BoxGeometry(3.4, 0.14, 0.3), mats.alu, group, [hx, by + 0.62, bz + z]);
    for (const sx of [-1.5, 1.5]) mesh(new THREE.BoxGeometry(0.16, 0.62, 0.3), mats.alu, group, [hx + sx, by + 0.31, bz + z]);
  }
  // Pad outline with hazard stripes and a painted label
  for (const [cx, cz, w, d] of [[hx, bz + 3.4, 6.4, 0.25], [hx, bz + 12.8, 6.4, 0.25], [hx - 3.1, bz + 8.1, 0.25, 9.4], [hx + 3.1, bz + 8.1, 0.25, 9.4]]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mats.hazard);
    stripe.position.set(cx, by + 0.02, cz);
    stripe.receiveShadow = true;
    group.add(stripe);
  }
  const padLabel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: labelTexture('PAD H-2', '#2a2d31', '#f2b81c'), roughness: 0.9 }));
  padLabel.rotation.x = -Math.PI / 2;
  padLabel.position.set(hx + 1.4, by + 0.03, bz + 12.2);
  group.add(padLabel);
  // Inflation control box on a post, with a hose up to the module
  const vx = hx - 2.6;
  const vz = bz + 5.6;
  strut(new THREE.Vector3(vx, by, vz), new THREE.Vector3(vx, by + 1.0, vz), 0.05, mats.alu, group);
  const valve = mesh(new RoundedBoxGeometry(0.5, 0.45, 0.3, 2, 0.04), mats.white, group, [vx, by + 1.2, vz]);
  mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 20), mats.red, group, [vx - 0.17, by + 1.2, vz], [0, Math.PI / 2, 0]);
  const valveLight = mesh(new THREE.SphereGeometry(0.045, 10, 8), mats.amber, group, [vx, by + 1.48, vz]);
  tube([new THREE.Vector3(vx + 0.2, by + 1.1, vz), new THREE.Vector3(vx + 0.9, by + 0.3, vz), new THREE.Vector3(hx - 1.0, by + 1.0, vz)], 0.04, mats.rubber, group);
  interactables.push({ id: 'hab2-valve', object: valve, label: () => 'p.valve', minMission: 4 });
  colliders.push({ kind: 'cylinder', center: new THREE.Vector3(vx, by + 0.7, vz), halfHeight: 0.7, radius: 0.3 });
  // Habitat terminal beside the tunnel, and the construction terminal at the pad's corner
  const terminalPost = (x: number, z: number, id: string, label: string) => {
    strut(new THREE.Vector3(x, by, z), new THREE.Vector3(x, by + 1.2, z), 0.06, mats.alu, group);
    const t = mesh(new RoundedBoxGeometry(0.1, 0.55, 0.8, 2, 0.03), mats.dark, group, [x - 0.05, by + 1.42, z], [0, 0, -0.5]);
    const scr = mesh(new THREE.PlaneGeometry(0.66, 0.42), mats.cyan, group, [x - 0.11, by + 1.45, z]);
    scr.rotation.set(0, -Math.PI / 2, 0);
    scr.rotateX(-0.5);
    scr.castShadow = false;
    interactables.push({ id, object: t, label: () => label, minMission: 4 });
    colliders.push({ kind: 'cylinder', center: new THREE.Vector3(x, by + 0.7, z), halfHeight: 0.7, radius: 0.25 });
    return new THREE.Vector3(x - 0.11, by + 1.45, z);
  };
  const habTermPos = terminalPost(hx - 1.8, bz + 3.1, 'hab2-terminal', 'p.habTerminal');
  const buildTermPos = terminalPost(bx + 2.2, bz + 5.0, 'build-terminal', 'p.buildTerminal');
  const hab2: Hab2Rig = {
    tunnel,
    shell,
    cover,
    bands,
    glass,
    valveLight,
    valvePos: new THREE.Vector3(vx, by + 1.2, vz),
    terminalPos: habTermPos,
    buildTerminalPos: buildTermPos,
    center: new THREE.Vector3(hx, by, bz + 8),
    packedCollider: { kind: 'box', center: new THREE.Vector3(hx, by + 2.0, bz + 5.3), half: new THREE.Vector3(1.25, 2.0, 1.4) },
    // A horizontal cylinder along the module (Rapier cylinders stand on Y, so tip it onto Z).
    fullCollider: { kind: 'cylinder', center: new THREE.Vector3(hx, hy, bz + 8.0), halfHeight: 4.0, radius: 2.35, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) },
    packed,
  };
  for (const z of [5.6, 10.2]) colliders.push({ kind: 'box', center: new THREE.Vector3(hx, by + 0.31, bz + z), half: new THREE.Vector3(1.7, 0.31, 0.15) });

  // ---------- Pad G-1: greenhouse on the lab's north hatch ----------
  const gx = bx + 6.4;
  const gy = by + 2.8; // level with the lab's ports
  const labPortZ = bz - 11.5;
  const ghSouthZ = bz - 13.0;
  const ghLen = 7.6;
  const ghTunnel = new THREE.Group();
  ghTunnel.position.set(gx, gy, labPortZ);
  group.add(ghTunnel);
  const ghTunnelLen = labPortZ - ghSouthZ;
  mesh(new THREE.CylinderGeometry(0.85, 0.85, ghTunnelLen, 32, 1, true), mats.shell, ghTunnel, [0, 0, -ghTunnelLen / 2], [Math.PI / 2, 0, 0]);
  for (let k = 0; k <= 5; k++) mesh(new THREE.TorusGeometry(0.87, 0.035, 6, 32), mats.strapDark, ghTunnel, [0, 0, -(k / 5) * ghTunnelLen]);
  const ghBody = new THREE.Group();
  ghBody.position.set(gx, gy, ghSouthZ);
  group.add(ghBody);
  const ghModel = instance(models.greenhouse);
  ghModel.rotation.y = Math.PI / 2; // model axis X -> world -Z (north)
  ghModel.position.z = -ghLen / 2;
  ghBody.add(ghModel);
  let ghGlass: THREE.MeshStandardMaterial | null = null;
  ghModel.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    list.forEach((mt, i) => {
      if ((mt as THREE.MeshStandardMaterial).name === 'GrowGlass') {
        ghGlass = (mt as THREE.MeshStandardMaterial).clone();
        ghGlass.emissiveIntensity = 0;
        if (Array.isArray(m.material)) m.material[i] = ghGlass;
        else m.material = ghGlass;
      }
    });
  });
  // Cradle under the greenhouse
  const cradle: THREE.Object3D[] = [];
  for (const z of [-1.6, -6.0]) {
    cradle.push(mesh(new THREE.BoxGeometry(3.0, 0.14, 0.3), mats.alu, group, [gx, by + 0.86, ghSouthZ + z]));
    for (const sx of [-1.3, 1.3]) cradle.push(mesh(new THREE.BoxGeometry(0.16, 0.86, 0.3), mats.alu, group, [gx + sx, by + 0.43, ghSouthZ + z]));
  }
  // Harvest hatch on the west wall, and the greenhouse terminal beside it
  const hatchZ = ghSouthZ - 4.6;
  const hatch = mesh(new RoundedBoxGeometry(0.12, 0.6, 0.7, 2, 0.03), mats.white, group, [gx - 1.43, by + 1.55, hatchZ]);
  const hatchParts: THREE.Object3D[] = [
    hatch,
    mesh(new THREE.BoxGeometry(0.05, 0.06, 0.4), mats.dark, group, [gx - 1.5, by + 1.4, hatchZ]),
    mesh(new THREE.BoxGeometry(0.03, 0.62, 0.05), mats.hazard, group, [gx - 1.5, by + 1.55, hatchZ + 0.38]),
  ];
  interactables.push({ id: 'gh-hatch', object: hatch, label: () => 'p.ghHatch', minMission: 5 });
  const ghTermPos = terminalPost(gx - 2.9, ghSouthZ - 1.8, 'gh-terminal', 'p.ghTerminal');
  interactables[interactables.length - 1].minMission = 5;
  const greenhouseRig: GreenhouseRig = {
    body: ghBody,
    tunnel: ghTunnel,
    glass: ghGlass,
    cradle,
    hatchParts,
    terminalPos: ghTermPos,
    hatchPos: new THREE.Vector3(gx - 1.45, by + 1.55, hatchZ),
    center: new THREE.Vector3(gx, by, ghSouthZ - ghLen / 2),
    collider: { kind: 'cylinder', center: new THREE.Vector3(gx, gy, ghSouthZ - ghLen / 2), halfHeight: ghLen / 2, radius: 1.95, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) },
  };

  // ---------- Mission 6: radiation monitor, survey points, regolith berms ----------
  const monX = bx - 12.5;
  const monZ = bz + 1;
  const monY = heightAt(monX, monZ);
  strut(new THREE.Vector3(monX, monY, monZ), new THREE.Vector3(monX, monY + 2.4, monZ), 0.05, mats.alu, group);
  mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.white, group, [monX, monY + 2.45, monZ]);
  mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 20), mats.dark, group, [monX, monY + 2.4, monZ]);
  const monBox = mesh(new RoundedBoxGeometry(0.3, 0.5, 0.62, 2, 0.04), mats.white, group, [monX, monY + 1.3, monZ]);
  mesh(new THREE.PlaneGeometry(0.46, 0.3), mats.amber, group, [monX + 0.16, monY + 1.32, monZ], [0, Math.PI / 2, 0]).castShadow = false;
  mesh(new THREE.BoxGeometry(0.06, 0.06, 0.52), mats.hazard, group, [monX, monY + 1.6, monZ]);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    strut(new THREE.Vector3(monX, monY + 0.9, monZ), new THREE.Vector3(monX + Math.cos(a) * 0.7, monY + 0.02, monZ + Math.sin(a) * 0.7), 0.025, mats.alu, group);
  }
  interactables.push({ id: 'rad-monitor', object: monBox, label: () => 'p.radMonitor', minMission: 6 });
  colliders.push({ kind: 'cylinder', center: new THREE.Vector3(monX, monY + 0.8, monZ), halfHeight: 0.8, radius: 0.3 });

  const surveyPoint = (id: 'hab1' | 'hab2' | 'gh', x: number, z: number) => {
    const g = new THREE.Group();
    const y = heightAt(x, z);
    g.position.set(x, y, z);
    group.add(g);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      strut(new THREE.Vector3(0, 0.75, 0), new THREE.Vector3(Math.cos(a) * 0.35, 0.01, Math.sin(a) * 0.35), 0.018, mats.alu, g);
    }
    const head = mesh(new RoundedBoxGeometry(0.34, 0.24, 0.24, 2, 0.03), mats.white, g, [0, 0.9, 0]);
    const light = mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.cyan, g, [0, 1.08, 0]);
    interactables.push({ id: 'survey-' + id, object: head, label: () => 'p.survey', minMission: 6 });
    return { group: g, light, pos: new THREE.Vector3(x, y + 0.9, z) };
  };
  const survey = {
    hab1: surveyPoint('hab1', bx - 1.5, bz + 3.3),
    hab2: surveyPoint('hab2', hx + 3.5, bz + 8.5),
    gh: surveyPoint('gh', bx + 3.0, bz - 20.0),
  };

  // Regolith berms: half-tubes of piled regolith that rise as the mover works.
  const bermMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1 });
  const makeBerm = (id: 'west' | 'east' | 'south', x: number, z: number, len: number, alongZ: boolean, mx: number, mz: number) => {
    const geo = new THREE.CylinderGeometry(1.7, 1.7, len, 28, 1, false, 0, Math.PI);
    geo.rotateZ(Math.PI / 2);
    if (alongZ) geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, bermMat);
    m.position.set(x, by, z);
    m.scale.y = 0.02;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    const marker = new THREE.Group();
    const my = heightAt(mx, mz);
    marker.position.set(mx, my, mz);
    group.add(marker);
    strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.0, 0), 0.04, mats.alu, marker);
    const box = mesh(new RoundedBoxGeometry(0.4, 0.34, 0.26, 2, 0.03), mats.hazard, marker, [0, 1.15, 0]);
    const light = mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.amber, marker, [0, 1.38, 0]);
    interactables.push({ id: 'berm-' + id, object: box, label: () => 'p.berm', minMission: 6 });
    const half = alongZ ? new THREE.Vector3(1.6, 1.0, len / 2) : new THREE.Vector3(len / 2, 1.0, 1.6);
    return { mesh: m, marker, light, pos: new THREE.Vector3(mx, my + 1.15, mz), collider: { kind: 'box', center: new THREE.Vector3(x, by + 1.0, z), half } as ColliderSpec };
  };
  const radiationRig: RadiationRig = {
    monitorPos: new THREE.Vector3(monX, monY + 1.3, monZ),
    survey,
    berms: {
      west: makeBerm('west', hx - 3.7, bz + 9.2, 5.6, true, hx - 6.0, bz + 9.2),
      east: makeBerm('east', hx + 3.7, bz + 8.5, 7.0, true, hx + 6.0, bz + 8.5),
      south: makeBerm('south', hx - 0.4, bz + 13.7, 4.8, false, hx - 0.4, bz + 16.0),
    },
  };

  // ---------- Mission 7: science site markers and the lab's sample port ----------
  const sites = LAYOUT.sites.map((st, i) => {
    const g = new THREE.Group();
    const y = heightAt(st.x, st.z);
    g.position.set(st.x, y, st.z);
    group.add(g);
    // A tall orange flag you can see from the rover, and a sampling stake with a light.
    strut(new THREE.Vector3(0.8, 0, 0.6), new THREE.Vector3(0.8, 3.2, 0.6), 0.025, mats.alu, g);
    mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x401800, side: THREE.DoubleSide, roughness: 0.7 }), g, [1.15, 2.95, 0.6]);
    strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.9, 0), 0.03, mats.alu, g);
    const box = mesh(new RoundedBoxGeometry(0.42, 0.3, 0.3, 2, 0.03), mats.white, g, [0, 1.0, 0]);
    mesh(new THREE.BoxGeometry(0.43, 0.06, 0.31), mats.hazard, g, [0, 1.1, 0]);
    const light = mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.amber, g, [0, 1.22, 0]);
    interactables.push({ id: 'site-' + i, object: box, label: () => 'p.site', minMission: 7 });
    return { marker: g, light, pos: new THREE.Vector3(st.x, y + 1.0, st.z) };
  });
  const samplePortX = bx + 6.4 - 1.3;
  const samplePortZ = bz - 6.9;
  const port = mesh(new RoundedBoxGeometry(0.16, 0.6, 0.7, 2, 0.03), mats.white, group, [samplePortX, by + 1.45, samplePortZ]);
  mesh(new THREE.PlaneGeometry(0.5, 0.3), mats.cyan, group, [samplePortX - 0.085, by + 1.5, samplePortZ], [0, -Math.PI / 2, 0]).castShadow = false;
  mesh(new THREE.BoxGeometry(0.04, 0.08, 0.72), mats.hazard, group, [samplePortX - 0.09, by + 1.2, samplePortZ]);
  interactables.push({ id: 'lab-port', object: port, label: () => 'p.labPort', minMission: 7 });

  // ---------- Mission 8: tower damage, HAB-2 leak-check fittings, cooling radiator + pumps ----------
  const towerDamage = [1, 2].map((ti, k) => {
    const wing = arrays[ti].wings[k];
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.8),
      new THREE.MeshStandardMaterial({ map: damageTexture(7 + ti * 31), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.position.set(k ? 0.3 : -0.25, -2.2 - k * 1.4, 0.035);
    m.castShadow = false;
    m.visible = false;
    wing.add(m);
    return m;
  });
  const fittingMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.6 });
  const patchMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.95 });
  const leakSpots: { pos: THREE.Vector3; n: THREE.Vector3 }[] = [
    // tunnel seal (east side), inflation-line fitting (west), lower shell seam (east)
    { pos: new THREE.Vector3(hx + 0.81, by + 2.5, bz + 3.2), n: new THREE.Vector3(0.81, -0.5, 0) },
    { pos: new THREE.Vector3(hx - 1.81, by + 1.5, bz + 5.6), n: new THREE.Vector3(-1.81, -1.5, 0) },
    { pos: new THREE.Vector3(hx + 1.81, by + 1.5, bz + 4.6), n: new THREE.Vector3(1.81, -1.5, 0) },
  ];
  const leaks: THREE.Vector3[] = [];
  const patches: THREE.Mesh[] = [];
  const fittings = new THREE.Group();
  group.add(fittings);
  leakSpots.forEach(({ pos, n }, i) => {
    n.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const base = pos.clone().addScaledVector(n, 0.05);
    const f = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 16), fittingMat, fittings, [base.x, base.y, base.z]);
    f.quaternion.copy(q);
    const ring = mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 20), mats.hazard, fittings, [base.x, base.y, base.z]);
    ring.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    const capPos = pos.clone().addScaledVector(n, 0.11);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6), mats.alu, fittings, [capPos.x, capPos.y, capPos.z]).quaternion.copy(q);
    const pp = pos.clone().addScaledVector(n, 0.03);
    const pm = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 20), patchMat, fittings, [pp.x, pp.y, pp.z]);
    pm.quaternion.copy(q);
    pm.visible = false;
    patches.push(pm);
    leaks.push(pos.clone().addScaledVector(n, 0.1));
    interactables.push({ id: 'leak-' + i, object: f, label: () => 'p.fitting', minMission: 8 });
  });

  // Cooling radiator east of the life-support unit. The panels stand edge-on to the low
  // Sun, so they see mostly cold sky and can throw the habitat's heat away as infrared.
  const rx = bx + 20.5;
  const rz = bz + 2.5;
  const ry = heightAt(rx, rz);
  const radGroup = new THREE.Group();
  place(radGroup, rx, rz, Math.atan2(-SUN_DIR.z, SUN_DIR.x), ry);
  const radMat = new THREE.MeshStandardMaterial({ map: radiatorTexture(), roughness: 0.45, metalness: 0.05 });
  mesh(new THREE.BoxGeometry(1.6, 0.22, 4.4), mats.dark, radGroup, [0, 0.11, 0]);
  for (const z of [-1.5, 0, 1.5]) {
    mesh(new THREE.BoxGeometry(0.05, 2.7, 1.25), radMat, radGroup, [0, 1.65, z]);
    strut(new THREE.Vector3(0, 0.22, z - 0.6), new THREE.Vector3(0, 3.0, z - 0.6), 0.03, mats.alu, radGroup);
    strut(new THREE.Vector3(0, 0.22, z + 0.6), new THREE.Vector3(0, 3.0, z + 0.6), 0.03, mats.alu, radGroup);
  }
  // Supply (top) and return (bottom) manifolds
  strut(new THREE.Vector3(0, 3.02, -2.2), new THREE.Vector3(0, 3.02, 2.2), 0.06, mats.alu, radGroup);
  strut(new THREE.Vector3(0, 0.3, -2.2), new THREE.Vector3(0, 0.3, 2.2), 0.06, mats.alu, radGroup);
  strut(new THREE.Vector3(0, 0.3, 2.2), new THREE.Vector3(0, 3.02, 2.2), 0.06, mats.alu, radGroup);
  colliders.push({ kind: 'box', center: new THREE.Vector3(rx, ry + 1.6, rz), half: new THREE.Vector3(0.8, 1.6, 2.2), quat: radGroup.quaternion.clone() });
  // Pump skid on the west side with pump A (running) and pump B (standby)
  const px = rx - 2.2;
  const pz = rz;
  const py = heightAt(px, pz);
  const skid = new THREE.Group();
  place(skid, px, pz, Math.PI / 2, py);
  mesh(new THREE.BoxGeometry(2.6, 0.18, 1.1), mats.dark, skid, [0, 0.09, 0]);
  const pumpUnit = (x: number, name: string) => {
    mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.7, 20), mats.white, skid, [x, 0.55, 0], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 16), mats.alu, skid, [x, 0.55, 0.32], [Math.PI / 2, 0, 0]);
    const rotor = new THREE.Group();
    rotor.position.set(x + 0.37, 0.55, 0);
    skid.add(rotor);
    const fan = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), mats.dark, rotor, [0, 0, 0], [0, 0, Math.PI / 2]);
    fan.castShadow = false;
    mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), mats.hazard, rotor, [0.03, 0, 0]);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshStandardMaterial({ map: labelTexture(name), roughness: 0.8 }));
    tag.position.set(x, 0.86, 0.01);
    tag.rotation.x = -Math.PI / 2;
    skid.add(tag);
    return rotor;
  };
  const rotorA = pumpUnit(-0.6, 'PUMP A');
  const rotorB = pumpUnit(0.6, 'PUMP B');
  // Coolant pipes from the skid to the radiator manifolds and to the life-support unit
  tube([new THREE.Vector3(px, py + 0.55, pz + 0.3), new THREE.Vector3(px + 1.2, py + 0.4, pz + 0.3), new THREE.Vector3(rx, ry + 0.3, rz + 0.3)], 0.05, mats.alu, group);
  tube([new THREE.Vector3(px, py + 0.55, pz - 0.3), new THREE.Vector3(px - 1.5, py + 0.12, pz - 0.6), new THREE.Vector3(lx + 2.5, by + 0.6, lz - 0.6)], 0.05, mats.rubber, group);
  // Control box on a post in front of pump A, with a light for each pump
  const cbx = px - 0.95;
  const cbz = pz + 0.6;
  strut(new THREE.Vector3(cbx, py, cbz), new THREE.Vector3(cbx, py + 1.0, cbz), 0.04, mats.alu, group);
  const pumpBox = mesh(new RoundedBoxGeometry(0.22, 0.5, 0.6, 2, 0.03), mats.white, group, [cbx, py + 1.2, cbz]);
  mesh(new THREE.PlaneGeometry(0.42, 0.28), mats.cyan, group, [cbx - 0.115, py + 1.22, cbz], [0, -Math.PI / 2, 0]).castShadow = false;
  const lightA = mesh(new THREE.SphereGeometry(0.045, 10, 8), mats.green, group, [cbx, py + 1.5, cbz - 0.16]);
  const lightB = mesh(new THREE.SphereGeometry(0.045, 10, 8), mats.amber, group, [cbx, py + 1.5, cbz + 0.16]);
  interactables.push({ id: 'pump-a', object: pumpBox, label: () => 'p.pump', minMission: 8 });
  colliders.push({ kind: 'box', center: new THREE.Vector3(px, py + 0.45, pz), half: new THREE.Vector3(0.6, 0.45, 1.35) });
  colliders.push({ kind: 'cylinder', center: new THREE.Vector3(cbx, py + 0.7, cbz), halfHeight: 0.7, radius: 0.25 });
  const emergencyRig: EmergencyRig = {
    towerDamage,
    leaks,
    patches,
    fittings,
    pumpPos: new THREE.Vector3(cbx - 0.1, py + 1.2, cbz),
    pumpLights: { a: lightA, b: lightB },
    rotors: { a: rotorA, b: rotorB },
  };

  // ---------- Mission 9: antenna and battery repair points, buildable facilities ----------
  const antBoxPos = new THREE.Vector3(-22.4, 0, -32.8);
  antBoxPos.y = heightAt(antBoxPos.x, antBoxPos.z);
  strut(antBoxPos.clone(), antBoxPos.clone().add(new THREE.Vector3(0, 1.0, 0)), 0.04, mats.alu, group);
  const antBox = mesh(new RoundedBoxGeometry(0.5, 0.42, 0.26, 2, 0.04), mats.white, group, [antBoxPos.x, antBoxPos.y + 1.2, antBoxPos.z]);
  antBox.rotation.y = Math.atan2(bx - antBoxPos.x, bz - antBoxPos.z);
  mesh(new THREE.SphereGeometry(0.045, 10, 8), mats.green, group, [antBoxPos.x, antBoxPos.y + 1.46, antBoxPos.z]);
  tube([antBoxPos.clone().add(new THREE.Vector3(0, 1.0, 0)), new THREE.Vector3(-23.2, antBoxPos.y + 0.1, -33.4), new THREE.Vector3(-24, antBoxPos.y + 0.5, -34)], 0.025, mats.rubber, group);
  interactables.push({ id: 'antenna-box', object: antBox, label: () => 'p.antenna', minMission: 9 });
  colliders.push({ kind: 'cylinder', center: antBoxPos.clone().add(new THREE.Vector3(0, 0.7, 0)), halfHeight: 0.7, radius: 0.25 });
  // The battery cabinets' doors (an invisible panel over them, so you can look at the bank)
  const cab = mesh(new THREE.BoxGeometry(0.04, 1.4, 3.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), pduFrame, [-1.16, 1.0, -2.95]);
  cab.castShadow = false;
  interactables.push({ id: 'battery-cab', object: cab, label: () => 'p.batteryCab', minMission: 9 });

  const facilities: SettlementRig['facilities'] = {};
  const site = (id: keyof SettlementRig['facilities'], x: number, z: number, ry: number, collider: ColliderSpec) => {
    const g = new THREE.Group();
    place(g, x, z, ry);
    g.visible = false;
    facilities[id] = { group: g, collider };
    return g;
  };
  // A fourth solar tower beside the others, already unrolled
  {
    const v = vsat(12);
    v.upper.position.y = v.deployedY;
    for (const w of v.wings) w.scale.y = 1;
    v.head.rotation.y = Math.atan2(SUN_DIR.x, SUN_DIR.z) - Math.atan2(pduX - 50, pduZ + 40);
    const g = site('solar', 50, -40, Math.atan2(pduX - 50, pduZ + 40), { kind: 'cylinder', center: new THREE.Vector3(50, heightAt(50, -40) + 6, -40), halfHeight: 6, radius: 0.5 });
    g.add(v.group);
    blinkers.push({ mesh: v.beacon, period: 2.0, phase: 1.3 });
  }
  // More battery cabinets lined up behind the first bank
  {
    const g = new THREE.Group();
    g.visible = false;
    pduFrame.add(g);
    const b2 = instance(models.battery_bank);
    b2.position.set(-0.4, 0, -6.95);
    b2.rotation.y = -Math.PI / 2;
    g.add(b2);
    facilities.battery = { group: g, collider: { kind: 'box', center: local(-0.4, 1.0, -6.95), half: new THREE.Vector3(0.85, 1.0, 1.95), quat: pduQuat } };
  }
  // Oxygen plant: a regolith hopper, a hot reactor and white oxygen tanks
  {
    const x = bx + 17;
    const z = bz + 10.5;
    const g = site('oxygen', x, z, 0.2, { kind: 'box', center: new THREE.Vector3(x, by + 1.2, z), half: new THREE.Vector3(2.2, 1.2, 1.4) });
    mesh(new THREE.BoxGeometry(4.2, 0.2, 2.4), mats.dark, g, [0, 0.1, 0]);
    for (const zz of [-0.7, 0, 0.7]) mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 18), mats.white, g, [-0.9, 0.55, zz], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 20), mats.alu, g, [1.0, 0.9, 0]);
    mesh(new THREE.CylinderGeometry(0.7, 0.25, 0.8, 20), mats.hazard, g, [1.0, 2.0, 0]);
    mesh(new THREE.SphereGeometry(0.07, 10, 8), mats.amber, g, [1.0, 1.65, 0.56]);
  }
  // Second water recycler next to the life-support unit
  {
    const x = bx + 17.5;
    const z = bz + 6.8;
    const g = site('water', x, z, Math.PI / 2, { kind: 'box', center: new THREE.Vector3(x, by + 1.0, z), half: new THREE.Vector3(1.1, 1.0, 1.5) });
    g.add(instance(models.power_unit));
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), new THREE.MeshStandardMaterial({ map: labelTexture('WATER-2'), roughness: 0.8 }));
    tag.position.set(0, 2.2, 1.02);
    g.add(tag);
  }
  // A second, bigger dish for a backup link
  {
    const g = site('comms', -17, -42, 0.6, { kind: 'box', center: new THREE.Vector3(-17, heightAt(-17, -42) + 4, -42), half: new THREE.Vector3(0.9, 4, 0.9) });
    g.add(antenna());
  }
  // Workshop: a rounded shed with a wide door
  {
    const x = bx - 19;
    const z = bz + 6;
    const g = site('workshop', x, z, Math.PI / 2, { kind: 'box', center: new THREE.Vector3(x, by + 1.3, z), half: new THREE.Vector3(1.8, 1.3, 2.6) });
    const shell = new THREE.CylinderGeometry(1.8, 1.8, 5, 24, 1, false, 0, Math.PI);
    shell.rotateZ(Math.PI / 2);
    shell.rotateY(Math.PI / 2);
    mesh(shell, mats.white, g, [0, 0, 0]);
    mesh(new THREE.BoxGeometry(2.0, 1.9, 0.08), mats.dark, g, [0, 0.95, 2.5]);
    mesh(new THREE.BoxGeometry(2.1, 0.1, 0.1), mats.hazard, g, [0, 1.95, 2.52]);
  }
  // Science hut: a short drum with a dome for instruments
  {
    const x = bx - 3;
    const z = bz + 19;
    const g = site('lab', x, z, 0, { kind: 'cylinder', center: new THREE.Vector3(x, by + 1.3, z), halfHeight: 1.3, radius: 1.7 });
    mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.8, 28), mats.white, g, [0, 0.9, 0]);
    mesh(new THREE.SphereGeometry(1.6, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.alu, g, [0, 1.8, 0]);
    mesh(new THREE.BoxGeometry(0.9, 1.5, 0.1), mats.dark, g, [0, 0.75, 1.6]);
  }
  // Extra shelter: a regolith-covered dome
  {
    const x = bx - 14;
    const z = bz + 19;
    const g = site('shelter', x, z, 0, { kind: 'ball', center: new THREE.Vector3(x, by, z), radius: 2.6 });
    const dome = mesh(new THREE.SphereGeometry(2.6, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1 }), g, [0, 0, 0]);
    dome.scale.y = 0.75;
    mesh(new THREE.BoxGeometry(1.0, 1.5, 1.2), mats.white, g, [0, 0.75, 2.3]);
  }
  const settlementRig: SettlementRig = {
    filterPos: ls.filter.getWorldPosition(new THREE.Vector3()),
    antennaPos: new THREE.Vector3(antBoxPos.x, antBoxPos.y + 1.2, antBoxPos.z),
    batteryPos: local(-1.2, 1.2, -2.95),
    facilities,
  };

  let floodLamp: THREE.MeshStandardMaterial | null = null;
  models.floodlight.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.name === 'Lamp') floodLamp = m;
  });

  return {
    group,
    colliders,
    arrays,
    floodLamp,
    hab2,
    greenhouse: greenhouseRig,
    radiation: radiationRig,
    rover,
    science: { sites, labPortPos: new THREE.Vector3(samplePortX - 0.1, by + 1.45, samplePortZ) },
    emergency: emergencyRig,
    settlement: settlementRig,
    power: {
      pos: new THREE.Vector3(pduX, by, pduZ),
      terminalPos: local(-2.26, 1.45, 0.55),
      busPos: local(-1.54, 1.1, -0.3),
      batteryPos: local(-1.2, 1.0, -2.95),
      batteryFront: new THREE.Vector3(-1, 0, 0).applyQuaternion(pduQuat),
      lever: leverPivot,
      busLight,
      gauges,
    },
    interactables,
    lifeSupport: { pos: new THREE.Vector3(lx, by, lz), lights: ls.lights },
    floodSpots,
    lander: landerObj,
    airlockLight: lock.light,
    blinkers,
    sensorLights,
    airlockPos: new THREE.Vector3(bx - 7.1, by, bz),
    o2StationPos: new THREE.Vector3(bx + 3.0, by, bz + 7.5),
    habitatPos: new THREE.Vector3(bx, by, bz),
  };
}

export const statusMaterials = { green: mats.green, amber: mats.amber, red: mats.red, cyan: mats.cyan };
