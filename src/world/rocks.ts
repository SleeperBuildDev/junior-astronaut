import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ColliderSpec } from './base';
import { heightAt, LAYOUT, mulberry32 } from './heightfield';

const ROCKS = ['moon_rock_01', 'moon_rock_03', 'moon_rock_05', 'moon_rock_07'];

/** Pick one LOD mesh from a Poly Haven rock (each file holds LOD0-LOD3). */
function pickLod(scene: THREE.Object3D, rank: number) {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  meshes.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
  return meshes[Math.min(rank, meshes.length - 1)];
}

export async function buildRocks(count: number) {
  const loader = new GLTFLoader();
  const sources = await Promise.all(ROCKS.map((r) => loader.loadAsync(`./assets/polyhaven/models/${r}/${r}_1k.gltf`)));
  const group = new THREE.Group();
  group.name = 'rocks';
  const colliders: ColliderSpec[] = [];
  const rand = mulberry32(7);
  const clear = [
    { ...LAYOUT.base, r: 36 },
    { ...LAYOUT.lander, r: 16 },
    ...LAYOUT.sensors.map((s) => ({ ...s, r: 4 })),
    { x: 34, z: -39, r: 22 },
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  // Each rock type is drawn twice: a few shadow-casting boulders from a detailed LOD,
  // and many small stones from the lightest LOD without shadows (cheap on iGPUs).
  const layers = [
    { lod: 1, count: Math.round(count * 0.08), big: true },
    { lod: 3, count: Math.round(count * 0.92), big: false },
  ];
  sources.forEach((gltf, k) => {
    for (const layer of layers) {
      const src = pickLod(gltf.scene, layer.lod);
      const geo = src.geometry.clone();
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      // Normalise to a 1 m rock resting on y = 0.
      const norm = 1 / Math.max(size.x, size.y, size.z);
      geo.translate(-center.x, -box.min.y, -center.z);
      geo.scale(norm, norm, norm);
      const mat = (src.material as THREE.MeshStandardMaterial).clone();
      mat.color.setRGB(0.78, 0.77, 0.75);

      const perType = Math.floor(layer.count / sources.length);
      const inst = new THREE.InstancedMesh(geo, mat, perType);
      inst.castShadow = layer.big;
      inst.receiveShadow = true;
      let n = 0;
      let tries = 0;
      while (n < perType && tries++ < perType * 20) {
        // Denser near the outpost, thinning out towards the mission boundary.
        const dist = 5 + Math.pow(rand(), 1.7) * 360;
        const ang = rand() * Math.PI * 2;
        const x = LAYOUT.base.x + Math.cos(ang) * dist;
        const z = LAYOUT.base.z + Math.sin(ang) * dist;
        if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
        const sc = layer.big ? 1.1 + Math.pow(rand(), 1.5) * 3.4 : 0.1 + Math.pow(rand(), 2.2) * 0.8;
        s.set(sc * (0.8 + rand() * 0.4), sc * (0.6 + rand() * 0.5), sc * (0.8 + rand() * 0.4));
        q.setFromEuler(new THREE.Euler(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4));
        p.set(x, heightAt(x, z) - s.y * 0.22, z);
        m.compose(p, q, s);
        inst.setMatrixAt(n++, m);
        if (sc > 0.5) colliders.push({ kind: 'ball', center: new THREE.Vector3(x, p.y + s.y * 0.35, z), radius: Math.max(s.x, s.z) * 0.42 });
      }
      inst.count = n;
      inst.computeBoundingSphere();
      inst.name = `rocks-${k}-${layer.big ? 'big' : 'small'}`;
      group.add(inst);
    }
  });
  return { group, colliders };
}
