import * as THREE from 'three';
import { playNarration, sfx, stopVoices } from '../audio/audio';
import type { Outpost } from '../world/base';
import { statusMaterials } from '../world/base';
import { heightAt, LAYOUT, mulberry32 } from '../world/heightfield';
import { EARTH_DIR, SUN_DIR } from '../world/sky';
import { cinema } from './state';

// In-engine cutscenes: scripted camera moves over the live scene, with narration,
// subtitles and a few animated props (the lander's descent and its dust).

export interface Shot {
  dur: number;
  /** Positions the camera; t runs 0..1 over the shot. */
  cam: (t: number, cam: THREE.PerspectiveCamera) => void;
  sub?: string;
  caption?: string;
  /** Shows the gold "legendary discovery" title (secret finds). */
  gold?: boolean;
  vo?: string;
  start?: () => void;
  update?: (t: number, dt: number) => void;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ground = (x: number, z: number, h: number) => v(x, heightAt(x, z) + h, z);

/** A camera move between two positions and two look-at points. */
function move(fromPos: THREE.Vector3, toPos: THREE.Vector3, fromLook: THREE.Vector3, toLook: THREE.Vector3) {
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();
  return (t: number, cam: THREE.PerspectiveCamera) => {
    const k = ease(t);
    cam.position.lerpVectors(fromPos, toPos, k);
    cam.lookAt(l.lerpVectors(fromLook, toLook, k));
    void p;
  };
}

/** A circular move around a point. */
function orbit(center: THREE.Vector3, radius: number, height: number, a0: number, a1: number, lookY = 1.5) {
  const look = center.clone().add(v(0, lookY, 0));
  return (t: number, cam: THREE.PerspectiveCamera) => {
    const a = THREE.MathUtils.lerp(a0, a1, ease(t));
    const x = center.x + Math.cos(a) * radius;
    const z = center.z + Math.sin(a) * radius;
    cam.position.set(x, Math.max(heightAt(x, z) + 1.2, center.y + height), z);
    cam.lookAt(look);
  };
}

/**
 * Dust thrown up by the engine. On the Moon there is no air, so each grain flies on a
 * clean ballistic arc and falls back: no billowing cloud like on Earth.
 */
class DustBurst {
  readonly points: THREE.Points;
  private vel: Float32Array;
  private pos: Float32Array;
  private alive = 0;
  private origin = new THREE.Vector3();
  private rand = mulberry32(5);
  private spawned = 0;

  constructor(private count = 1400) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xb8b2a6, size: 0.24, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  reset(origin: THREE.Vector3) {
    this.origin.copy(origin);
    this.alive = 0;
    this.spawned = 0;
    this.points.visible = true;
  }

  /** strength 0..1: how hard the exhaust hits the ground. */
  update(dt: number, strength: number) {
    const toSpawn = Math.min(this.count - this.spawned, Math.floor(strength * 900 * dt));
    for (let i = 0; i < toSpawn; i++) {
      const k = this.spawned++;
      const a = this.rand() * Math.PI * 2;
      const r = 0.5 + this.rand() * 2;
      const sp = 5 + this.rand() * 14;
      this.pos.set([this.origin.x + Math.cos(a) * r, this.origin.y + 0.1, this.origin.z + Math.sin(a) * r], k * 3);
      this.vel.set([Math.cos(a) * sp, 0.6 + this.rand() * 2.6, Math.sin(a) * sp], k * 3);
      this.alive = Math.max(this.alive, k + 1);
    }
    for (let i = 0; i < this.alive; i++) {
      const j = i * 3;
      if (this.pos[j + 1] < -1000) continue;
      this.vel[j + 1] -= 1.62 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < this.origin.y - 0.4 && this.vel[j + 1] < 0) this.pos[j + 1] = -2000; // landed
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  hide() {
    this.points.visible = false;
  }
}

export class CutscenePlayer {
  private shots: Shot[] | null = null;
  private i = 0;
  private t = 0;
  private onDone: () => void = () => {};

  get playing() {
    return this.shots !== null;
  }

  play(shots: Shot[], onDone: () => void) {
    this.shots = shots;
    this.onDone = onDone;
    this.i = -1;
    this.next();
  }

