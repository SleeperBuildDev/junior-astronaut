import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The player's own astronaut, built from simple shapes with a jointed skeleton so it can
// kneel, point, swing a golf club or drop a hammer in the discovery cutscenes. The gold
// visor is a mirror: on High it reflects the live scene (a cube camera), like the famous
// Apollo photos where you can see the world reflected in a helmet.
// In normal play an invisible copy follows the player and only casts a shadow.

/** Layer for meshes that should cast shadows but never be drawn (enable it on the shadow camera). */
export const SHADOW_LAYER = 1;

export type Pose = 'stand' | 'walk' | 'kneel' | 'point' | 'swingBack' | 'swingHit' | 'hold' | 'look';

interface Joints {
  root: number; // body height offset
  lean: number; // torso pitch (+ = forward)
  head: number; // helmet pitch (+ = look down)
  lHip: number;
  lKnee: number;
  rHip: number;
  rKnee: number;
  lSh: number;
  lElb: number;
  rSh: number;
  rElb: number;
  lOut: number; // arm sideways (+ = away from body)
  rOut: number;
  twist: number; // torso yaw
}

const STAND: Joints = { root: 0, lean: 0, head: 0, lHip: 0, lKnee: 0, rHip: 0, rKnee: 0, lSh: 0, lElb: -0.15, rSh: 0, rElb: -0.15, lOut: 0.18, rOut: 0.18, twist: 0 };
const POSES: Record<Pose, Partial<Joints>> = {
  stand: {},
  walk: {},
  look: { head: -0.35, lSh: -0.25, rSh: -0.25, lElb: -0.5, rElb: -0.5 },
  // Right knee on the ground, left foot forward, right hand reaching for the find.
  kneel: { root: -0.4, lean: 0.35, head: 0.45, lHip: -1.4, lKnee: 1.42, rHip: 0.15, rKnee: 1.55, rSh: -1.0, rElb: -0.5, rOut: 0.05, lSh: -0.5, lElb: -0.9, lOut: 0.35 },
  point: { head: -0.2, rSh: -2.3, rElb: -0.05, rOut: 0.1 },
  // Golf: both hands together on the club, wound up behind, then through the ball.
  swingBack: { root: -0.06, lean: 0.35, head: 0.5, lHip: -0.12, lKnee: 0.25, rHip: -0.12, rKnee: 0.25, twist: 0.9, lSh: -1.1, rSh: -1.1, lElb: -0.1, rElb: -0.3, lOut: -0.25, rOut: -0.25 },
  swingHit: { root: -0.06, lean: 0.3, head: 0.3, lHip: -0.12, lKnee: 0.2, rHip: -0.12, rKnee: 0.3, twist: -1.0, lSh: -1.3, rSh: -1.3, lElb: -0.05, rElb: -0.1, lOut: -0.3, rOut: -0.3 },
  // Arms out in front at shoulder height: hammer in the right hand, feather in the left.
  hold: { head: 0.15, lSh: -1.45, rSh: -1.45, lElb: -0.15, rElb: -0.15, lOut: 0.25, rOut: 0.25 },
};

