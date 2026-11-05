import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { ColliderSpec, Interactable } from './base';

// The inside of HAB-1, built inside the real module (so its windows look out at the real base),
// plus the airlock chamber's inner door. You get in through the airlock (main.ts plays the walk-in);
// the shell colliders below replace the module's old solid box.
//
// Frame: x runs along the module (the airlock is at the west end, -x), y is up from the floor,
// z across (+z is on your right when you face east). One unit = one metre.

export type HabLights = 'day' | 'evening' | 'night';

const R = 1.97; // inner lining radius (the shell is 2.1)
const AXIS = 1.3; // module axis above the floor
const X0 = -4.55; // west bulkhead (airlock door)
const X1 = 4.55; // east bulkhead (hatch to NODE-1)
const WIN = { r: 0.33, y: 1.65, x: 2.16, z: 2.08 };
const LAMP = 6; // ceiling light intensity (day mode)

export interface Interior {
  group: THREE.Group;
  /** Hidden unless you are inside or in the airlock (lights cost shader time everywhere). */
  lights: THREE.Group;
  colliders: ColliderSpec[];
  interactables: Interactable[];
  /** World position from module-local coordinates (x along, y above the floor, z across). */
  at: (x: number, y: number, z: number) => THREE.Vector3;
  /** Floor height (world). */
  floor: number;
  /** Airlock chamber: floor height and centre (world). */
  chamber: { floor: number; x: number };
  setInnerDoor: (open: boolean) => void;
  setLightsOn: (on: boolean) => void;
  /** Red while the chamber has no air, green once it holds 101 kPa. */
  setChamberAir: (k: number) => void;
  setMode: (mode: HabLights) => void;
  /** Spin the bike's pedals for a few seconds. */
  pedal: (secs: number) => void;
  /** The suit-check mirror (shown only while you are inside: it renders the scene again). */
  mirror: Reflector;
  update: (dt: number, status: { o2: number; power: number }) => void;
}

const MODES: Record<HabLights, { color: number; k: number }> = {
  day: { color: 0xf4f7ff, k: 1 },
  evening: { color: 0xffc58c, k: 0.62 },
  night: { color: 0xff4a32, k: 0.2 },
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** Off-white wall panels with recessed seams, fasteners and the odd label. */
const panelTex = () =>
  canvasTexture(256, 256, (g) => {
    g.fillStyle = '#e9e8e3';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#c9c8c2';
    g.fillRect(0, 0, 256, 5);
    g.fillRect(0, 0, 5, 256);
    g.fillStyle = '#f6f5f1';
    g.fillRect(5, 5, 246, 3);
    g.fillStyle = '#9a9a94';
    for (const [x, y] of [[18, 18], [238, 18], [18, 238], [238, 238], [128, 18], [128, 238]]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.05)';
    g.strokeRect(40, 40, 176, 176);
  }, [16, 7]);

const floorTex = () =>
  canvasTexture(256, 256, (g) => {
    g.fillStyle = '#4a4f57';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#3a3e45';
    for (let i = 0; i < 256; i += 16) {
      g.fillRect(i, 0, 6, 256);
      g.fillRect(0, i, 256, 2);
    }
    g.fillStyle = '#2a2d32';
    g.fillRect(0, 0, 256, 4);
    g.fillRect(0, 0, 4, 256);
  }, [6, 2]);

const signTex = (text: string, sub: string, bg = '#1d2733', fg = '#e8f2ff') =>
  canvasTexture(512, 192, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 192);
    g.strokeStyle = '#ffb020';
    g.lineWidth = 8;
    g.strokeRect(8, 8, 496, 176);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.font = 'bold 70px "B612 Mono", monospace';
    g.fillText(text, 256, 98);
    g.font = '32px "B612 Mono", monospace';
    g.fillStyle = '#9fb3c8';
    g.fillText(sub, 256, 152);
  });