  private next() {
    this.i++;
    this.t = 0;
    const s = this.shots?.[this.i];
    if (!s) return this.finish();
    cinema.value = { sub: s.sub ?? null, caption: s.caption ?? null, gold: !!s.gold };
    s.start?.();
    if (s.vo) void playNarration(s.vo);
  }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    const s = this.shots?.[this.i];
    if (!s) return;
    this.t += dt;
    const k = Math.min(1, this.t / s.dur);
    s.update?.(k, dt);
    s.cam(k, cam);
    if (k >= 1) this.next();
  }

  skip() {
    if (!this.shots) return;
    stopVoices();
    // Run every remaining shot's start/end state so props end up where they belong.
    for (let j = Math.max(this.i, 0); j < this.shots.length; j++) {
      const s = this.shots[j];
      if (j > this.i) s.start?.();
      s.update?.(1, 0);
    }
    this.finish();
  }

  private finish() {
    this.shots = null;
    cinema.value = { sub: null, caption: null, gold: false };
    this.onDone();
  }
}

/** Builds the game's cutscenes over the live scene. */
export function buildCutscenes(scene: THREE.Scene, outpost: Outpost, start: { pos: THREE.Vector3; yaw: number }) {
  const L = LAYOUT.lander;
  const B = LAYOUT.base;
  const lander = outpost.lander;
  const restY = lander.position.y;
  const pad = v(L.x, restY, L.z);

  // Descent engine glow (real lunar landers' exhaust is almost invisible, so it is subtle).
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 4, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  flame.rotation.x = Math.PI;
  flame.position.y = -1.2;
  flame.visible = false;
  lander.add(flame);
  const dust = new DustBurst();
  scene.add(dust.points);

  const landerAlt = (k: number) => restY + 75 * Math.pow(1 - k, 2.2);

  const intro: Shot[] = [
    {
      dur: 6,
      caption: 'cs.caption.site',
      sub: 'cs.intro_1',
      vo: 'cs_intro_1',
      start: () => {
        lander.position.y = restY + 75;
        flame.visible = true;
      },
      cam: move(v(70, 45, 150), v(55, 30, 125), v(70, 45, 150).addScaledVector(EARTH_DIR, 100), v(L.x, restY + 20, L.z)),
    },
    {
      dur: 10,
      sub: 'cs.intro_2',
      vo: 'cs_intro_2',
      start: () => sfx('powerup'),
      update: (k, dt) => {
        lander.position.y = landerAlt(k);
        flame.scale.setScalar(0.8 + Math.sin(k * 90) * 0.08);
        const alt = lander.position.y - restY;
        if (alt < 14) {
          if (!dust.points.visible) dust.reset(pad);
          dust.update(dt, 1 - alt / 14);
        }
      },
      cam: (k, cam) => {
        cam.position.copy(ground(L.x + 34, L.z + 26, 2.2));
        cam.lookAt(L.x, landerAlt(k) + 1, L.z);
      },
    },
    {
      dur: 7,
      sub: 'cs.intro_3',
      vo: 'cs_intro_3',
      start: () => {
        lander.position.y = restY;
        flame.visible = false;
        sfx('clunk');
      },
      update: (_k, dt) => dust.update(dt, 0),
      cam: orbit(pad, 16, 3, 0.9, 1.9, 2.5),
    },
    {
      dur: 4.5,
      sub: 'cs.intro_4',
      vo: 'cs_intro_4',
      start: () => {
        const camEnd = start.pos.clone().add(v(0, 1.62, 0));
        const lookEnd = camEnd.clone().add(v(-Math.sin(start.yaw), 0, -Math.cos(start.yaw)));
        intro[3].cam = move(v(L.x + 5, restY + 3.5, L.z + 6), camEnd, v(L.x, restY + 2.5, L.z), lookEnd);
      },
      update: (k, dt) => {
        dust.update(dt, 0);
        if (k >= 1) dust.hide();
      },
      cam: () => {},
    },
  ];

  const hab = outpost.habitatPos;
  const m1End: Shot[] = [
    {
      dur: 9,
      sub: 'cs.m1_end',
      vo: 'cs_m1_end',
      start: () => sfx('airlock'),
      update: (k) => {
        if (k > 0.45) outpost.airlockLight.material = statusMaterials.green;
      },
      cam: orbit(hab, 20, 5, 2.4, 3.6, 2.5),
    },
  ];

  const ls = outpost.lifeSupport.pos;
  const red = () => {
    const l = outpost.lifeSupport.lights;
    l.o2.material = l.water.material = statusMaterials.red;
    l.co2.material = statusMaterials.green;
  };
  const m2Intro: Shot[] = [
    {
      dur: 7,
      sub: 'cs.m2_intro_1',
      vo: 'cs_m2_intro_1',
      start: red,
      cam: move(v(B.x - 12, hab.y + 3.5, B.z + 9), v(B.x + 4, hab.y + 3.5, B.z + 10), v(B.x - 4, hab.y + 3, B.z), v(B.x + 6, hab.y + 3, B.z)),
    },
    {
      dur: 5,
      sub: 'cs.m2_intro_2',
      vo: 'cs_m2_intro_2',
      cam: move(v(ls.x + 2, ls.y + 3, ls.z + 9), v(ls.x + 0.5, ls.y + 2, ls.z + 4.5), v(ls.x, ls.y + 1.2, ls.z), v(ls.x, ls.y + 1.2, ls.z)),
    },
  ];

  const m2End: Shot[] = [
    {
      dur: 10,
      sub: 'cs.m2_end',
      vo: 'cs_m2_end',
      start: () => sfx('powerup'),
      cam: (k, cam) => {
        // Crane up and back from the life support unit to a wide view of the outpost under Earth.
        const e = ease(k);
        cam.position.set(ls.x + 4 + e * 26, ls.y + 2 + e * 20, ls.z + 6 + e * 34);
        const look = new THREE.Vector3(ls.x, ls.y + 1, ls.z).lerp(new THREE.Vector3(B.x, hab.y + 6, B.z - 10), e);
        cam.lookAt(look);
      },
    },
  ];

  const pw = outpost.power;
  const bat = pw.batteryPos;
  const t0 = outpost.arrays[0].pos;
  const t1 = outpost.arrays[1].pos;
  const m3Intro: Shot[] = [
    {
      dur: 8.8,
      sub: 'cs.m3_intro_1',
      vo: 'cs_m3_intro_1',
      // Push in on the battery bank from the south-west, its charge bars glowing red.
      cam: move(
        bat.clone().addScaledVector(pw.batteryFront, 4).add(v(0, 1.6, 6)),
        bat.clone().addScaledVector(pw.batteryFront, 3).add(v(0, 0.3, 1.5)),
        bat.clone(),
        bat.clone().add(v(0, -0.1, 0)),
      ),
    },
    {
      dur: 7.4,
      sub: 'cs.m3_intro_2',
      vo: 'cs_m3_intro_2',
      // A low orbit around a folded solar tower.
      cam: orbit(t0, 9, 1.2, 2.2, 3.1, 4),
    },
  ];

  const m3End: Shot[] = [
    {
      dur: 11,
      sub: 'cs.m3_end',
      vo: 'cs_m3_end',
      start: () => sfx('powerup'),
      cam: (k, cam) => {
        // From under a tower looking up at its panels, crane back to see all three in the sunlight.
        const e = ease(k);
        cam.position.set(t1.x - 4 - e * 26, t1.y + 1.6 + e * 13, t1.z + 5 + e * 22);
        const look = new THREE.Vector3(t1.x, t1.y + 8, t1.z).lerp(new THREE.Vector3((t0.x + t1.x) / 2, t0.y + 5, (t0.z + t1.z) / 2 - 6), e);
        cam.lookAt(look);
      },
    },
  ];

  const h2 = outpost.hab2.center;
  const m4Intro: Shot[] = [
    {
      dur: 7,
      sub: 'cs.m4_intro_1',
      vo: 'cs_m4_intro_1',
      // A slow orbit around the small lander the crew has been sleeping in.
      cam: orbit(pad, 13, 2.5, 4.0, 4.9, 3),
    },
    {
      dur: 8,
      sub: 'cs.m4_intro_2',
      vo: 'cs_m4_intro_2',
      // Low push in over the build pad to the packed module.
      cam: move(v(h2.x - 9, h2.y + 1.6, h2.z + 9), v(h2.x - 4.5, h2.y + 2.2, h2.z + 2.5), v(h2.x, h2.y + 2.4, h2.z - 2.5), v(h2.x, h2.y + 3, h2.z - 3)),
    },
  ];

  const m4End: Shot[] = [
    {
      dur: 11,
      sub: 'cs.m4_end',
      vo: 'cs_m4_end',
      // Around the new module, its windows glowing, rising to see the whole outpost.
      cam: (k, cam) => {
        const e = ease(k);
        const a = 1.2 + e * 1.5;
        const r = 12 + e * 14;
        const x = h2.x + Math.cos(a) * r;
        const z = h2.z + Math.sin(a) * r;
        cam.position.set(x, Math.max(heightAt(x, z) + 1.4, h2.y + 2 + e * 9), z);
        cam.lookAt(h2.x - e * 4, h2.y + 3, h2.z - e * 6);
      },
    },
  ];

  const gh = outpost.greenhouse.center;
  const m5Intro: Shot[] = [
    {
      dur: 7.5,
      sub: 'cs.m5_intro_1',
      vo: 'cs_m5_intro_1',
      // The new habitat at breakfast time, windows lit.
      cam: orbit(h2, 11, 1.5, 0.3, 1.0, 3),
    },
    {
      dur: 7.5,
      sub: 'cs.m5_intro_2',
      vo: 'cs_m5_intro_2',
      // Over the empty greenhouse pad north of the lab.
      cam: move(v(gh.x - 10, gh.y + 5, gh.z + 6), v(gh.x - 6, gh.y + 2.5, gh.z - 2), v(gh.x, gh.y + 1, gh.z + 3), v(gh.x, gh.y + 1.2, gh.z)),
    },
  ];

  const m5End: Shot[] = [
    {
      dur: 11,
      sub: 'cs.m5_end',
      vo: 'cs_m5_end',
      // Along the greenhouse's glowing windows, then up over the outpost.
      cam: (k, cam) => {
        const e = ease(k);
        cam.position.set(gh.x - 5 - e * 10, gh.y + 1.8 + e * 10, gh.z + 4 - e * 2 + e * 16);
        cam.lookAt(gh.x, gh.y + 2.6 - e * 0.5, gh.z - 1 + e * 8);
      },
    },
  ];

  const m6Intro: Shot[] = [
    {
      dur: 7.5,
      sub: 'cs.m6_intro_1',
      vo: 'cs_m6_intro_1',
      // A high, slow pass over the finished outpost.
      cam: move(v(B.x - 30, hab.y + 18, B.z + 30), v(B.x - 10, hab.y + 12, B.z + 34), v(B.x, hab.y + 2, B.z - 4), v(B.x + 4, hab.y + 2, B.z - 6)),
    },
    {
      dur: 8,
      sub: 'cs.m6_intro_2',
      vo: 'cs_m6_intro_2',
      // From the habitat roof, tilt up toward the low Sun.
      cam: (k, cam) => {
        const e = ease(k);
        cam.position.set(B.x - 6, hab.y + 6.5, B.z + 6);
        const look = new THREE.Vector3(B.x, hab.y + 3, B.z).lerp(cam.position.clone().addScaledVector(SUN_DIR, 100), e);
        cam.lookAt(look);
      },
    },
  ];

  const m6End: Shot[] = [
    {
      dur: 11,
      sub: 'cs.m6_end',
      vo: 'cs_m6_end',
      // Around HAB-2, now under its regolith berms, windows glowing.
      cam: orbit(h2, 15, 4, 2.2, 3.6, 2),
    },
  ];

  const rv = outpost.rover;
  const siteC = outpost.science.sites[2].pos;
  const m7Intro: Shot[] = [
    {
      dur: 7.5,
      sub: 'cs.m7_intro_1',
      vo: 'cs_m7_intro_1',
      // Around the parked rover, charged and ready.
      cam: (k, cam) => orbit(rv.position, 7, 1.2, 0.6, 1.6, 1)(k, cam),
    },
    {
      dur: 8.5,
      sub: 'cs.m7_intro_2',
      vo: 'cs_m7_intro_2',
      // Out over the plain toward the deep crater, its floor lost in shadow.
      cam: move(
        v(siteC.x - 60, siteC.y + 22, siteC.z + 60),
        v(siteC.x - 18, siteC.y + 10, siteC.z + 14),
        v(siteC.x - 20, siteC.y - 8, siteC.z - 10),
        v(siteC.x - 60, siteC.y - 14, siteC.z - 4),
      ),
    },
  ];

  const lab = outpost.science.labPortPos;
  const m7End: Shot[] = [
    {
      dur: 11,
      sub: 'cs.m7_end',
      vo: 'cs_m7_end',
      // Rise from the lab's sample port to a view across the plain to the far crater.
      cam: (k, cam) => {
        const e = ease(k);
        cam.position.set(lab.x - 5 - e * 14, lab.y + 1 + e * 14, lab.z + 4 + e * 18);
        cam.lookAt(new THREE.Vector3(lab.x, lab.y + 1, lab.z).lerp(new THREE.Vector3(siteC.x, siteC.y, siteC.z), e * 0.6));
      },
    },
  ];

  const tower = outpost.arrays[1].pos;
  const pump = outpost.emergency.pumpPos;
  const m8Intro: Shot[] = [
    {
      dur: 8,
      sub: 'cs.m8_intro_1',
      vo: 'cs_m8_intro_1',
      // A calm, slow pass over the busy outpost.
      cam: orbit(hab, 34, 13, 2.4, 1.6, 2),
    },
    {
      dur: 8.5,
      sub: 'cs.m8_intro_2',
      vo: 'cs_m8_intro_2',
      // Low under the solar towers, looking up at the panels against the black sky.
      cam: move(v(tower.x - 14, tower.y + 1.8, tower.z + 12), v(tower.x - 6, tower.y + 1.4, tower.z + 6), v(tower.x, tower.y + 4, tower.z), v(tower.x, tower.y + 9, tower.z)),
    },
  ];

  const m8End: Shot[] = [
    {
      dur: 11.5,
      sub: 'cs.m8_end',
      vo: 'cs_m8_end',
      // From the repaired cooling pumps, rise to see the whole outpost working again.
      cam: (k, cam) => {
        const e = ease(k);
        cam.position.set(pump.x - 4 + e * 6, pump.y + 0.6 + e * 18, pump.z + 5 + e * 22);
        cam.lookAt(new THREE.Vector3(pump.x, pump.y, pump.z).lerp(new THREE.Vector3(hab.x, hab.y + 2, hab.z), e));
      },
    },
  ];

  const m9Intro: Shot[] = [
    {
      dur: 8.5,
      sub: 'cs.m9_intro_1',
      vo: 'cs_m9_intro_1',
      // A wide, high circle over the whole finished outpost.
      cam: orbit(hab, 46, 20, 0.8, 2.0, 1),
    },
    {
      dur: 8.5,
      sub: 'cs.m9_intro_2',
      vo: 'cs_m9_intro_2',
      // From behind the habitat, tilt up from the modules to Earth low on the horizon.
      cam: (k, cam) => {
        const e = ease(k);
        cam.position.set(hab.x + 9 - EARTH_DIR.x * 14, hab.y + 3 + e * 2, hab.z + 4 - EARTH_DIR.z * 14);
        const toEarth = cam.position.clone().addScaledVector(EARTH_DIR, 200);
        cam.lookAt(new THREE.Vector3(hab.x, hab.y + 2, hab.z).lerp(toEarth, e));
      },
    },
  ];

  const m9End: Shot[] = [
    {
      dur: 13,
      sub: 'cs.m9_end',
      vo: 'cs_m9_end',
      // A slow rise over the living outpost, ending on Earth above the horizon.
      cam: (k, cam) => {
        const e = ease(k);
        cam.position.set(hab.x - 20 + e * 6, hab.y + 4 + e * 26, hab.z + 26 + e * 10);
        const toEarth = cam.position.clone().addScaledVector(EARTH_DIR, 300);
        cam.lookAt(new THREE.Vector3(hab.x, hab.y + 1, hab.z).lerp(toEarth, Math.max(0, e - 0.35) / 0.65));
      },
    },
  ];

  return { intro, m1End, m2Intro, m2End, m3Intro, m3End, m4Intro, m4End, m5Intro, m5End, m6Intro, m6End, m7Intro, m7End, m8Intro, m8End, m9Intro, m9End };
}
