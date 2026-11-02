import './style.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource/b612-mono/400.css';
import '@fontsource/b612-mono/700.css';
import '@fontsource-variable/orbitron';
import * as THREE from 'three';
import { render, h } from 'preact';
import { beep, playVoice, setExertion, startAudio, thud } from './audio/audio';
import { createRenderer, Pipeline, PRESETS } from './engine/renderer';
import { settings, updateSettings, type Quality } from './engine/settings';
import { Mission1 } from './game/mission1';
import { clock, comms, fps, heading, knowledge, loadProgress, panel, prompt, pushComm, screen, suit, warning } from './game/state';
import { Input } from './player/input';
import { createPhysics } from './player/physics';
import { Player } from './player/player';
import { App, type Actions } from './ui/App';
import { loadTextures } from './world/assets';
import { buildOutpost, type Interactable } from './world/base';
import { heightAt, LAYOUT } from './world/heightfield';
import { buildRocks } from './world/rocks';
import { buildSky, SUN_DIR } from './world/sky';
import { buildTerrain, regolithMaterial } from './world/terrain';

const QA = new URLSearchParams(location.search).has('qa');

// Suit model (simplified for gameplay): a real suit holds about 8 hours of oxygen.
const O2_PER_SEC = 100 / (14 * 60); // a full tank lasts ~14 real minutes of walking
const POWER_PER_SEC = 100 / (30 * 60);
const LAMP_POWER_PER_SEC = 100 / (20 * 60);
const GAME_SECONDS_PER_SECOND = 30; // mission clock speed
const DOSE_PER_GAME_DAY = 1.37; // mSv/day on the lunar surface (Chang'e 4, 2019)

