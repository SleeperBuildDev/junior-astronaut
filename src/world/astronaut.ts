import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The player's own astronaut, built from shapes with a jointed skeleton (hips, knees,
// ankles, shoulders, elbows, wrists, waist, neck). Cutscenes pose it (kneel, point, swing
// a golf club, hold a hammer); in normal play an invisible copy follows you and casts your
// shadow, driven by a gait: a walk whose strides match the distance you cover (so the feet
// don't slide), the bounding "lope" Apollo crews used when running in low gravity, a tuck
// in the air and a squat on landing. The gold visor is a mirror (a cube camera on High).

/** Layer for meshes that should cast shadows but never be drawn (enable it on the shadow camera). */
export const SHADOW_LAYER = 1;

export type Pose = 'stand' | 'walk' | 'kneel' | 'point' | 'swingBack' | 'swingHit' | 'hold' | 'look';

interface Joints {
  root: number; // body height offset
  lean: number; // torso pitch (+ = forward)
  roll: number; // torso side tilt
  twist: number; // torso yaw
  head: number; // helmet pitch (+ = look down)
  lHip: number; // (- = leg forward)
  lKnee: number; // (+ = bend)
  lAnkle: number;
  rHip: number;
  rKnee: number;
  rAnkle: number;
  lSh: number; // (- = arm forward/up)
  lElb: number; // (- = bend)
  rSh: number;
  rElb: number;
  lOut: number; // arm sideways (+ = away from body)
  rOut: number;
}

const STAND: Joints = { root: 0, lean: 0, roll: 0, twist: 0, head: 0, lHip: 0, lKnee: 0, lAnkle: 0, rHip: 0, rKnee: 0, rAnkle: 0, lSh: 0.05, lElb: -0.25, rSh: 0.05, rElb: -0.25, lOut: 0.2, rOut: 0.2 };
const POSES: Record<Pose, Partial<Joints>> = {
  stand: {},
  walk: {},
  look: { head: -0.35, lSh: -0.25, rSh: -0.25, lElb: -0.6, rElb: -0.6 },
  // Right knee on the ground, left foot forward, right hand reaching for the find.
  kneel: { root: -0.4, lean: 0.35, head: 0.45, lHip: -1.4, lKnee: 1.42, rHip: 0.15, rKnee: 1.55, rAnkle: 0.6, rSh: -1.0, rElb: -0.5, rOut: 0.05, lSh: -0.5, lElb: -0.9, lOut: 0.35 },
  point: { head: -0.2, rSh: -2.3, rElb: -0.05, rOut: 0.1 },
  // Golf: both hands together on the club, wound up behind, then through the ball.
  swingBack: { root: -0.06, lean: 0.35, head: 0.5, lHip: -0.12, lKnee: 0.25, rHip: -0.12, rKnee: 0.25, twist: 0.9, lSh: -1.1, rSh: -1.1, lElb: -0.1, rElb: -0.3, lOut: -0.25, rOut: -0.25 },
  swingHit: { root: -0.06, lean: 0.3, head: 0.3, lHip: -0.12, lKnee: 0.2, rHip: -0.12, rKnee: 0.3, twist: -1.0, lSh: -1.3, rSh: -1.3, lElb: -0.05, rElb: -0.1, lOut: -0.3, rOut: -0.3 },
  // Arms out in front at shoulder height: hammer in the right hand, feather in the left.
  hold: { head: 0.15, lSh: -1.45, rSh: -1.45, lElb: -0.15, rElb: -0.15, lOut: 0.25, rOut: 0.25 },
};

const KEYS = Object.keys(STAND) as (keyof Joints)[];
function lerpJoints(a: Joints, b: Joints, k: number): Joints {
  const o = { ...a };
  for (const key of KEYS) o[key] = a[key] + (b[key] - a[key]) * k;
  return o;
}
const full = (p: Pose): Joints => ({ ...STAND, ...POSES[p] });
const smooth = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** A fine woven-fabric normal map for the suit. */
function weaveNormal() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const wx = Math.sin((x / S) * Math.PI * 32);
      const wy = Math.sin((y / S) * Math.PI * 32);
      const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const i = (y * S + x) * 4;
      img.data[i] = 128 + wx * 18 + n * 10;
      img.data[i + 1] = 128 + wy * 18 + n * 10;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

