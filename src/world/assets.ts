import * as THREE from 'three';

const PH = './assets/polyhaven/textures/';

export async function loadTextures(renderer: THREE.WebGLRenderer, onProgress: (f: number) => void) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
  const loader = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const tex = (url: string, srgb: boolean, repeat = true) =>
    loader.loadAsync(url).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      return t;
    });

  const [diff, diffB, normal, rough, macro, earthDay, earthClouds] = await Promise.all([
    tex(PH + 'moon_01/moon_01_diff_1k.jpg', true),
    tex(PH + 'moon_dusted_02/moon_dusted_02_diff_1k.jpg', true),
    tex(PH + 'moon_01/moon_01_nor_gl_1k.jpg', false),
    tex(PH + 'moon_01/moon_01_rough_1k.jpg', false),
    tex(PH + 'moon_meteor_02/moon_meteor_02_disp_1k.jpg', false),
    tex('./assets/nasa/land_shallow_topo_2048.jpg', true, false),
    tex('./assets/nasa/cloud_combined_2048.jpg', false, false),
  ]);
  return { regolith: { diff, diffB, normal, rough, macro }, earthDay, earthClouds };
}
