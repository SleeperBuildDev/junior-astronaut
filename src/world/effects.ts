import * as THREE from 'three';
import { heightAt } from './heightfield';

// Marks you leave on the Moon: boot prints and rover tracks pressed into the regolith,
// and dust kicked up by boots and wheels. With no air, every dust grain flies on a clean
// ballistic arc and drops straight back down: no drifting cloud like on Earth.

/** Boot print: a sole outline with the ribbed tread of an Apollo-style overshoe. */
function bootTextures() {
  const W = 64;
  const H = 128;
  const height = document.createElement('canvas');
  height.width = W;
  height.height = H;
  const g = height.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  // Sole shape: wide toe, narrow waist, round heel.
  const sole = new Path2D();
  sole.ellipse(W / 2, 34, 24, 30, 0, 0, Math.PI * 2);
  sole.ellipse(W / 2, 96, 19, 26, 0, 0, Math.PI * 2);
  sole.rect(W / 2 - 18, 34, 36, 62);
  g.save();
  g.clip(sole);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  // Tread ribs: raised soil between the grooves.
  g.fillStyle = '#c4c4c4';
  for (let y = 6; y < H; y += 9) g.fillRect(0, y, W, 4);
  g.restore();
  const img = g.getImageData(0, 0, W, H).data;
  const hAt = (x: number, y: number) => img[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4] / 255;

  // Normal map from the depth image, and a colour map (pressed soil is darker).
  const nCanvas = document.createElement('canvas');
  nCanvas.width = W;
  nCanvas.height = H;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = W;
  cCanvas.height = H;
  const nd = nCanvas.getContext('2d')!.createImageData(W, H);
  const cd = cCanvas.getContext('2d')!.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 2.2;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      // The print is a dip, so the slopes point inward.
      nd.data[i] = ((dx / l) * 0.5 + 0.5) * 255;
      nd.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      nd.data[i + 2] = (1 / l) * 255;
      nd.data[i + 3] = 255;
      const d = hAt(x, y);
      const v = 255 * (1 - d * 0.2);
      cd.data[i] = cd.data[i + 1] = cd.data[i + 2] = v;
      // Edges fade softly into the untouched ground.
      cd.data[i + 3] = Math.min(255, d * 255 * 1.6 + Math.hypot(dx, dy) * 300);
    }
  nCanvas.getContext('2d')!.putImageData(nd, 0, 0);
  cCanvas.getContext('2d')!.putImageData(cd, 0, 0);
  const normal = new THREE.CanvasTexture(nCanvas);
  const color = new THREE.CanvasTexture(cCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  return { normal, color };
}

/** Rover tread: a band of chevrons pressed by a wire-mesh wheel. */
function treadTextures() {
  const W = 64;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.15, 'rgba(0,0,0,1)');
  grad.addColorStop(0.85, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(70,70,70,1)';
  for (let y = -16; y < H + 16; y += 12) {
    g.beginPath();
    g.moveTo(6, y + 8);
    g.lineTo(W / 2, y);
    g.lineTo(W - 6, y + 8);
    g.lineTo(W - 6, y + 13);
    g.lineTo(W / 2, y + 5);
    g.lineTo(6, y + 13);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A ring buffer of flat decals (instanced) that hug the ground. */
class Decals {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();
  private n = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private yawQ = new THREE.Quaternion();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly max: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, max));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
  }

  /** Presses one decal at (x, z), turned to `yaw`, tilted to the ground slope. */
  add(x: number, z: number, yaw: number) {
    if (this.max <= 0) return;
    const h = heightAt(x, z);
    const e = 0.25;
    this.n.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
    this.yawQ.setFromAxisAngle(this.up, yaw);
    this.q.setFromUnitVectors(this.up, this.n).multiply(this.yawQ);
    this.p.set(x, h + 0.012, z);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.next, this.m);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.mesh.count = 0;
    this.next = 0;
  }
}

/** Ballistic dust grains in one draw call. */
class Dust {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private floor: Float32Array;
  private alpha: Float32Array;
  private next = 0;

  constructor(readonly max: number) {
    const n = Math.max(1, max);
    this.pos = new Float32Array(n * 3).fill(-9999);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.floor = new Float32Array(n);
    this.alpha = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0x9c978d) }, scale: { value: 420 } },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        uniform float scale;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(scale * 0.05 / -mv.z, 1.0, 24.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25) discard;
          gl_FragColor = vec4(color, vAlpha * (1.0 - d * 3.6));
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  /** Throws `count` grains from (x, y, z) roughly along (dx, dz), `speed` m/s. */
  kick(x: number, y: number, z: number, dx: number, dz: number, count: number, speed: number, spread = 1, up = 1) {
    for (let i = 0; i < count && this.max > 0; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 2.4 * spread;
      const sp = speed * (0.35 + Math.random() * 0.9);
      this.pos[k * 3] = x + (Math.random() - 0.5) * 0.2;
      this.pos[k * 3 + 1] = y + 0.03;
      this.pos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
      this.vel[k * 3] = Math.cos(a) * sp;
      this.vel[k * 3 + 1] = (0.3 + Math.random() * 0.9) * speed * 0.8 * up;
      this.vel[k * 3 + 2] = Math.sin(a) * sp;
      this.floor[k] = y;
      this.life[k] = 1;
      this.alpha[k] = 0.55 + Math.random() * 0.35;
    }
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      const j = i * 3;
      this.vel[j + 1] -= 1.62 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < this.floor[i] && this.vel[j + 1] < 0) {
        // Landed: it settles back into the soil.
        this.life[i] = 0;
        this.alpha[i] = 0;
        this.pos[j + 1] = -9999;
      }
    }
    if (any || this.dirty) {
      (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.points.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    }
    this.dirty = any;
  }
  private dirty = false;

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.pos.fill(-9999);
    this.dirty = true;
  }
}

