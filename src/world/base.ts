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

/** A horizontal pressurised module along its local X axis, standing on legs. */
function habitatModule(length: number, radius: number, label: string) {
  const g = new THREE.Group();
  const lift = radius + 0.9;
  const shell = mesh(new THREE.CylinderGeometry(radius, radius, length, 48, 1, true), mats.shell, g, [0, lift, 0], [0, 0, Math.PI / 2]);
  shell.name = 'shell';
  for (const s of [-1, 1]) {
    const cap = mesh(new THREE.SphereGeometry(radius, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.shell, g, [(s * length) / 2, lift, 0], [0, 0, -s * Math.PI / 2]);
    cap.scale.set(1, 0.32, 1);
  }
  // structural rings
  const ringGeo = new THREE.TorusGeometry(radius + 0.035, 0.055, 8, 64);
  for (let x = -length / 2 + 0.4; x <= length / 2 - 0.39; x += (length - 0.8) / 5) mesh(ringGeo, mats.alu, g, [x, lift, 0], [0, Math.PI / 2, 0]);
  // MLI foil belly band
  const belly = mesh(new THREE.CylinderGeometry(radius + 0.012, radius + 0.012, length * 0.86, 48, 1, true, Math.PI * 0.78, Math.PI * 0.44), mats.foil, g, [0, lift, 0], [0, 0, Math.PI / 2]);
  belly.castShadow = false;
  // windows on both sides
  const winGeo = new THREE.CircleGeometry(0.32, 32);
  const frameGeo = new THREE.TorusGeometry(0.34, 0.05, 8, 32);
  for (const side of [-1, 1])
    for (const x of [-length * 0.22, length * 0.22]) {
      const z = side * (radius + 0.01);
      mesh(winGeo, mats.glass, g, [x, lift + 0.25, z], [0, side > 0 ? 0 : Math.PI, 0]).castShadow = false;
      mesh(frameGeo, mats.dark, g, [x, lift + 0.25, z], [0, side > 0 ? 0 : Math.PI, 0]);
    }
  // label band
  const lab = new THREE.MeshStandardMaterial({ map: labelTexture(label), roughness: 0.6 });
  mesh(new THREE.CylinderGeometry(radius + 0.02, radius + 0.02, 1.4, 32, 1, true, -0.35, 0.7), lab, g, [length * 0.05, lift, 0], [Math.PI / 2, 0, Math.PI / 2]);
  // legs with footpads
  for (const x of [-length * 0.32, length * 0.32])
    for (const z of [-radius * 0.62, radius * 0.62]) {
      strut(new THREE.Vector3(x, 0.08, z * 1.25), new THREE.Vector3(x, lift - radius * 0.8, z), 0.08, mats.alu, g);
      mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.1, 16), mats.dark, g, [x, 0.05, z * 1.25]);
    }
  // utility pipes along the top
  for (const off of [-0.35, 0.35]) {
    const y = lift + radius + 0.12;
    tube([new THREE.Vector3(-length / 2 + 0.3, y - 0.05, off), new THREE.Vector3(0, y, off), new THREE.Vector3(length / 2 - 0.3, y - 0.05, off)], 0.06, off > 0 ? mats.alu : mats.foil, g);
  }
  // handrail
  tube([new THREE.Vector3(-length / 2 + 0.6, lift - 0.4, radius + 0.25), new THREE.Vector3(length / 2 - 0.6, lift - 0.4, radius + 0.25)], 0.03, mats.hazard, g);
  return { group: g, lift };
}

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

function vsat(height: number) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 6), mats.dark, g, [0, 0.25, 0]);
  mesh(new THREE.CylinderGeometry(0.11, 0.14, height, 12), mats.alu, g, [0, height / 2, 0]);
  const head = new THREE.Group();
  head.position.y = height * 0.58;
  g.add(head);
  const w = 2.4;
  const h = height * 0.62;
  const pvGeo = new THREE.PlaneGeometry(w, h);
  const uv = pvGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * (h / w) * 3);
  for (const s of [-1, 1]) {
    const blanket = mesh(pvGeo, mats.pv, head, [s * (w / 2 + 0.16), 0, 0.02]);
    blanket.castShadow = true;
    const back = mesh(pvGeo, mats.foil, head, [s * (w / 2 + 0.16), 0, -0.01], [0, Math.PI, 0]);
    back.castShadow = false;
    // frame
    strut(new THREE.Vector3(s * 0.16, h / 2, 0), new THREE.Vector3(s * (w + 0.16), h / 2, 0), 0.03, mats.alu, head);
    strut(new THREE.Vector3(s * 0.16, -h / 2, 0), new THREE.Vector3(s * (w + 0.16), -h / 2, 0), 0.03, mats.alu, head);
    strut(new THREE.Vector3(s * (w + 0.16), -h / 2, 0), new THREE.Vector3(s * (w + 0.16), h / 2, 0), 0.03, mats.alu, head);
  }
  mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), mats.dark, g, [0, height + 0.2, 0]);
  const beacon = mesh(new THREE.SphereGeometry(0.08, 12, 8), mats.red, g, [0, height + 0.48, 0]);
  // Face the blankets towards the Sun's azimuth.
  head.rotation.y = Math.atan2(SUN_DIR.x, SUN_DIR.z);
  return { group: g, beacon };
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
  mesh(new THREE.PlaneGeometry(0.45, 0.3), mats.cyan, g, [2.81, 1.35, 0], [0, Math.PI / 2, 0]);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10), mats.green, g, [2.85, 1.0, 0.18], [0, 0, Math.PI / 2]);
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