export function buildInterior(base: THREE.Vector3): Interior {
  const group = new THREE.Group();
  group.name = 'hab1-interior';
  const lights = new THREE.Group();
  lights.visible = false;
  group.add(lights);
  const floor = base.y + 1.7;
  const at = (x: number, y: number, z: number) => new THREE.Vector3(base.x + x, floor + y, base.z + z);
  const colliders: ColliderSpec[] = [];
  const interactables: Interactable[] = [];
  const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) =>
    colliders.push({ kind: 'box', center: at(cx, cy, cz), half: new THREE.Vector3(hx, hy, hz) });

  const mat = {
    lining: new THREE.MeshStandardMaterial({ map: panelTex(), roughness: 0.75, metalness: 0.02, side: THREE.BackSide }),
    floor: new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.6, metalness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf0efea, roughness: 0.55 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x8d939b, roughness: 0.5, metalness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.5, metalness: 0.6 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc3c8cf, roughness: 0.35, metalness: 0.9 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x2c5f9e, roughness: 0.6 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x3d5f8a, roughness: 0.95 }),
    bag: new THREE.MeshStandardMaterial({ color: 0x5b6b3a, roughness: 0.95 }),
    rail: new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.45, metalness: 0.3 }),
    strip: new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xf4f7ff, emissiveIntensity: 1.1 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x221500, emissive: 0xffa21a, emissiveIntensity: 3 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f9a3a, roughness: 0.8 }),
    grow: new THREE.MeshStandardMaterial({ color: 0x200818, emissive: 0xff4fd8, emissiveIntensity: 2.2 }),
    cushion: new THREE.MeshStandardMaterial({ color: 0x35587f, roughness: 0.9 }),
    chamber: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 }),
  };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot?: [number, number, number], parent: THREE.Object3D = group) => {
    const o = new THREE.Mesh(geo, m);
    o.position.copy(at(x, y, z));
    if (parent !== group) o.position.set(x, y, z);
    if (rot) o.rotation.set(...rot);
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const rbox = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, r = 0.02) => add(new RoundedBoxGeometry(w, h, d, 2, r), m, x, y, z);

  // ---------- shell: lining (with window holes), floor, bulkheads ----------
  const lining = add(new THREE.CylinderGeometry(R, R, X1 - X0, 64, 1, true), mat.lining, 0, AXIS, 0, [0, 0, Math.PI / 2]);
  lining.position.x = base.x + (X0 + X1) / 2;
  // Cut the four portholes out of the lining in the shader (the module's own glass sits behind).
  const windows = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => at(sx * WIN.x, WIN.y, sz * WIN.z)));
  mat.lining.onBeforeCompile = (s) => {
    s.uniforms.uWin = { value: windows };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;').replace('#include <project_vertex>', '#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nuniform vec3 uWin[4];')
      .replace('void main() {', `void main() {\nfor (int i = 0; i < 4; i++) { if (length(vWorldP.xy - uWin[i].xy) < ${WIN.r.toFixed(3)} && abs(vWorldP.z - uWin[i].z) < 0.4) discard; }`);
  };
  const wallZ = (y: number) => Math.sqrt(R * R - (y - AXIS) ** 2);
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.6, side: THREE.BackSide });
  for (const w of windows) {
    const s = Math.sign(w.z - base.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(WIN.r + 0.03, 0.045, 10, 40), mat.grey);
    ring.position.set(w.x, w.y, base.z + s * (wallZ(WIN.y) - 0.02));
    group.add(ring);
    // A short tube from the lining out to the glass, so the porthole has depth.
    const well = new THREE.Mesh(new THREE.CylinderGeometry(WIN.r, WIN.r, 0.12, 32, 1, true), wellMat);
    well.rotation.x = Math.PI / 2;
    well.position.set(w.x, w.y, base.z + s * (wallZ(WIN.y) + 0.04));
    group.add(well);
  }
  const halfW = Math.sqrt(R * R - AXIS * AXIS);
  add(new THREE.BoxGeometry(X1 - X0, 0.08, halfW * 2), mat.floor, 0, -0.04, 0);
  // Bulkheads: discs with a doorway (west: airlock; east: the hatch to NODE-1).
  const bulkhead = (x: number, door: { y0: number; y1: number; half: number }) => {
    const s = new THREE.Shape().absarc(0, 0, R + 0.02, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    const [x0, x1, y0, y1, r] = [-door.half, door.half, door.y0 - AXIS, door.y1 - AXIS, 0.16];
    h.moveTo(x0 + r, y0);
    h.lineTo(x1 - r, y0);
    h.quadraticCurveTo(x1, y0, x1, y0 + r);
    h.lineTo(x1, y1 - r);
    h.quadraticCurveTo(x1, y1, x1 - r, y1);
    h.lineTo(x0 + r, y1);
    h.quadraticCurveTo(x0, y1, x0, y1 - r);
    h.lineTo(x0, y0 + r);
    h.quadraticCurveTo(x0, y0, x0 + r, y0);
    s.holes.push(h);
    const m = add(new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false, curveSegments: 32 }), mat.white, x, AXIS, 0, [0, Math.PI / 2, 0]);
    m.castShadow = true;
    return m;
  };
  bulkhead(X0 - 0.03, { y0: 0, y1: 1.55, half: 0.5 });
  bulkhead(X1 - 0.03, { y0: 0.12, y1: 1.5, half: 0.48 });

  // ---------- airlock inner door (slides into the bulkhead pocket) ----------
  const inner = new THREE.Group();
  inner.position.copy(at(X0 - 0.09, 0.78, 0));
  group.add(inner);
  add(new RoundedBoxGeometry(0.07, 1.62, 1.08, 2, 0.03), mat.white, 0, 0, 0, undefined, inner).castShadow = true;
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.5, 0.06), mat.dark, sx * 0.045, 0.05, -0.38, undefined, inner);
  add(new THREE.CircleGeometry(0.15, 24), new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.05, metalness: 0.3 }), 0.037, 0.4, 0, [0, Math.PI / 2, 0], inner);
  let innerOpen = 0;
  let innerTarget = 0;
  // A sign over the door, and the exit control beside it (what you press to go out).
  const exitSign = add(new THREE.PlaneGeometry(0.7, 0.26), (() => {
    const t = signTex('AIRLOCK', 'EXIT  ·  EVA');
    return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5 });
  })(), X0 + 0.04, 1.78, 0, [0, Math.PI / 2, 0]);
  void exitSign;
  const exitPanel = rbox(0.06, 0.32, 0.22, mat.dark, X0 + 0.05, 1.1, -0.78);
  add(new THREE.PlaneGeometry(0.14, 0.14), mat.amber, X0 + 0.085, 1.16, -0.78, [0, Math.PI / 2, 0]);
  interactables.push({ id: 'hab-exit', object: exitPanel, label: () => 'p.hab.exit', minMission: 2 });
  // The inner door itself is also a target (press E while looking at the door).
  interactables.push({ id: 'hab-exit', object: inner.children[0], label: () => 'p.hab.exit', minMission: 2 });

  // Airlock chamber light (part of the interior lights) and status lamp.
  const chamberX = X0 - 1.2;
  const chamberLight = new THREE.PointLight(0xffe0d8, 1.1, 4.5, 2);
  chamberLight.position.copy(at(chamberX - 0.6, 0.85, 0));
  lights.add(chamberLight);
  add(new THREE.SphereGeometry(0.05, 12, 8), mat.chamber, X0 + 0.06, 1.68, 0.62);

  // ---------- ceiling: light strips, vents, utility runs ----------
  for (const z of [-0.45, 0.45]) {
    add(new THREE.BoxGeometry(X1 - X0 - 0.8, 0.035, 0.16), mat.strip, 0, AXIS + Math.sqrt(R * R - z * z) - 0.06, z);
  }
  add(new THREE.BoxGeometry(X1 - X0 - 0.6, 0.08, 0.3), mat.grey, 0, AXIS + R - 0.06, 0);
  for (let x = X0 + 1; x < X1 - 0.5; x += 1.6) add(new THREE.BoxGeometry(0.4, 0.03, 0.22), mat.dark, x, AXIS + R - 0.11, 0);
  // Handrails along both walls.
  for (const s of [-1, 1]) {
    const y = 1.55;
    const z = s * (Math.sqrt(R * R - (y - AXIS) ** 2) - 0.12);
    const rail = add(new THREE.CylinderGeometry(0.025, 0.025, X1 - X0 - 1.2, 8), mat.rail, 0, y, z, [0, 0, Math.PI / 2]);
    rail.castShadow = false;
  }

  // ---------- lights ----------
  const lamps: THREE.PointLight[] = [];
  for (const x of [-3.1, 0, 3.1]) {
    const l = new THREE.PointLight(0xf4f7ff, LAMP, 7.5, 2);
    l.position.copy(at(x, 2.75, 0));
    lights.add(l);
    lamps.push(l);
  }

  // ---------- west end: suit station (right) and stowage lockers (left) ----------
  // Suit station: a rack with umbilical hoses, a status screen and a helmet on the shelf.
  const SZ = halfW - 0.06;
  rbox(0.95, 1.85, 0.08, mat.grey, -3.3, 0.98, SZ);
  const suitScreenCanvas = document.createElement('canvas');
  suitScreenCanvas.width = 256;
  suitScreenCanvas.height = 160;
  const suitScreenTex = new THREE.CanvasTexture(suitScreenCanvas);
  suitScreenTex.colorSpace = THREE.SRGBColorSpace;
  const suitScreen = add(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshStandardMaterial({ map: suitScreenTex, emissive: 0xffffff, emissiveMap: suitScreenTex, emissiveIntensity: 1.2 }), -3.3, 1.35, SZ - 0.045, [0, Math.PI, 0]);
  interactables.push({ id: 'hab-suit', object: suitScreen, label: () => 'p.hab.suit', minMission: 2 });
  for (const [dx, m] of [[-0.25, mat.blue], [0.25, mat.dark]] as [number, THREE.Material][]) {
    const curve = new THREE.CatmullRomCurve3([at(-3.3 + dx, 1.05, SZ - 0.05), at(-3.3 + dx * 1.3, 0.75, SZ - 0.22), at(-3.3 + dx * 1.6, 0.4, SZ - 0.1)]);
    group.add(Object.assign(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.03, 8), m), { receiveShadow: true }));
  }
  rbox(0.7, 0.04, 0.3, mat.alu, -3.3, 1.72, SZ - 0.17);
  const helmet = add(new THREE.SphereGeometry(0.17, 24, 16), mat.white, -3.42, 1.91, SZ - 0.19);
  helmet.castShadow = true;
  add(new THREE.SphereGeometry(0.172, 24, 16, Math.PI * 0.65, Math.PI * 0.7, Math.PI * 0.28, Math.PI * 0.36), new THREE.MeshStandardMaterial({ color: 0xc89a2a, roughness: 0.1, metalness: 1 }), -3.42, 1.91, SZ - 0.19);
  box(-3.3, 0.9, SZ - 0.1, 0.5, 0.9, 0.2);
  // Lockers.
  rbox(1.1, 1.75, 0.5, mat.white, -3.4, 0.875, -(halfW - 0.25));
  for (const dx of [-0.27, 0.27]) {
    add(new THREE.BoxGeometry(0.5, 1.65, 0.01), mat.grey, -3.4 + dx, 0.875, -(halfW - 0.505));
    add(new THREE.BoxGeometry(0.04, 0.22, 0.03), mat.dark, -3.4 + dx + (dx < 0 ? 0.2 : -0.2), 1.0, -(halfW - 0.52));
  }
  box(-3.4, 0.875, -(halfW - 0.25), 0.55, 0.875, 0.25);
  // A full-length suit-check mirror on the right locker door, across from the suit station:
  // crews check their suit (hoses, straps, the helmet seal) before going out.
  const mirrorFrame = rbox(0.37, 1.56, 0.02, mat.alu, -3.06, 0.95, -(halfW - 0.515), 0.01);
  mirrorFrame.castShadow = false;
  const mirror = new Reflector(new THREE.PlaneGeometry(0.32, 1.5), {
    textureWidth: Math.round(Math.min(innerWidth, 1600) * 0.6),
    textureHeight: Math.round(Math.min(innerHeight, 900) * 0.6),
    color: 0xd8dde2,
    clipBias: 0.003,
    multisample: 0, // no MSAA: the mirror is small and this keeps it cheap
  });
  mirror.position.copy(at(-3.06, 0.95, -(halfW - 0.528)));
  mirror.visible = false;
  group.add(mirror);

  // ---------- galley (left, under the first porthole) ----------
  rbox(1.6, 0.9, 0.6, mat.white, -2.1, 0.45, -(halfW - 0.32));
  add(new THREE.BoxGeometry(1.62, 0.04, 0.62), mat.alu, -2.1, 0.92, -(halfW - 0.32));
  const water = rbox(0.28, 0.42, 0.26, mat.grey, -2.55, 1.15, -(halfW - 0.2));
  add(new THREE.PlaneGeometry(0.14, 0.05), new THREE.MeshStandardMaterial({ color: 0x001020, emissive: 0x38b8ff, emissiveIntensity: 2 }), -2.55, 1.27, -(halfW - 0.335));
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.06), mat.dark, -2.55, 1.0, -(halfW - 0.3));
  interactables.push({ id: 'hab-galley', object: water, label: () => 'p.hab.galley', minMission: 2 });
  rbox(0.42, 0.3, 0.32, mat.dark, -1.95, 1.09, -(halfW - 0.22));
  add(new THREE.PlaneGeometry(0.06, 0.03), mat.amber, -1.82, 1.15, -(halfW - 0.381));
  // Food pouches on a strap board.
  rbox(0.55, 0.36, 0.03, mat.grey, -1.45, 1.22, -(halfW - 0.06));
  const pouchColors = [0xd96b2b, 0x3b8f4a, 0xe0c040, 0xb03a3a, 0x3a70b0, 0xe0e0e0];
  pouchColors.forEach((c, i) => rbox(0.1, 0.13, 0.03, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }), -1.62 + (i % 3) * 0.17, 1.3 - Math.floor(i / 3) * 0.16, -(halfW - 0.09), 0.01));
  box(-2.1, 0.45, -(halfW - 0.32), 0.8, 0.45, 0.32);

  // ---------- exercise bike (right) ----------
  const bike = new THREE.Group();
  bike.position.copy(at(-2.0, 0, halfW - 0.62));
  group.add(bike);
  const bikePart = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot?: [number, number, number]) => add(geo, m, x, y, z, rot, bike);
  bikePart(new RoundedBoxGeometry(1.1, 0.06, 0.4, 2, 0.02), mat.dark, 0, 0.03, 0);
  bikePart(new THREE.CylinderGeometry(0.04, 0.04, 0.8), mat.alu, -0.25, 0.45, 0, [0, 0, -0.35]);
  bikePart(new THREE.CylinderGeometry(0.04, 0.04, 0.9), mat.alu, 0.3, 0.5, 0, [0, 0, 0.25]);
  const flywheel = bikePart(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 32), mat.grey, 0.25, 0.32, 0, [Math.PI / 2, 0, 0]);
  bikePart(new RoundedBoxGeometry(0.28, 0.07, 0.22, 2, 0.03), mat.cushion, -0.38, 0.86, 0);
  bikePart(new THREE.CylinderGeometry(0.02, 0.02, 0.5), mat.dark, 0.42, 0.95, 0, [Math.PI / 2, 0, 0]);
  bikePart(new THREE.BoxGeometry(0.03, 0.08, 0.12), mat.dark, 0.43, 1.0, 0, [0, 0, 0.5]);
  bikePart(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x001018, emissive: 0x31ff7a, emissiveIntensity: 0.5 }), 0.414, 1.008, 0, [0, -Math.PI / 2, 0.5]);
  const crank = new THREE.Group();
  crank.position.set(0.25, 0.32, 0);
  bike.add(crank);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.02), mat.dark);
    arm.position.set(0, s * 0.09, s * 0.06);
    crank.add(arm);
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), mat.dark);
    pedal.position.set(0, s * 0.18, s * 0.09);
    crank.add(pedal);
  }
  // The whole bike is the target.
  const bikeHit = bikePart(new THREE.BoxGeometry(1.1, 1.0, 0.45), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.5, 0);
  interactables.push({ id: 'hab-bike', object: bikeHit, label: () => 'p.hab.bike', minMission: 2 });
  box(-2.0, 0.5, halfW - 0.62, 0.55, 0.5, 0.25);

  // ---------- console (left, middle): desk, three screens, a chair ----------
  rbox(1.7, 0.06, 0.62, mat.alu, 0, 0.78, -(halfW - 0.36));
  rbox(1.7, 0.74, 0.5, mat.white, 0, 0.37, -(halfW - 0.3));
  const consoleCanvas = document.createElement('canvas');
  consoleCanvas.width = 768;
  consoleCanvas.height = 240;
  const consoleTex = new THREE.CanvasTexture(consoleCanvas);
  consoleTex.colorSpace = THREE.SRGBColorSpace;
  const consoleMat = new THREE.MeshStandardMaterial({ map: consoleTex, emissive: 0xffffff, emissiveMap: consoleTex, emissiveIntensity: 1.1 });
  const screens: THREE.Mesh[] = [];
  for (const [i, dx] of [-0.56, 0, 0.56].entries()) {
    const geo = new THREE.PlaneGeometry(0.5, 0.31);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
    rbox(0.54, 0.35, 0.04, mat.dark, dx, 1.2, -(wallZ(1.2) - 0.24));
    const s = add(geo, consoleMat, dx, 1.2, -(wallZ(1.2) - 0.265), [0, dx * -0.5, 0]);
    s.rotation.set(0, -dx * 0.5, 0);
    screens.push(s);
  }
  interactables.push({ id: 'hab-console', object: screens[1], label: () => 'p.hab.console', minMission: 2 });
  for (const s of [screens[0], screens[2]]) interactables.push({ id: 'hab-console', object: s, label: () => 'p.hab.console', minMission: 2 });
  rbox(0.42, 0.06, 0.42, mat.cushion, 0.1, 0.48, -(halfW - 1.05));
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.45), mat.alu, 0.1, 0.23, -(halfW - 1.05));
  box(0, 0.4, -(halfW - 0.33), 0.85, 0.4, 0.33);

  // ---------- plant shelf (right, middle) ----------
  rbox(1.2, 0.05, 0.36, mat.alu, 0, 1.05, halfW - 0.24);
  rbox(1.2, 0.05, 0.36, mat.alu, 0, 0.55, halfW - 0.24);
  add(new THREE.BoxGeometry(1.0, 0.03, 0.05), mat.grow, 0, 1.4, halfW - 0.2);
  add(new THREE.BoxGeometry(1.0, 0.03, 0.05), mat.grow, 0, 0.9, halfW - 0.2);
  for (const y of [0.58, 1.08])
    for (let i = 0; i < 4; i++) {
      add(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 12), mat.white, -0.42 + i * 0.28, y + 0.05, halfW - 0.24);
      for (let k = 0; k < 5; k++) {
        const leaf = add(new THREE.SphereGeometry(0.05, 8, 6), mat.leaf, -0.42 + i * 0.28 + Math.cos(k * 1.3) * 0.04, y + 0.14 + (k % 2) * 0.04, halfW - 0.24 + Math.sin(k * 1.3) * 0.04);
        leaf.scale.set(1, 0.6, 1.4);
      }
    }
  box(0, 0.7, halfW - 0.24, 0.6, 0.7, 0.18);

  // ---------- Earth window (left, east porthole): a bench to sit and look ----------
  rbox(1.3, 0.1, 0.42, mat.cushion, 2.16, 0.45, -(halfW - 0.3));
  rbox(1.3, 0.4, 0.38, mat.white, 2.16, 0.2, -(halfW - 0.3));
  box(2.16, 0.25, -(halfW - 0.3), 0.65, 0.25, 0.21);
  const earthWin = windows.find((w) => w.x > base.x && w.z < base.z)!;
  const winHit = new THREE.Mesh(new THREE.CircleGeometry(WIN.r + 0.05, 24), new THREE.MeshBasicMaterial({ visible: false }));
  winHit.position.copy(earthWin).add(new THREE.Vector3(0, 0, 0.14));
  group.add(winHit);
  interactables.push({ id: 'hab-window', object: winHit, label: () => 'p.hab.window', minMission: 2 });
  // Mission photo board by the other porthole (right).
  add(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: photoBoard(), roughness: 0.8 }), 2.16, 1.0, wallZ(1.0) - 0.07, [0, Math.PI, 0]);

  // ---------- crew quarters (east end): sleep stations both sides ----------
  const bunkHits: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const z = s * (halfW - 0.45);
    rbox(1.4, 0.06, 0.85, mat.white, 3.75, 0.02, z);
    rbox(1.4, 2.1, 0.06, mat.white, 3.75, 1.05, s * (halfW - 0.03));
    rbox(0.06, 2.1, 0.88, mat.white, 3.03, 1.05, z);
    rbox(1.4, 0.06, 0.88, mat.white, 3.75, 2.08, z);
    rbox(1.25, 0.25, 0.7, mat.bag, 3.8, 0.25, z);
    rbox(0.35, 0.12, 0.45, mat.white, 4.25, 0.42, z);
    // Curtain, half drawn.
    const curtain = add(new THREE.PlaneGeometry(0.6, 1.9, 6, 1), mat.fabric, 3.35, 1.05, z - s * 0.44, [0, 0, 0]);
    const p = curtain.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 18) * 0.03);
    (curtain.material as THREE.Material).side = THREE.DoubleSide;
    add(new THREE.BoxGeometry(0.2, 0.03, 0.08), mat.amber, 3.6, 1.95, z + s * 0.2);
    const hit = add(new THREE.BoxGeometry(1.3, 0.9, 0.8), new THREE.MeshBasicMaterial({ visible: false }), 3.75, 0.5, z);
    bunkHits.push(hit);
    box(3.75, 1.05, z, 0.72, 1.05, 0.45);
  }
  interactables.push({ id: 'hab-bunk', object: bunkHits[1], label: () => 'p.hab.bunk', minMission: 2 });
  interactables.push({ id: 'hab-bunk', object: bunkHits[0], label: () => 'p.hab.bunk', minMission: 2 });

  // ---------- east bulkhead: the hatch to NODE-1 (closed) ----------
  const nodeHatch = rbox(0.08, 1.38, 0.96, mat.white, X1 - 0.08, 0.81, 0, 0.06);
  add(new THREE.TorusGeometry(0.16, 0.025, 8, 24), mat.dark, X1 - 0.14, 0.95, 0, [0, Math.PI / 2, 0]);
  add(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshStandardMaterial({ map: signTex('NODE-1', 'LAB-1  ·  HAB-2') }), X1 - 0.13, 1.78, 0, [0, -Math.PI / 2, 0]);
  interactables.push({ id: 'hab-node', object: nodeHatch, label: () => 'p.hab.node', minMission: 2 });

  // ---------- shell colliders: floor, ceiling, side walls, end walls ----------
  // From outside they make the same solid block the module always had.
  const by = base.y;
  colliders.push({ kind: 'box', center: new THREE.Vector3(base.x, (by + 0.9 + floor) / 2, base.z), half: new THREE.Vector3(5.2, (floor - by - 0.9) / 2, 2.2) });
  colliders.push({ kind: 'box', center: new THREE.Vector3(base.x, by + 4.95, base.z), half: new THREE.Vector3(5.2, 0.2, 2.2) });
  for (const s of [-1, 1]) colliders.push({ kind: 'box', center: new THREE.Vector3(base.x, floor + 1.55, base.z + s * 1.82), half: new THREE.Vector3(5.2, 1.6, 0.38) });
  colliders.push({ kind: 'box', center: new THREE.Vector3(base.x + X0 - 0.33, floor + 1.55, base.z), half: new THREE.Vector3(0.33, 1.6, 1.5) });
  colliders.push({ kind: 'box', center: new THREE.Vector3(base.x + X1 + 0.33, floor + 1.55, base.z), half: new THREE.Vector3(0.33, 1.6, 1.5) });

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });

  // ---------- live screens ----------
  let screenAcc = 1;
  let crankAngle = 0;
  const drawScreens = (status: { o2: number; power: number }) => {
    const g = suitScreenCanvas.getContext('2d')!;
    g.fillStyle = '#04121c';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#5fd4ff';
    g.font = 'bold 22px "B612 Mono", monospace';
    g.fillText('SUIT PORT 1', 14, 30);
    const bar = (y: number, label: string, v: number, color: string) => {
      g.fillStyle = '#9fb3c8';
      g.font = '18px "B612 Mono", monospace';
      g.fillText(`${label} ${Math.round(v)}%`, 14, y);
      g.fillStyle = '#16283a';
      g.fillRect(14, y + 8, 228, 14);
      g.fillStyle = color;
      g.fillRect(14, y + 8, 2.28 * v, 14);
    };
    bar(66, 'O2 ', status.o2, '#5fd4ff');
    bar(116, 'PWR', status.power, '#ffd166');
    suitScreenTex.needsUpdate = true;

    const c = consoleCanvas.getContext('2d')!;
    const t = performance.now() / 1000;
    c.fillStyle = '#04121c';
    c.fillRect(0, 0, 768, 240);
    c.font = 'bold 20px "B612 Mono", monospace';
    // Screen 1: cabin air trace.
    c.fillStyle = '#5fd4ff';
    c.fillText('CABIN AIR', 16, 30);
    c.strokeStyle = '#5fd4ff';
    c.beginPath();
    for (let x = 0; x < 220; x++) c.lineTo(16 + x, 140 - Math.sin(x * 0.05 + t) * 10 - Math.sin(x * 0.21 + t * 2) * 4);
    c.stroke();
    c.fillStyle = '#9fb3c8';
    c.fillText('101 kPa  21%O2', 16, 200);
    // Screen 2: base map.
    c.fillStyle = '#ffd166';
    c.fillText('OUTPOST', 272, 30);
    c.strokeStyle = '#2f4a62';
    for (let k = 0; k < 6; k++) c.strokeRect(272 + k * 6, 48 + k * 6, 220 - k * 12, 160 - k * 12);
    c.fillStyle = '#31ff7a';
    c.fillRect(370, 120, 30, 10);
    c.fillRect(398, 100, 10, 30);
    c.fillStyle = Math.sin(t * 4) > 0 ? '#ff5a4a' : '#5a1a14';
    c.beginPath();
    c.arc(330, 128, 5, 0, Math.PI * 2);
    c.fill();
    // Screen 3: Earth link.
    c.fillStyle = '#31ff7a';
    c.fillText('EARTH LINK', 528, 30);
    for (let k = 0; k < 12; k++) {
      const h = 20 + Math.abs(Math.sin(k * 1.7 + t * 3)) * 90;
      c.fillRect(530 + k * 18, 190 - h, 12, h);
    }
    c.fillStyle = '#9fb3c8';
    c.fillText('1.3 s delay', 528, 220);
    consoleTex.needsUpdate = true;
  };

  let pedal = 0;
  const api: Interior = {
    group,
    lights,
    colliders,
    interactables,
    at,
    floor,
    chamber: { floor: base.y + 1.45, x: base.x + chamberX },
    setInnerDoor: (open) => (innerTarget = open ? 1 : 0),
    setLightsOn: (on) => (lights.visible = on),
    setChamberAir: (k) => {
      // The status lamp shows red or green; the room light only takes a hint of it.
      const c = new THREE.Color(0xff3020).lerp(new THREE.Color(0x40ff70), k);
      chamberLight.color.set(0xffffff).lerp(c, 0.25);
      mat.chamber.emissive.copy(c);
    },
    setMode: (mode) => {
      const m = MODES[mode];
      for (const l of lamps) {
        l.color.setHex(m.color);
        l.intensity = LAMP * m.k;
      }
      mat.strip.emissive.setHex(m.color);
      mat.strip.emissiveIntensity = 1.1 * m.k;
    },
    pedal: (secs) => (pedal = secs),
    mirror,
    update: (dt, status) => {
      innerOpen += THREE.MathUtils.clamp(innerTarget - innerOpen, -dt / 0.8, dt / 0.8);
      const k = innerOpen * innerOpen * (3 - 2 * innerOpen);
      inner.position.z = base.z + k * 1.08;
      if (pedal > 0) {
        crankAngle += dt * 9;
        crank.rotation.z = -crankAngle;
        flywheel.rotation.y = -crankAngle * 3;
        pedal = Math.max(0, pedal - dt);
      }
      if (!lights.visible) return;
      screenAcc += dt;
      if (screenAcc > 0.25) {
        screenAcc = 0;
        drawScreens(status);
      }
    },
  };
  api.setMode('day');
  return api;
}