export type Detail = 'low' | 'medium' | 'high';
const LIMITS: Record<Detail, { prints: number; tracks: number; dust: number }> = {
  low: { prints: 80, tracks: 120, dust: 300 },
  medium: { prints: 260, tracks: 400, dust: 900 },
  high: { prints: 700, tracks: 1000, dust: 2400 },
};

/** Footprints, rover tracks and dust, sized for the quality preset. */
export function buildGroundEffects(detail: Detail) {
  const lim = LIMITS[detail];
  const boot = bootTextures();
  const footMat = new THREE.MeshStandardMaterial({
    map: boot.color,
    normalMap: boot.normal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    color: 0x9a958d,
    roughness: 1,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const footGeo = new THREE.PlaneGeometry(0.17, 0.34).rotateX(-Math.PI / 2);
  const prints = new Decals(footGeo, footMat, lim.prints);

  const treadMap = treadTextures();
  const trackMat = new THREE.MeshStandardMaterial({
    color: 0x4a4844,
    alphaMap: treadMap,
    transparent: true,
    opacity: 0.55,
    roughness: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const trackGeo = new THREE.PlaneGeometry(0.26, 0.62).rotateX(-Math.PI / 2);
  const tracks = new Decals(trackGeo, trackMat, lim.tracks);

  const dust = new Dust(lim.dust);
  const group = new THREE.Group();
  group.name = 'groundfx';
  group.add(prints.mesh, tracks.mesh, dust.points);

  const many = detail === 'high' ? 1.6 : detail === 'medium' ? 1 : 0.5;
  let foot = 1;
  let lastTrack: THREE.Vector3 | null = null;
  return {
    group,
    dust,
    /** One footfall at the feet, walking toward `yaw` (camera yaw: forward = -sin, -cos). */
    step(feet: THREE.Vector3, yaw: number, strength: number) {
      foot = -foot;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      // Left and right boots sit 12 cm either side of the walking line.
      const x = feet.x + fz * 0.12 * foot * -1;
      const z = feet.z - fx * 0.12 * foot * -1;
      prints.add(x, z, yaw);
      dust.kick(x, heightAt(x, z), z, fx, fz, Math.round(10 * many * strength), 1.1 + strength * 0.9, 0.7);
    },
    /** A landing after a jump: a ring of dust. */
    land(feet: THREE.Vector3, fall: number) {
      const n = Math.round(Math.min(60, 14 + fall * 8) * many);
      for (let i = 0; i < 2; i++) dust.kick(feet.x, heightAt(feet.x, feet.z), feet.z, 1, 0, n / 2, 1 + Math.min(2, fall * 0.4), 3, 0.6);
    },
    /** Rover wheels (rover yaw: forward = +X turned by yaw): tracks every half metre and rooster tails of dust. */
    roll(pos: THREE.Vector3, yaw: number, speed: number, dt: number) {
      const fx = Math.cos(yaw);
      const fz = -Math.sin(yaw);
      const sx = fz;
      const sz = -fx;
      if (!lastTrack || Math.hypot(pos.x - lastTrack.x, pos.z - lastTrack.z) > 0.5) {
        for (const s of [-0.92, 0.92]) tracks.add(pos.x + sx * s, pos.z + sz * s, yaw + Math.PI / 2);
        lastTrack = pos.clone();
      }
      const sp = Math.abs(speed);
      if (sp < 0.4) return;
      const back = speed > 0 ? -1 : 1;
      const n = Math.max(0, Math.round(sp * 26 * many * dt + Math.random()));
      for (const s of [-0.92, 0.92])
        for (const w of [-1.1, 1.1]) {
          const x = pos.x + sx * s + fx * w;
          const z = pos.z + sz * s + fz * w;
          dust.kick(x, heightAt(x, z), z, fx * back, fz * back, n, 0.8 + sp * 0.55, 0.35, 1.2);
        }
    },
    update(dt: number) {
      dust.update(dt);
    },
    /** QA: how many prints and track marks are down. */
    counts: () => ({ prints: prints.mesh.count, tracks: tracks.mesh.count }),
    clear() {
      prints.clear();
      tracks.clear();
      dust.clear();
      lastTrack = null;
    },
  };
}
export type GroundEffects = ReturnType<typeof buildGroundEffects>;
