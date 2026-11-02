import './style.css';
import * as THREE from 'three';
import { createRenderer, Pipeline, PRESETS } from './engine/renderer';
import { settings } from './engine/settings';
import { loadTextures } from './world/assets';
import { heightAt, LAYOUT } from './world/heightfield';
import { buildOutpost } from './world/base';
import { buildRocks } from './world/rocks';
import { buildSky, SUN_DIR } from './world/sky';
import { buildTerrain, regolithMaterial } from './world/terrain';

async function boot() {
  const container = document.getElementById('game')!;
  const renderer = createRenderer(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(settings.value.fov, innerWidth / innerHeight, 0.05, 12000);

  const pipeline = new Pipeline(renderer, scene, camera);
  pipeline.apply(settings.value.quality);
  addEventListener('resize', () => pipeline.resize());

  const tex = await loadTextures(renderer, () => {});
  const terrain = buildTerrain(regolithMaterial(tex.regolith), PRESETS[settings.value.quality].terrainSegments);
  scene.add(terrain.group);
  const sky = buildSky(tex.earthDay, tex.earthClouds);
  scene.add(sky.group);

  // Harsh sunlight with almost no fill: the only "ambient" light on the Moon is
  // sunlight bounced off the grey ground and faint earthshine.
  const sun = new THREE.DirectionalLight(0xfff6ea, 7.5);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(PRESETS[settings.value.quality].shadow);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -60;
  sc.right = sc.top = 60;
  sc.near = 1;
  sc.far = 600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x0a0c12, 0x55524c, 0.32));
  scene.environment = lunarEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  const outpost = buildOutpost();
  scene.add(outpost.group);
  const rocks = await buildRocks(PRESETS[settings.value.quality].terrainSegments > 260 ? 2400 : 1200);
  scene.add(rocks.group);

  const start = { x: LAYOUT.lander.x - 4, z: LAYOUT.lander.z + 8 };
  camera.position.set(start.x, heightAt(start.x, start.z) + 1.7, start.z);
  camera.lookAt(LAYOUT.base.x, heightAt(LAYOUT.base.x, LAYOUT.base.z) + 2, LAYOUT.base.z);

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    const dt = Math.min(timer.getDelta(), 0.1);
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, 300);
    sun.target.position.copy(camera.position);
    sky.update(camera);
    const now = t / 1000;
    for (const b of outpost.blinkers) b.mesh.visible = ((now + b.phase) % b.period) < b.period * 0.5;
    pipeline.render(dt);
  });

  // Debug/QA hooks for automated screenshots.
  (window as unknown as { __qa: unknown }).__qa = {
    look(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
      camera.position.set(x, y, z);
      camera.lookAt(tx, ty, tz);
    },
    gpu: () => {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    },
    info: () => renderer.info.render,
  };
}

/** Reflection environment: black sky above, sunlit grey regolith below, a hot sun spot. */
function lunarEnvironment(renderer: THREE.WebGLRenderer) {
  const envScene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float ground = 1.0 - smoothstep(-0.04, 0.03, vDir.y);
        vec3 col = mix(vec3(0.0), vec3(0.42, 0.40, 0.37), ground);
        col += vec3(40.0, 38.0, 34.0) * smoothstep(0.9993, 0.9998, dot(vDir, sunDir));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02);
  pmrem.dispose();
  return rt.texture;
}

boot();