function lerpJoints(a: Joints, b: Joints, k: number): Joints {
  const o = { ...a };
  for (const key of Object.keys(a) as (keyof Joints)[]) o[key] = a[key] + (b[key] - a[key]) * k;
  return o;
}
const full = (p: Pose): Joints => ({ ...STAND, ...POSES[p] });

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
  private shoulders: { l: THREE.Group; r: THREE.Group };
  private elbows: { l: THREE.Group; r: THREE.Group };
  private from: Joints = full('stand');
  private to: Joints = full('stand');
  private k = 1;
  private speed = 2;
  private walkPhase = 0;
  readonly materials: THREE.Material[] = [];

  /** shadowOnly: invisible to the camera but still casts a shadow (the player's own body). */
  constructor(opts: { shadowOnly?: boolean } = {}) {
    const fabric = new THREE.MeshStandardMaterial({ color: 0xeae7e0, roughness: 0.82, metalness: 0 });
    const grey = new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 0.6, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.5, metalness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x2f7fd8, roughness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc8382e, roughness: 0.6 });
    const visorMat = new THREE.MeshPhysicalMaterial({ color: 0xe0a640, metalness: 1, roughness: 0.035, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.02 });
    this.materials.push(fabric, grey, dark, accent, red, visorMat);

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = !opts.shadowOnly;
      // Shadow-only: on layer 1, which only the Sun's shadow camera renders.
      if (opts.shadowOnly) m.layers.set(SHADOW_LAYER);
      parent.add(m);
      return m;
    };
    const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);

    this.root.add(this.body);
    // Torso pivots at the hips (y 0.98).
    this.torso.position.y = 0.98;
    this.body.add(this.torso);
    const chest = mesh(capsule(0.23, 0.36), fabric, this.torso, 0, 0.36, 0);
    chest.scale.set(1.08, 1, 0.82);
    mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.16, 18), fabric, this.torso, 0, 0.02, 0); // waist bearing
    mesh(new THREE.TorusGeometry(0.215, 0.025, 8, 24), grey, this.torso, 0, 0.1, 0).rotation.x = Math.PI / 2;
    // Life-support backpack.
    mesh(new RoundedBoxGeometry(0.5, 0.64, 0.24, 3, 0.05), fabric, this.torso, 0, 0.42, -0.27);
    mesh(new RoundedBoxGeometry(0.42, 0.12, 0.05, 2, 0.02), grey, this.torso, 0, 0.62, -0.4);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10), grey, this.torso, 0.21, 0.4, -0.4);
    // Chest control box with buttons.
    const rcu = mesh(new RoundedBoxGeometry(0.26, 0.14, 0.1, 2, 0.02), grey, this.torso, 0, 0.36, 0.24);
    rcu.rotation.x = -0.15;
    mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 10), red, rcu, -0.07, 0, 0.055).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 10), accent, rcu, 0.0, 0, 0.055).rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), dark, rcu, 0.07, 0, 0.055);
    // Mission patch on the left shoulder area.
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 18), accent, this.torso, 0.17, 0.5, 0.17).rotation.set(Math.PI / 2 - 0.3, 0, 0.5);

    // Helmet: white shell, neck ring, gold visor, two lamps.
    this.helmet.position.y = 0.74;
    this.torso.add(this.helmet);
    mesh(new THREE.TorusGeometry(0.15, 0.03, 10, 28), grey, this.helmet, 0, -0.06, 0).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.2, 28, 20), fabric, this.helmet, 0, 0.1, -0.015);
    this.visor = mesh(new THREE.SphereGeometry(0.203, 32, 20, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.18, Math.PI * 0.52), visorMat, this.helmet, 0, 0.1, 0.02);
    this.visor.castShadow = false;
    const shield = mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 30, Math.PI), fabric, this.helmet, 0, 0.1, 0.0);
    shield.rotation.set(0, 0, 0);
    for (const s of [-1, 1]) {
      const lampBox = mesh(new RoundedBoxGeometry(0.06, 0.05, 0.08, 2, 0.01), grey, this.helmet, s * 0.2, 0.17, 0.05);
      mesh(new THREE.CircleGeometry(0.018, 14), new THREE.MeshBasicMaterial({ color: 0xfff4dd }), lampBox, 0, 0, 0.041);
    }
    this.lamp = new THREE.SpotLight(0xfff0d8, 0, 25, 0.45, 0.5, 1.4);
    // Hidden lights cost nothing; it is only switched on in cutscenes.
    this.lamp.visible = false;
    this.lamp.position.set(0, 0.17, 0.1);
    this.lamp.target.position.set(0, -0.4, 3);
    this.helmet.add(this.lamp, this.lamp.target);

    // Arms: shoulder -> elbow -> glove.
    const arm = (s: 1 | -1) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.3, 0.6, 0);
      this.torso.add(sh);
      mesh(new THREE.SphereGeometry(0.1, 16, 12), fabric, sh);
      mesh(capsule(0.075, 0.2), fabric, sh, 0, -0.17, 0);
      const el = new THREE.Group();
      el.position.y = -0.33;
      sh.add(el);
      mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16), grey, el, 0, 0.02, 0).rotation.x = Math.PI / 2;
      mesh(capsule(0.068, 0.2), fabric, el, 0, -0.15, 0);
      mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.04, 14), grey, el, 0, -0.29, 0);
      const hand = s === 1 ? this.lHand : this.rHand;
      hand.position.y = -0.36;
      el.add(hand);
      const glove = mesh(new THREE.SphereGeometry(0.065, 14, 10), dark, hand);
      glove.scale.set(0.85, 1.15, 0.7);
      return { sh, el };
    };
    const la = arm(1);
    const ra = arm(-1);
    // A red band on the right arm, so you can tell left from right in cutscenes.
    mesh(new THREE.CylinderGeometry(0.079, 0.079, 0.05, 14), red, ra.sh, 0, -0.08, 0);

    // Legs: hip -> knee -> boot.
    const leg = (s: 1 | -1) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.12, 0.98, 0);
      this.body.add(hip);
      mesh(capsule(0.1, 0.26), fabric, hip, 0, -0.2, 0);
      const kn = new THREE.Group();
      kn.position.y = -0.44;
      hip.add(kn);
      mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 16), grey, kn, 0, 0.02, 0).rotation.x = Math.PI / 2;
      mesh(capsule(0.088, 0.24), fabric, kn, 0, -0.18, 0);
      mesh(new RoundedBoxGeometry(0.17, 0.12, 0.3, 2, 0.04), grey, kn, 0, -0.4, 0.04);
      mesh(new RoundedBoxGeometry(0.18, 0.04, 0.32, 2, 0.015), dark, kn, 0, -0.47, 0.04);
      return { hip, kn };
    };
    const ll = leg(1);
    const rl = leg(-1);
    this.hips = { l: ll.hip, r: rl.hip };
    this.knees = { l: ll.kn, r: rl.kn };
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

  /** Advances the pose blend. `walkSpeed` (m/s) swings the arms and legs. */
  update(dt: number, walkSpeed = 0) {
    if (this.k < 1) this.k = Math.min(1, this.k + dt * this.speed);
    const j = this.current();
    if (walkSpeed > 0.15) {
      this.walkPhase += dt * (2.2 + walkSpeed * 0.9) * 0.5;
      const a = Math.sin(this.walkPhase * Math.PI) * Math.min(0.55, 0.2 + walkSpeed * 0.12);
      j.lHip += a;
      j.rHip -= a;
      j.lKnee += Math.max(0, -a) * 1.2;
      j.rKnee += Math.max(0, a) * 1.2;
      j.lSh -= a * 0.7;
      j.rSh += a * 0.7;
      j.lean += 0.08;
    }
    this.apply(j);
  }

  private apply(j: Joints) {
    this.body.position.y = j.root;
    this.torso.rotation.set(j.lean, j.twist, 0);
    this.helmet.rotation.x = j.head;
    this.hips.l.rotation.x = j.lHip;
    this.hips.r.rotation.x = j.rHip;
    this.knees.l.rotation.x = j.lKnee;
    this.knees.r.rotation.x = j.rKnee;
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