/** A limb segment hanging down from its joint: a lathe with a soft bulge, `len` long. */
function limb(rTop: number, rMid: number, rBot: number, len: number) {
  const pts: THREE.Vector2[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = t < 0.5 ? THREE.MathUtils.lerp(rTop, rMid, Math.sin(t * Math.PI)) : THREE.MathUtils.lerp(rBot, rMid, Math.sin(t * Math.PI));
    pts.push(new THREE.Vector2(r, -t * len));
  }
  pts.unshift(new THREE.Vector2(0, rTop * 0.4));
  pts.push(new THREE.Vector2(0, -len - rBot * 0.4));
  return new THREE.LatheGeometry(pts, 16);
}

/** Pleated joint bellows: a stack of thin rings. */
function bellows(parent: THREE.Object3D, mat: THREE.Material, r: number, y: number, count: number, gap: number, add: (g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh) {
  for (let i = 0; i < count; i++) add(new THREE.TorusGeometry(r, r * 0.12, 6, 18), mat, parent, 0, y - i * gap, 0).rotation.x = Math.PI / 2;
}

export class Astronaut {
  readonly root = new THREE.Group();
  readonly visor: THREE.Mesh;
  /** Where the right glove is (attach a hammer, a club ...). */
  readonly rHand = new THREE.Group();
  readonly lHand = new THREE.Group();
  /** A spotlight in the helmet lamps (off unless a cutscene turns it on). */
  readonly lamp: THREE.SpotLight;
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private helmet = new THREE.Group();
  private hips: { l: THREE.Group; r: THREE.Group };
  private knees: { l: THREE.Group; r: THREE.Group };
  private ankles: { l: THREE.Group; r: THREE.Group };
  private shoulders: { l: THREE.Group; r: THREE.Group };
  private elbows: { l: THREE.Group; r: THREE.Group };
  private from: Joints = full('stand');
  private to: Joints = full('stand');
  private k = 1;
  private speed = 2;
  private walkPhase = 0;
  readonly materials: THREE.Material[] = [];

  /** shadowOnly: invisible to the camera but still casts a shadow (the player's own body), fewer small parts. */
  constructor(opts: { shadowOnly?: boolean } = {}) {
    const detail = !opts.shadowOnly;
    const fabric = new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.85, metalness: 0, normalMap: detail ? weaveNormal() : null, normalScale: new THREE.Vector2(0.35, 0.35) });
    const shell = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.45, metalness: 0.05 });
    const grey = new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 0.5, metalness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.55, metalness: 0.25 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.7, metalness: 0.1 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x2f7fd8, roughness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc8382e, roughness: 0.6 });
    const visorMat = new THREE.MeshPhysicalMaterial({ color: 0xe0a640, metalness: 1, roughness: 0.035, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.02 });
    this.materials.push(fabric, shell, grey, dark, glove, accent, red, visorMat);

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = detail;
      // Shadow-only: on layer 1, which only the Sun's shadow camera renders.
      if (!detail) m.layers.set(SHADOW_LAYER);
      parent.add(m);
      return m;
    };
    /** Small parts are left off the shadow copy (they'd only cost draw calls). */
    const fine = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => (detail ? mesh(geo, mat, parent, x, y, z) : new THREE.Mesh());

    this.root.add(this.body);
    // Pelvis: the "brief" of the suit, on the body at hip height.
    const pelvis = new THREE.LatheGeometry([new THREE.Vector2(0, -0.13), new THREE.Vector2(0.14, -0.12), new THREE.Vector2(0.2, -0.04), new THREE.Vector2(0.21, 0.06), new THREE.Vector2(0.2, 0.12), new THREE.Vector2(0, 0.12)], 20);
    mesh(pelvis, fabric, this.body, 0, 0.97, 0).scale.set(1, 1, 0.8);

    // Torso pivots at the waist bearing (y 1.08): a broad chest tapering to the waist.
    this.torso.position.y = 1.08;
    this.body.add(this.torso);
    const chestPts = [
      [0.0, -0.02],
      [0.19, -0.02],
      [0.2, 0.06],
      [0.23, 0.18],
      [0.26, 0.3],
      [0.265, 0.38],
      [0.24, 0.45],
      [0.17, 0.5],
      [0.0, 0.51],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    mesh(new THREE.LatheGeometry(chestPts, 24), fabric, this.torso).scale.set(1.05, 1, 0.76);
    // Hard upper torso: a smooth shell over the chest and shoulders.
    const hut = mesh(new THREE.SphereGeometry(0.25, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), shell, this.torso, 0, 0.3, 0.01);
    hut.scale.set(1.12, 0.95, 0.82);
    mesh(new THREE.TorusGeometry(0.195, 0.022, 8, 28), grey, this.torso, 0, 0.0, 0).rotation.x = Math.PI / 2; // waist bearing
    // Life-support backpack with a top cap, side tanks and a vent grille.
    mesh(new RoundedBoxGeometry(0.5, 0.66, 0.25, 4, 0.07), shell, this.torso, 0, 0.32, -0.27);
    fine(new RoundedBoxGeometry(0.44, 0.12, 0.2, 3, 0.04), fabric, this.torso, 0, 0.7, -0.25);
    for (const s of [-1, 1]) fine(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 12), grey, this.torso, s * 0.255, 0.3, -0.33);
    for (let i = 0; i < 5; i++) fine(new THREE.BoxGeometry(0.3, 0.012, 0.01), dark, this.torso, 0, 0.12 + i * 0.03, -0.4);
    fine(new THREE.CylinderGeometry(0.006, 0.008, 0.28, 6), grey, this.torso, 0.17, 0.86, -0.3);
    // Chest display-and-control box, with two umbilical hoses to the backpack.
    const dcm = fine(new RoundedBoxGeometry(0.28, 0.15, 0.11, 3, 0.025), grey, this.torso, 0, 0.24, 0.22);
    dcm.rotation.x = -0.2;
    fine(new THREE.CylinderGeometry(0.018, 0.018, 0.025, 12), red, dcm, -0.08, 0.02, 0.06).rotation.x = Math.PI / 2;
    fine(new THREE.CylinderGeometry(0.018, 0.018, 0.025, 12), accent, dcm, -0.03, 0.02, 0.06).rotation.x = Math.PI / 2;
    fine(new THREE.BoxGeometry(0.08, 0.04, 0.012), new THREE.MeshBasicMaterial({ color: 0x3fd1ff }), dcm, 0.06, 0.015, 0.058);
    for (const [s, col] of [
      [-1, accent],
      [1, red],
    ] as const) {
      const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.09, 0.2, 0.25), new THREE.Vector3(s * 0.22, 0.1, 0.17), new THREE.Vector3(s * 0.28, 0.2, -0.05), new THREE.Vector3(s * 0.25, 0.35, -0.16)]);
      fine(new THREE.TubeGeometry(hose, 16, 0.018, 6), col, this.torso);
    }
    // Mission patch on the left shoulder and a name tag on the chest.
    fine(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20), accent, this.torso, 0.21, 0.4, 0.12).rotation.set(Math.PI / 2 - 0.4, 0, 0.7);
    fine(new THREE.BoxGeometry(0.1, 0.03, 0.01), dark, this.torso, 0.11, 0.38, 0.19).rotation.x = -0.35;

    // Helmet: neck ring, white hood with lamps, gold visor, a clear outer bubble.
    this.helmet.position.y = 0.55;
    this.torso.add(this.helmet);
    mesh(new THREE.TorusGeometry(0.14, 0.024, 10, 28), grey, this.helmet, 0, 0.0, 0).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.19, 28, 20), shell, this.helmet, 0, 0.17, -0.01);
    this.visor = mesh(new THREE.SphereGeometry(0.2, 32, 20, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.2, Math.PI * 0.45), visorMat, this.helmet, 0, 0.17, 0.0);
    this.visor.castShadow = false;
    // The hood (visor assembly) wraps the back, top and sides, leaving the face open.
    fine(new THREE.SphereGeometry(0.212, 28, 16, Math.PI * (5 / 6), Math.PI * (4 / 3), 0, Math.PI * 0.6), shell, this.helmet, 0, 0.17, -0.005);
    for (const s of [-1, 1]) {
      const lampBox = fine(new RoundedBoxGeometry(0.055, 0.06, 0.09, 2, 0.012), grey, this.helmet, s * 0.2, 0.25, 0.04);
      fine(new THREE.CircleGeometry(0.02, 14), new THREE.MeshBasicMaterial({ color: 0xfff4dd }), lampBox, 0, 0, 0.046);
    }
    this.lamp = new THREE.SpotLight(0xfff0d8, 0, 25, 0.45, 0.5, 1.4);
    // Hidden lights cost nothing; it is only switched on in cutscenes.
    this.lamp.visible = false;
    this.lamp.position.set(0, 0.25, 0.1);
    this.lamp.target.position.set(0, -0.4, 3);
    this.helmet.add(this.lamp, this.lamp.target);

    // Arms: shoulder bearing -> upper arm -> elbow bellows -> forearm -> wrist ring -> glove.
    const arm = (s: 1 | -1) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.31, 0.4, 0);
      this.torso.add(sh);
      mesh(new THREE.SphereGeometry(0.105, 18, 12), shell, sh);
      fine(new THREE.TorusGeometry(0.1, 0.018, 8, 20), grey, sh, 0, -0.02, 0).rotation.z = Math.PI / 2;
      mesh(limb(0.088, 0.083, 0.07, 0.27), fabric, sh, 0, -0.05, 0);
      const el = new THREE.Group();
      el.position.y = -0.34;
      sh.add(el);
      bellows(el, fabric, 0.072, 0.03, detail ? 3 : 1, 0.025, mesh);
      mesh(limb(0.07, 0.068, 0.058, 0.22), fabric, el, 0, -0.04, 0);
      mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.045, 16), grey, el, 0, -0.29, 0);
      const hand = s === 1 ? this.lHand : this.rHand;
      hand.position.y = -0.34;
      el.add(hand);
      // Glove: gauntlet, palm, a mitt of fingers curled forward, and a thumb.
      fine(new THREE.CylinderGeometry(0.062, 0.055, 0.06, 14), glove, hand, 0, 0.03, 0);
      mesh(new RoundedBoxGeometry(0.075, 0.1, 0.045, 2, 0.018), glove, hand, 0, -0.04, 0.005);
      const fingers = fine(new RoundedBoxGeometry(0.072, 0.075, 0.035, 2, 0.015), glove, hand, 0, -0.105, 0.02);
      fingers.rotation.x = -0.45;
      fine(new THREE.CapsuleGeometry(0.014, 0.04, 4, 8), glove, hand, s * -0.035, -0.04, 0.03).rotation.set(-0.5, 0, s * 0.5);
      return { sh, el };
    };
    const la = arm(1);
    const ra = arm(-1);
    // A red band on the right arm, so you can tell left from right in cutscenes.
    fine(new THREE.CylinderGeometry(0.088, 0.088, 0.045, 16), red, ra.sh, 0, -0.12, 0);

    // Legs: hip -> thigh -> knee bellows -> shin -> ankle -> boot.
    const leg = (s: 1 | -1) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.11, 0.97, 0);
      this.body.add(hip);
      mesh(limb(0.11, 0.105, 0.085, 0.36), fabric, hip, 0, -0.04, 0);
      const kn = new THREE.Group();
      kn.position.y = -0.44;
      hip.add(kn);
      bellows(kn, fabric, 0.088, 0.035, detail ? 3 : 1, 0.028, mesh);
      mesh(limb(0.086, 0.082, 0.07, 0.3), fabric, kn, 0, -0.04, 0);
      const an = new THREE.Group();
      an.position.y = -0.38;
      kn.add(an);
      fine(new THREE.TorusGeometry(0.072, 0.016, 6, 18), grey, an, 0, 0.03, 0).rotation.x = Math.PI / 2;
      // Lunar overshoe: chunky upper, toe cap and a thick ribbed sole.
      mesh(new RoundedBoxGeometry(0.16, 0.12, 0.29, 3, 0.045), shell, an, 0, -0.03, 0.04);
      fine(new RoundedBoxGeometry(0.15, 0.06, 0.08, 2, 0.025), grey, an, 0, -0.05, 0.16);
      mesh(new RoundedBoxGeometry(0.17, 0.035, 0.31, 2, 0.012), dark, an, 0, -0.085, 0.04);
      return { hip, kn, an };
    };
    const ll = leg(1);
    const rl = leg(-1);
    this.hips = { l: ll.hip, r: rl.hip };
    this.knees = { l: ll.kn, r: rl.kn };
    this.ankles = { l: ll.an, r: rl.an };
    this.shoulders = { l: la.sh, r: ra.sh };
    this.elbows = { l: la.el, r: ra.el };
    this.apply(full('stand'));
  }

  /** Blend to a pose over `secs` seconds. */
  pose(p: Pose, secs = 0.6) {
    this.from = this.current();
    this.to = full(p);
    this.k = secs <= 0 ? 1 : 0;
    this.speed = secs > 0 ? 1 / secs : 1;
    if (secs <= 0) this.apply(this.to);
  }

  private current(): Joints {
    const e = this.k >= 1 ? 1 : this.k * this.k * (3 - 2 * this.k);
    return lerpJoints(this.from, this.to, e);
  }

  /** Places the astronaut with its feet at `pos`, facing `target` (or a yaw). */
  place(pos: THREE.Vector3, target: THREE.Vector3 | number) {
    this.root.position.copy(pos);
    this.root.rotation.y = typeof target === 'number' ? target : Math.atan2(target.x - pos.x, target.z - pos.z);
  }

  /** Advances the pose blend (cutscenes). */
  update(dt: number) {
    if (this.k < 1) this.k = Math.min(1, this.k + dt * this.speed);
    this.apply(this.current());
  }

  // ---------- gait (the shadow body in normal play) ----------
  private g = { ...STAND };
  private air = 0;
  private lope = 0;
  private moveAmt = 0;
  private landDip = 0;
  private landVel = 0;
  private bodyYaw: number | null = null;
  private idleT = 0;

  /** A landing: the knees soak it up. */
  land(fall: number) {
    this.landVel -= Math.min(1.2, 0.25 + fall * 0.12);
  }

  /**
   * Walks the body: `vel` is the world velocity (m/s), `viewYaw` the direction the player
   * faces (camera yaw: forward = -sin, -cos), `grounded` whether the feet are down.
   */
  gait(dt: number, vel: THREE.Vector3, viewYaw: number, grounded: boolean, sprinting: boolean) {
    const speed = Math.hypot(vel.x, vel.z);
    const fwdX = -Math.sin(viewYaw);
    const fwdZ = -Math.cos(viewYaw);
    const along = vel.x * fwdX + vel.z * fwdZ; // + forward, - backward
    const side = vel.x * -fwdZ + vel.z * fwdX; // + right
    // Strafing turns the hips toward the way you move (up to 70°), walking backward keeps facing ahead.
    let turn = 0;
    if (speed > 0.3) turn = THREE.MathUtils.clamp(Math.atan2(side, Math.abs(along)), -1.2, 1.2) * (along < -0.1 ? -1 : 1);
    const target = viewYaw + Math.PI - turn;
    if (this.bodyYaw === null) this.bodyYaw = target;
    let dy = target - this.bodyYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.bodyYaw += dy * (1 - Math.exp(-10 * dt));
    this.root.rotation.y = this.bodyYaw;

    this.moveAmt = smooth(this.moveAmt, grounded && speed > 0.15 ? Math.min(1, speed / 1.2) : 0, 8, dt);
    this.lope = smooth(this.lope, sprinting && speed > 2.2 ? 1 : 0, 4, dt);
    this.air = smooth(this.air, grounded ? 0 : 1, grounded ? 14 : 6, dt);
    // The stride clock runs on distance, so each step covers the ground the body moved.
    const stride = THREE.MathUtils.lerp(1.45, 2.4, this.lope);
    const dir = along < -0.1 ? -1 : 1;
    if (grounded) this.walkPhase += ((speed * dt) / stride) * Math.PI * 2 * dir;
    const p = this.walkPhase;
    const m = this.moveAmt;
    const s = Math.sin(p);
    const c = Math.cos(p);

    // Walk: legs swing opposite, the swinging knee bends, arms swing against the legs,
    // the body rises over the standing leg.
    const A = 0.5 * m;
    const walk: Joints = {
      ...STAND,
      root: (Math.abs(c) * 0.035 - 0.03) * m,
      lean: 0.08 * m,
      roll: s * 0.03 * m,
      twist: s * 0.07 * m,
      lHip: -A * s,
      rHip: A * s,
      lKnee: (0.08 + 0.75 * Math.max(0, c) ** 1.5) * m,
      rKnee: (0.08 + 0.75 * Math.max(0, -c) ** 1.5) * m,
      lAnkle: 0.25 * s * m,
      rAnkle: -0.25 * s * m,
      lSh: 0.05 + 0.75 * A * s,
      rSh: 0.05 - 0.75 * A * s,
      lElb: -0.3 - 0.25 * m,
      rElb: -0.3 - 0.25 * m,
    };
    // Lope: both feet push off nearly together and the body floats, leaning forward.
    const hop = Math.max(0, Math.sin(p));
    const lope: Joints = {
      ...STAND,
      root: hop * 0.12 - 0.05,
      lean: 0.28,
      head: -0.1,
      lHip: -0.55 * Math.sin(p + 0.35) - 0.1,
      rHip: -0.55 * Math.sin(p - 0.35) - 0.1,
      lKnee: 0.3 + 0.5 * Math.max(0, -Math.sin(p + 0.35)),
      rKnee: 0.3 + 0.5 * Math.max(0, -Math.sin(p - 0.35)),
      lAnkle: 0.3,
      rAnkle: 0.3,
      lSh: -0.35 - 0.2 * c,
      rSh: -0.35 - 0.2 * c,
      lElb: -0.8,
      rElb: -0.8,
      lOut: 0.35,
      rOut: 0.35,
    };
    // In the air: knees tucked, arms out for balance.
    const airborne: Joints = { ...STAND, lean: 0.12, lHip: -0.5, rHip: -0.3, lKnee: 0.9, rKnee: 0.7, lAnkle: 0.35, rAnkle: 0.3, lSh: -0.55, rSh: -0.4, lElb: -0.7, rElb: -0.6, lOut: 0.55, rOut: 0.5 };

    let j = lerpJoints(walk, lope, this.lope * m);
    j = lerpJoints(j, airborne, this.air);
    // Standing still: a slow breath.
    this.idleT += dt;
    j.lean += Math.sin(this.idleT * 1.6) * 0.012 * (1 - m);
    // Landing squat on a spring.
    this.landVel += (-this.landDip * 60 - this.landVel * 10) * dt;
    this.landDip += this.landVel * dt;
    const squat = Math.max(0, -this.landDip);
    j.root -= squat * 0.35;
    j.lKnee += squat * 1.6;
    j.rKnee += squat * 1.6;
    j.lHip -= squat * 0.8;
    j.rHip -= squat * 0.8;
    j.lAnkle += squat * 0.6;
    j.rAnkle += squat * 0.6;
    j.lean += squat * 0.4;
    // Smooth everything a little so transitions never pop.
    for (const key of KEYS) this.g[key] = smooth(this.g[key], j[key], 18, dt);
    this.apply(this.g);
  }

  private apply(j: Joints) {
    this.body.position.y = j.root;
    this.torso.rotation.set(j.lean, j.twist, j.roll);
    this.helmet.rotation.x = j.head;
    this.hips.l.rotation.x = j.lHip;
    this.hips.r.rotation.x = j.rHip;
    this.knees.l.rotation.x = j.lKnee;
    this.knees.r.rotation.x = j.rKnee;
    this.ankles.l.rotation.x = j.lAnkle;
    this.ankles.r.rotation.x = j.rAnkle;
    this.shoulders.l.rotation.set(j.lSh, 0, j.lOut);
    this.shoulders.r.rotation.set(j.rSh, 0, -j.rOut);
    this.elbows.l.rotation.x = j.lElb;
    this.elbows.r.rotation.x = j.rElb;
  }

  /** World position of the visor (for the cube camera and close-ups). */
  visorWorld(out = new THREE.Vector3()) {
    return this.visor.getWorldPosition(out);
  }
}
