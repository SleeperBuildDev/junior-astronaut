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
  // Rocks 03/05/07 come with one detailed mesh only, so simplified copies (made with
  // gltfpack) are used for the scattered boulders and pebbles. Rock 01 has its own LODs.
  const firstMesh = (o: THREE.Object3D) => {
    let found: THREE.Mesh | null = null;
    o.traverse((c) => {
      if (!found && (c as THREE.Mesh).isMesh) found = c as THREE.Mesh;
    });
    return found as THREE.Mesh | null;
  };
  const simple = await Promise.all(
    ROCKS.map(async (r) =>
      r === 'moon_rock_01'
        ? null
        : Promise.all(['big', 'small'].map((k) => loader.loadAsync(`./assets/polyhaven/models/${r}/${r}_${k}.glb`).then((g) => firstMesh(g.scene)!))),
    ),
  );
  const group = new THREE.Group();
  group.name = 'rocks';
  const colliders: ColliderSpec[] = [];
  const rand = mulberry32(7);
  const clear = [
    { ...LAYOUT.base, r: 36 },
    { ...LAYOUT.lander, r: 16 },
    ...LAYOUT.sensors.map((s) => ({ ...s, r: 4 })),
    { x: 34, z: -39, r: 22 },
    ...LAYOUT.sites.map((s) => ({ ...s, r: 9 })),
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  // Each rock type is drawn twice: a few shadow-casting boulders from a detailed LOD,
  // and many small stones from the lightest LOD without shadows (cheap on iGPUs).
  const layers = [
    { lod: 2, count: Math.round(count * 0.08), big: true },
    { lod: 3, count: Math.round(count * 0.92), big: false },
  ];
  sources.forEach((gltf, k) => {
    for (const layer of layers) {
      const detailed = pickLod(gltf.scene, 0);
      const lite = simple[k];
      const src = lite ? lite[layer.big ? 0 : 1] : pickLod(gltf.scene, layer.lod);
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
      const mat = (detailed.material as THREE.MeshStandardMaterial).clone();
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
  // Mission 7 site B: a big boulder thrown out by the impact that made the landmark crater.
  const bs = LAYOUT.sites[1];
  const bSrc = pickLod(sources[1].scene, 1);
  const bGeo = bSrc.geometry.clone();
  bGeo.computeBoundingBox();
  const bb = bGeo.boundingBox!;
  const bSize = new THREE.Vector3();
  bb.getSize(bSize);
  const bNorm = 4.4 / Math.max(bSize.x, bSize.y, bSize.z);
  bGeo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  bGeo.scale(bNorm, bNorm * 0.8, bNorm);
  const bMat = (bSrc.material as THREE.MeshStandardMaterial).clone();
  bMat.color.setRGB(0.7, 0.69, 0.67);
  const boulder = new THREE.Mesh(bGeo, bMat);
  const bx = bs.x + 3.4;
  const bz = bs.z - 1.2;
  boulder.position.set(bx, heightAt(bx, bz) - 0.4, bz);
  boulder.rotation.y = 0.7;
  boulder.castShadow = boulder.receiveShadow = true;
  boulder.name = 'boulder';
  group.add(boulder);
  colliders.push({ kind: 'ball', center: new THREE.Vector3(bx, boulder.position.y + 1.2, bz), radius: 2.1 });
  // Site A: a scatter of pale highland rocks on the crater rim.
  const aSrc = pickLod(sources[2].scene, 2);
  const aGeo = aSrc.geometry.clone();
  aGeo.computeBoundingBox();
  const ab = aGeo.boundingBox!;
  const aSize = new THREE.Vector3();
  ab.getSize(aSize);
  aGeo.translate(-(ab.min.x + ab.max.x) / 2, -ab.min.y, -(ab.min.z + ab.max.z) / 2);
  aGeo.scale(1 / aSize.x, 1 / aSize.x, 1 / aSize.x);
  const aMat = (aSrc.material as THREE.MeshStandardMaterial).clone();
  aMat.color.setRGB(1.25, 1.24, 1.2); // anorthosite: much paler than the soil around it
  const as = LAYOUT.sites[0];
  const pale = new THREE.InstancedMesh(aGeo, aMat, 9);
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + 0.3;
    const r = 1.3 + (i % 3) * 0.9;
    const x = as.x + Math.cos(a) * r - 1.2;
    const z = as.z + Math.sin(a) * r;
    const sc = 0.25 + (i % 4) * 0.12;
    m.compose(new THREE.Vector3(x, heightAt(x, z) - sc * 0.15, z), q.setFromEuler(new THREE.Euler(0.3, a * 2, 0.2)), s.set(sc, sc * 0.7, sc));
    pale.setMatrixAt(i, m);
  }
  pale.castShadow = pale.receiveShadow = true;
  pale.computeBoundingSphere();
  group.add(pale);
  return { group, colliders };
}