export function buildOutpost(): Outpost {
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
  const hab = habitatModule(9, 2.1, 'HAB-1');
  place(hab.group, bx, bz, 0, by);
  colliders.push({ kind: 'box', center: new THREE.Vector3(bx, by + hab.lift, bz), half: new THREE.Vector3(5.2, 2.15, 2.2) });

  const node = new THREE.Group();
  mesh(new THREE.SphereGeometry(2.0, 32, 24), mats.shell, node, [0, hab.lift, 0]);
  mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 24), mats.alu, node, [0, hab.lift, 0], [0, 0, Math.PI / 2]).position.x = -1.6;
  place(node, bx + 6.4, bz, 0, by);
  colliders.push({ kind: 'ball', center: new THREE.Vector3(bx + 6.4, by + hab.lift, bz), radius: 2.1 });

  const lab = habitatModule(8, 1.9, 'LAB-1');
  place(lab.group, bx + 6.4, bz - 6.3, Math.PI / 2, by);
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
  place(o2.group, bx + 2, bz + 7.5, 0, by);
  colliders.push({ kind: 'box', center: new THREE.Vector3(bx + 2, by + 1.2, bz + 7.5), half: new THREE.Vector3(2.2, 1.2, 1.2) });
  interactables.push({ id: 'o2', object: o2.panel, label: () => 'p.o2refill' });

  // Vertical solar arrays on higher ground to the east
  for (const [x, z] of [[32, -38], [44, -26], [26, -52]]) {
    const v = vsat(12);
    place(v.group, x, z);
    colliders.push({ kind: 'cylinder', center: new THREE.Vector3(x, heightAt(x, z) + 6, z), halfHeight: 6, radius: 0.5 });
    blinkers.push({ mesh: v.beacon, period: 2.0, phase: x * 0.1 });
  }
  // Power cables from arrays to the habitat
  for (const [x, z] of [[32, -38], [44, -26], [26, -52]]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const px = THREE.MathUtils.lerp(x, bx + 6.4, t);
      const pz = THREE.MathUtils.lerp(z, bz - 2, t);
      pts.push(new THREE.Vector3(px, heightAt(px, pz) + 0.06, pz));
    }
    tube(pts, 0.05, mats.rubber, group).castShadow = false;
  }

  // Antenna
  const ant = antenna();
  place(ant, -24, -34);
  colliders.push({ kind: 'box', center: new THREE.Vector3(-24, heightAt(-24, -34) + 4, -34), half: new THREE.Vector3(0.9, 4, 0.9) });

  // Beacon mast over the habitat: the navigation target for Mission 1
  strut(new THREE.Vector3(bx + 2.5, by + 4, bz), new THREE.Vector3(bx + 2.5, by + 9, bz), 0.05, mats.alu, group);
  const beacon = mesh(new THREE.SphereGeometry(0.22, 16, 12), mats.green, group, [bx + 2.5, by + 9.2, bz]);
  blinkers.push({ mesh: beacon, period: 1.0, phase: 0.3 });

  // Crates near the habitat
  for (const [x, z, r, w, h, d] of [
    [-3, 7, 0.2, 1.2, 0.9, 0.9],
    [-1.6, 7.6, -0.1, 0.9, 0.7, 0.9],
    [-2.4, 7.4, 0.5, 0.8, 0.6, 0.6],
    [8, 6, 0.3, 1.6, 1.0, 1.0],
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
  place(lander(), LAYOUT.lander.x, LAYOUT.lander.z, 0, ly);
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

  return {
    group,
    colliders,
    interactables,
    lifeSupport: { pos: new THREE.Vector3(lx, by, lz), lights: ls.lights },
    blinkers,
    sensorLights,
    airlockPos: new THREE.Vector3(bx - 7.1, by, bz),
    o2StationPos: new THREE.Vector3(bx + 4.5, by, bz + 7.5),
    habitatPos: new THREE.Vector3(bx, by, bz),
  };
}

export const statusMaterials = { green: mats.green, amber: mats.amber, red: mats.red };
