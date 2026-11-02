import * as THREE from 'three';
import { heightAt } from './heightfield';

export const NEAR_SIZE = 800;
export const FAR_SIZE = 9000;

export interface TerrainBuild {
  group: THREE.Group;
  /** Vertices and indices of the walkable near terrain, for the physics trimesh. */
  physics: { vertices: Float32Array; indices: Uint32Array };
}

function gridGeometry(size: number, segments: number, height: (x: number, z: number) => number, uvScale: number) {
  const n = segments + 1;
  const step = size / segments;
  const half = size / 2;
  const pos = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const heights = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -half + ix * step;
      const z = -half + iz * step;
      const h = height(x, z);
      const i = iz * n + ix;
      heights[i] = h;
      pos.set([x, h, z], i * 3);
      uv.set([x / uvScale, z / uvScale], i * 2);
    }
  }
  const idx = new Uint32Array(segments * segments * 6);
  let k = 0;
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  // Normals from central differences: smoother and cheaper than per-face averaging.
  const nrm = new Float32Array(n * n * 3);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const hl = heights[iz * n + Math.max(ix - 1, 0)];
      const hr = heights[iz * n + Math.min(ix + 1, segments)];
      const hd = heights[Math.max(iz - 1, 0) * n + ix];
      const hu = heights[Math.min(iz + 1, segments) * n + ix];
      const v = new THREE.Vector3(hl - hr, 2 * step, hd - hu).normalize();
      nrm.set([v.x, v.y, v.z], (iz * n + ix) * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return { geo, pos, idx };
}

export function regolithMaterial(maps: {
  diff: THREE.Texture;
  diffB: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
  macro: THREE.Texture;
}) {
  const mat = new THREE.MeshStandardMaterial({
    map: maps.diff,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughnessMap: maps.rough,
    roughness: 1,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.mapB = { value: maps.diffB };
    shader.uniforms.macroMap = { value: maps.macro };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform sampler2D mapB;\nuniform sampler2D macroMap;',
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        // Two texture sets blended by a low-frequency mask, plus a second, larger scale
        // of the same texture: hides tiling on a large plain of regolith.
        float mask = smoothstep(0.30, 0.70, texture2D(macroMap, vMapUv * 0.017).r);
        vec3 a = texture2D(map, vMapUv).rgb;
        vec3 b = texture2D(mapB, vMapUv * 0.83 + 0.37).rgb;
        vec3 big = texture2D(map, vMapUv * 0.091 + 0.13).rgb;
        vec3 col = mix(a, b, mask) * mix(0.82, 1.18, big.r);
        // Real regolith is a neutral dark grey; the scans read slightly warm.
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(lum), col, 0.3) * 0.86;
        diffuseColor.rgb *= col;
        `,
      );
  };
  return mat;
}

export function buildTerrain(material: THREE.Material, segments: number): TerrainBuild {
  const group = new THREE.Group();
  group.name = 'terrain';

  const near = gridGeometry(NEAR_SIZE, segments, heightAt, 4);
  const nearMesh = new THREE.Mesh(near.geo, material);
  nearMesh.receiveShadow = true;
  nearMesh.castShadow = true;
  nearMesh.name = 'terrain-near';
  group.add(nearMesh);

  // The far ring sits slightly below the near patch where they overlap, so the
  // detailed patch always wins without visible seams.
  const half = NEAR_SIZE / 2;
  const far = gridGeometry(
    FAR_SIZE,
    220,
    (x, z) => {
      const edge = Math.max(Math.abs(x), Math.abs(z));
      const dip = 6 * (1 - THREE.MathUtils.smoothstep(edge, half - 30, half + 10));
      return heightAt(x, z) - dip;
    },
    4,
  );
  const farMesh = new THREE.Mesh(far.geo, material);
  farMesh.name = 'terrain-far';
  group.add(farMesh);

  return { group, physics: { vertices: near.pos, indices: near.idx } };
}