async function boot() {
  const container = document.getElementById('game')!;
  const renderer = createRenderer(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(settings.value.fov, innerWidth / innerHeight, 0.05, 12000);
  scene.add(camera);

  const pipeline = new Pipeline(renderer, scene, camera);
  pipeline.apply(settings.value.quality);
  addEventListener('resize', () => pipeline.resize());

  const input = new Input(renderer.domElement);
  input.allowUnlocked = QA;

  let player: Player | null = null;
  let mission1: Mission1 | null = null;
  let started = false;
  let lowO2Warned = false;

  const actions: Actions = {
    start() {
      startAudio();
      screen.value = 'briefing';
    },
    async resume() {
      startAudio();
      panel.value = null;
      const ok = QA || (await input.lock());
      if (!ok) return;
      input.enabled = true;
      screen.value = 'playing';
      if (!started) {
        started = true;
        mission1!.begin();
      }
    },
    restart() {
      resetMission();
      void actions.resume();
    },
    toMenu() {
      input.unlock();
      input.enabled = false;
      resetMission();
      screen.value = 'menu';
    },
    setQuality(q: Quality) {
      updateSettings({ quality: q });
      pipeline.apply(q);
      sun.shadow.mapSize.setScalar(PRESETS[q].shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
  };
  render(h(App, { actions }), document.getElementById('ui-root')!);

  input.onLockChange = (locked) => {
    if (!locked && screen.value === 'playing' && !QA) screen.value = 'paused';
  };

  // ---------- world ----------
  const tex = await loadTextures(renderer, (f) => (loadProgress.value = f * 0.6));
  const preset = PRESETS[settings.value.quality];
  const terrain = buildTerrain(regolithMaterial(tex.regolith), preset.terrainSegments);
  scene.add(terrain.group);
  const sky = buildSky(tex.earthDay, tex.earthClouds);
  scene.add(sky.group);
  loadProgress.value = 0.7;

  // Harsh sunlight with almost no fill: the only "ambient" light on the Moon is
  // sunlight bounced off the grey ground and faint earthshine.
  const sun = new THREE.DirectionalLight(0xfff6ea, 7.5);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(preset.shadow);
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

  // Helmet lamp: shadows on the Moon are pitch black, so astronauts carry lights.
  const lamp = new THREE.SpotLight(0xfff2dd, 0, 45, 0.5, 0.45, 1.4);
  lamp.position.set(0.15, 0.1, 0);
  lamp.target.position.set(0, 0, -5);
  camera.add(lamp, lamp.target);

  const outpost = buildOutpost();
  scene.add(outpost.group);
  const rocks = await buildRocks(preset.terrainSegments > 260 ? 1600 : 900);
  scene.add(rocks.group);
  loadProgress.value = 0.85;

  const { RAPIER, world } = await createPhysics(terrain.physics, [...outpost.colliders, ...rocks.colliders]);
  const startPos = new THREE.Vector3(LAYOUT.lander.x - 3, 0, LAYOUT.lander.z - 6);
  startPos.y = heightAt(startPos.x, startPos.z);
  const startYaw = Math.atan2(-(LAYOUT.base.x - startPos.x), -(LAYOUT.base.z - startPos.z));
  player = new Player(RAPIER, world, input, camera, startPos);
  player.yaw = startYaw;
  player.onLand = (fall) => thud(fall);
  player.onBoundary = () => {
    pushComm('Mission Control', 'That is the edge of the safe exploration zone. Please head back toward the outpost.');
    void playVoice('boundary');
  };
  mission1 = new Mission1(outpost.habitatPos, outpost.sensorLights);
  loadProgress.value = 1;

  function resetMission() {
    started = false;
    player!.teleport(startPos, startYaw);
    player!.pitch = 0;
    player!.stats = { distance: 0, jumps: 0 };
    suit.value = { o2: 100, power: 100, health: 100, tempIn: 21, tempOut: -48, dose: 0, light: false };
    clock.value = { day: 1, minutes: 6 * 60 + 10 };
    comms.value = [];
    knowledge.value = [];
    warning.value = null;
    lowO2Warned = false;
  }

  // ---------- interaction ----------
  const ray = new THREE.Raycaster();
  ray.far = 3.4;
  const targets = outpost.interactables.map((i) => i.object);
  const byObject = new Map<THREE.Object3D, Interactable>(outpost.interactables.map((i) => [i.object, i]));
  let focused: Interactable | null = null;
  let warningTimer = 0;
  const flash = (msg: string, secs = 3) => {
    warning.value = msg;
    warningTimer = secs;
  };

  function labelFor(it: Interactable) {
    if (it.id.startsWith('sensor-')) return mission1!.sensorLabel(Number(it.id.split('-')[1]));
    if (it.id === 'o2') return suit.value.o2 > 98 ? 'Oxygen tank full' : 'Refill suit oxygen';
    return it.label();
  }

  function use(it: Interactable) {
    if (it.id === 'o2') {
      if (suit.value.o2 > 98) return;
      suit.value = { ...suit.value, o2: 100 };
      lowO2Warned = false;
      beep('ok');
      pushComm('Mission Control', 'Suit oxygen refilled. You are good to go.');
      void playVoice('o2_refill');
      return;
    }
    const reason = mission1!.interact(it.id);
    if (reason) {
      beep('warn');
      flash(reason);
    }
  }

  // ---------- loop ----------
  let fpsAcc = 0;
  let fpsFrames = 0;
  let hudAcc = 0;
  const timer = new THREE.Timer();
  timer.connect(document);
  screen.value = 'menu';

  renderer.setAnimationLoop((t) => {
    timer.update(t);
    const dt = Math.min(timer.getDelta(), 0.1);
    const playing = screen.value === 'playing' && !panel.value;

    if (player) {
      player.update(dt, playing);
      if (playing) {
        if (input.pressed('KeyE') && focused) use(focused);
        if (input.pressed('KeyF')) {
          suit.value = { ...suit.value, light: !suit.value.light };
          beep('select');
        }
        if (input.pressed('KeyK')) {
          panel.value = 'knowledge';
          input.unlock();
        }
        // Focus the interactable under the crosshair.
        ray.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hit = ray.intersectObjects(targets, false)[0];
        focused = hit ? (byObject.get(hit.object) ?? null) : null;
        prompt.value = focused ? labelFor(focused) : null;

        mission1!.update(dt, { distance: player.stats.distance, jumps: player.stats.jumps, feet: player.feet, look: player.forward() });
        simulateSuit(dt);
      } else prompt.value = null;
      input.endFrame();
    }

    lamp.intensity = suit.value.light ? 30 : 0;
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, 300);
    sun.target.position.copy(camera.position);
    sky.update(camera);
    const now = t / 1000;
    for (const b of outpost.blinkers) b.mesh.visible = (now + b.phase) % b.period < b.period * 0.5;

    if (warningTimer > 0) {
      warningTimer -= dt;
      if (warningTimer <= 0) warning.value = null;
    }
    hudAcc += dt;
    if (hudAcc > 0.1) {
      hudAcc = 0;
      const f = player ? player.forward() : new THREE.Vector3(0, 0, -1);
      // North is -Z, east is +X.
      heading.value = (THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)) + 360) % 360;
    }
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc > 0.5) {
      fps.value = Math.round(fpsFrames / fpsAcc);
      fpsAcc = fpsFrames = 0;
    }
    renderer.info.reset();
    pipeline.render(dt);
  });

  function simulateSuit(dt: number) {
    const s = { ...suit.value };
    const exertion = player!.sprinting ? 1.8 : player!.moving ? 1.15 : 0.8;
    s.o2 = Math.max(0, s.o2 - O2_PER_SEC * exertion * dt);
    s.power = Math.max(0, s.power - (POWER_PER_SEC + (s.light ? LAMP_POWER_PER_SEC : 0)) * dt);
    if (s.power === 0) s.light = false;
    s.dose += (DOSE_PER_GAME_DAY / 86400) * GAME_SECONDS_PER_SECOND * dt;
    s.tempOut = -48 + Math.sin(performance.now() / 9000) * 3;
    if (s.o2 === 0) {
      s.health = Math.max(0, s.health - 4 * dt);
      if (warningTimer <= 0) flash('OXYGEN DEPLETED: get to the oxygen station now!', 1);
    } else if (s.o2 < 15 && warningTimer <= 0) flash('Oxygen critical', 1);
    if (s.o2 < 30 && !lowO2Warned) {
      lowO2Warned = true;
      beep('warn');
      pushComm('Mission Control', 'Your suit oxygen is getting low. Head to the oxygen station beside the habitat.');
      void playVoice('o2_low');
    }
    if (s.health === 0) {
      flash('You blacked out. Mission Control brought you back to the lander.', 5);
      player!.teleport(startPos, startYaw);
      s.o2 = 100;
      s.health = 60;
      lowO2Warned = false;
    }
    suit.value = s;
    setExertion(player!.sprinting ? 1 : s.o2 < 20 ? 0.8 : 0.2);
    const minutes = clock.value.minutes + (dt * GAME_SECONDS_PER_SECOND) / 60;
    clock.value = { day: 1 + Math.floor((minutes - 6 * 60 - 10) / 1440), minutes };
  }

  // Warn before leaving mid-mission (back button, closing the tab).
  addEventListener('beforeunload', (e) => {
    if (started && !QA) e.preventDefault();
  });

  // ---------- QA hooks (only with ?qa=1) ----------
  if (QA) {
    Object.assign(window, {
      __qa: {
        ready: true,
        start: () => actions.start(),
        play: () => actions.resume(),
        teleport: (x: number, z: number, yaw = 0, pitch = 0) => {
          player!.teleport(new THREE.Vector3(x, heightAt(x, z), z), yaw);
          player!.pitch = pitch;
        },
        look: (yaw: number, pitch: number) => {
          player!.yaw = yaw;
          player!.pitch = pitch;
        },
        key: (code: string, ms = 300) => {
          dispatchEvent(new KeyboardEvent('keydown', { code }));
          setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code })), ms);
        },
        state: () => ({ screen: screen.value, suit: suit.value, stats: player!.stats, pos: player!.feet, grounded: player!.grounded }),
        gpu: () => {
          const gl = renderer.getContext();
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
        },
        info: () => ({ ...renderer.info.render, fps: fps.value }),
        show: (name: string, on: boolean) => {
          const o = scene.getObjectByName(name);
          if (o) o.visible = on;
          return !!o;
        },
        shadows: (on: boolean) => {
          sun.castShadow = on;
        },
        quality: (q: Quality) => actions.setQuality(q),
      },
    });
  }
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
        col += vec3(9.0, 8.6, 8.0) * smoothstep(0.9990, 0.9998, dot(vDir, sunDir));
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