/** Cork board with crayon drawings and photos (the crew's families). */
function photoBoard() {
  return canvasTexture(384, 256, (g) => {
    g.fillStyle = '#b48a5a';
    g.fillRect(0, 0, 384, 256);
    const items: [number, number, number, number, string][] = [
      [20, 20, 110, 90, '#f4f1e8'],
      [150, 30, 100, 120, '#dfe9f5'],
      [270, 18, 96, 80, '#f7e7d0'],
      [30, 135, 120, 100, '#e9f3e1'],
      [180, 165, 90, 75, '#f4f1e8'],
      [285, 115, 85, 120, '#fbe3e8'],
    ];
    for (const [x, y, w, h, c] of items) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + 4, y + 4, w, h);
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
      g.fillStyle = '#d33';
      g.beginPath();
      g.arc(x + w / 2, y + 6, 4, 0, Math.PI * 2);
      g.fill();
    }
    // A crayon Earth, a rocket, a house and a smiling sun.
    g.fillStyle = '#3a7bd5';
    g.beginPath();
    g.arc(75, 65, 28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4caf50';
    g.fillRect(60, 52, 18, 12);
    g.fillRect(78, 70, 14, 10);
    g.fillStyle = '#e05050';
    g.beginPath();
    g.moveTo(200, 45);
    g.lineTo(215, 85);
    g.lineTo(185, 85);
    g.fill();
    g.fillStyle = '#999';
    g.fillRect(190, 85, 20, 40);
    g.fillStyle = '#ffb020';
    g.fillRect(193, 125, 14, 14);
    g.fillStyle = '#f0c040';
    g.beginPath();
    g.arc(318, 55, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c0703a';
    g.fillRect(60, 175, 50, 40);
    g.fillStyle = '#a03030';
    g.beginPath();
    g.moveTo(52, 177);
    g.lineTo(85, 150);
    g.lineTo(118, 177);
    g.fill();
    g.fillStyle = '#334';
    g.font = '16px sans-serif';
    g.fillText('Love you!', 192, 205);
    g.fillText('Come home soon', 286, 180);
  });
}
