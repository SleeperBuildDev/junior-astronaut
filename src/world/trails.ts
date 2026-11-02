import * as THREE from 'three';
import { heightAt, LAYOUT } from './heightfield';

// Rover tracks and boot-print trails pressed into the regolith along the routes the
// crew uses. With no wind or rain on the Moon, tracks like these last for millions
// of years: the Apollo footprints are still there.

function edgeFade() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.25, '#fff');
  grad.addColorStop(0.75, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function trailMaterial(diff: THREE.Texture, normal: THREE.Texture, alpha: THREE.Texture) {
  const mat = new THREE.MeshStandardMaterial({
    map: diff,
    normalMap: normal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    alphaMap: alpha,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // Same neutral grey as the terrain material.
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
       diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, 0.3) * 0.86;`,
    );
  };
  return mat;
}

/** A ground-hugging ribbon along a smooth path. */
function ribbon(points: THREE.Vector2[], width: number, texLength: number) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.y)));
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / 0.8));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(width / 2);
    for (const s of [-1, 1]) {
      const x = p.x + side.x * s;
      const z = p.z + side.z * s;
      pos.push(x, heightAt(x, z) + 0.025, z);
      uv.push(s < 0 ? 0 : 1, (t * len) / texLength);
    }
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export async function buildTrails() {
  const loader = new THREE.TextureLoader();
  const load = async (url: string, srgb: boolean) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const base = './assets/polyhaven/textures/';
  const [trackD, trackN, footD, footN] = await Promise.all([
    load(base + 'moon_track_01/moon_track_01_diff_1k.jpg', true),
    load(base + 'moon_track_01/moon_track_01_nor_gl_1k.jpg', false),
    load(base + 'moon_footprints_01/moon_footprints_01_diff_1k.jpg', true),
    load(base + 'moon_footprints_01/moon_footprints_01_nor_gl_1k.jpg', false),
  ]);
  const fade = edgeFade();
  const trackMat = trailMaterial(trackD, trackN, fade);
  const footMat = trailMaterial(footD, footN, fade);

  const B = LAYOUT.base;
  const L = LAYOUT.lander;
  const v = (x: number, z: number) => new THREE.Vector2(x, z);
  const group = new THREE.Group();
  group.name = 'trails';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    group.add(m);
  };

  // Rover tracks: landing site -> parking spot -> solar arrays
  add(ribbon([v(L.x - 8, L.z - 4), v(L.x - 14, L.z - 22), v(B.x - 6, B.z + 30), v(B.x - 9, B.z + 15)], 2.4, 2.4), trackMat);
  add(ribbon([v(B.x - 7, B.z + 10), v(B.x + 2, B.z + 18), v(B.x + 22, B.z + 6), v(B.x + 30, B.z - 14), v(B.x + 31, B.z - 31)], 2.4, 2.4), trackMat);
  // Boot prints: lander -> airlock, and out to each sensor
  add(ribbon([v(L.x - 4, L.z - 4), v(L.x - 10, L.z - 30), v(B.x - 4, B.z + 18), v(B.x - 8, B.z + 3), v(B.x - 8.5, B.z)], 1.0, 1.0), footMat);
  for (const s of LAYOUT.sensors) {
    const mid = v((s.x + B.x - 8) / 2 + 3, (s.z + B.z) / 2 - 2);
    add(ribbon([v(B.x - 8.5, B.z + 1), mid, v(s.x + 0.8, s.z + 0.8)], 0.9, 1.0), footMat);
  }
  add(ribbon([v(B.x - 8, B.z + 2), v(B.x - 2, B.z + 6), v(B.x + 4.6, B.z + 7.5)], 0.9, 1.0), footMat);
  return group;
}
