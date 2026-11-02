import './style.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource/b612-mono/400.css';
import '@fontsource/b612-mono/700.css';
import '@fontsource-variable/orbitron';
import '@fontsource/noto-sans-myanmar/400.css';
import '@fontsource/noto-sans-myanmar/700.css';
import * as THREE from 'three';
import { render, h } from 'preact';
import { beep, playVoice, setExertion, startAudio, thud } from './audio/audio';
import { createRenderer, Pipeline, PRESETS } from './engine/renderer';
import { settings, updateSettings, type Quality } from './engine/settings';
import { resetLife, simulateLife, terminalOpen } from './game/lifesupport';
import { Mission1 } from './game/mission1';
import { FILTER_HOLD_SECONDS, Mission2 } from './game/mission2';
import { clock, comms, fps, heading, holdProgress, knowledge, loadProgress, missionNumber, panel, prompt, pushComm, screen, suit, warning, waypoint } from './game/state';
import { Input } from './player/input';
import { createPhysics } from './player/physics';
import { Player } from './player/player';
import { App, type Actions } from './ui/App';
import { loadTextures } from './world/assets';
import { buildOutpost, type Interactable, type OutpostModels } from './world/base';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { heightAt, LAYOUT } from './world/heightfield';
import { buildRocks } from './world/rocks';
import { buildTrails } from './world/trails';
import { buildSky, EARTH_DIR, SUN_DIR } from './world/sky';
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
  let mission2: Mission2 | null = null;
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
        if (missionNumber.value === 2) mission2!.begin();
        else mission1!.begin();
      }
    },
    next() {
      missionNumber.value = 2;
      resetMission();
      void actions.resume();
    },
    closeTerminal() {
      terminalOpen.value = false;
      void actions.resume();
    },
    restart() {
      resetMission();
      void actions.resume();
    },
    toMenu() {
      input.unlock();
      input.enabled = false;
      missionNumber.value = 1;
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
    if (!locked && screen.value === 'playing' && !terminalOpen.value && !QA) screen.value = 'paused';
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

  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const names = ['hab_module', 'lab_module', 'node_module', 'rover', 'floodlight', 'power_unit'] as const;
  const loaded = await Promise.all(names.map((n) => gltf.loadAsync(`./assets/models/${n}.glb`)));
  const models = Object.fromEntries(names.map((n, i) => [n, loaded[i].scene])) as unknown as OutpostModels;
  const outpost = buildOutpost(models);
  scene.add(outpost.group);
  // Floodlights light the deep shadows around the base (skipped on Low to save GPU time).
  if (settings.value.quality !== 'low')
    for (const f of outpost.floodSpots) {
      const spot = new THREE.SpotLight(0xffe9cc, 9, 45, 0.6, 0.7, 1.6);
      spot.position.copy(f.pos);
      spot.target.position.copy(f.target);
      scene.add(spot, spot.target);
    }
  scene.add(await buildTrails());
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
    pushComm('mc', 'c.boundary');
    void playVoice('boundary');
  };
  mission1 = new Mission1(outpost.habitatPos, outpost.sensorLights);
  mission2 = new Mission2(outpost.lifeSupport.pos, outpost.lifeSupport.lights);
  // Mission 2 starts just outside the airlock, as if the crew had rested inside.
  const m2Start = new THREE.Vector3(LAYOUT.base.x - 9, 0, LAYOUT.base.z + 4);
  m2Start.y = heightAt(m2Start.x, m2Start.z);
  const m2Yaw = Math.atan2(-(outpost.lifeSupport.pos.x - m2Start.x), -(outpost.lifeSupport.pos.z - m2Start.z));
  loadProgress.value = 1;

  function resetMission() {
    started = false;
    terminalOpen.value = false;
    resetLife();
    if (missionNumber.value === 2) player!.teleport(m2Start, m2Yaw);
    else player!.teleport(startPos, startYaw);
    player!.pitch = 0;
    player!.stats = { distance: 0, jumps: 0 };
    suit.value = { o2: 100, power: 100, health: 100, tempIn: 21, tempOut: -48, dose: 0, light: false };
    clock.value = { day: 1, minutes: 6 * 60 + 10 };
    comms.value = [];
    if (missionNumber.value === 1) knowledge.value = [];
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
    const m2 = missionNumber.value === 2 ? mission2!.label(it.id) : null;
    if (m2) return m2;
    if (it.id === 'o2') return suit.value.o2 > 98 ? 'p.o2full' : 'p.o2refill';
    return it.label();
  }

  function use(it: Interactable) {
    if (it.id === 'o2') {
      if (suit.value.o2 > 98) return;
      suit.value = { ...suit.value, o2: 100 };
      lowO2Warned = false;
      beep('ok');
      pushComm('mc', 'c.o2refill');
      void playVoice('o2_refill');
      return;
    }
    const reason = missionNumber.value === 2 ? mission2!.interact(it.id) : mission1!.interact(it.id);
    if (reason) {
      beep('warn');
      flash(reason);
    }
    if (terminalOpen.value) input.unlock();
  }
  let holdTime = 0;

  // ---------- guidance: where to go next ----------
  const lsPos = outpost.lifeSupport.pos;
  const GUIDE = {
    habitat: new THREE.Vector3(LAYOUT.base.x + 2.5, outpost.habitatPos.y + 9.2, LAYOUT.base.z),
    airlock: outpost.airlockPos.clone().add(new THREE.Vector3(0.3, 2, 0)),
    ls: lsPos.clone().add(new THREE.Vector3(0, 1.6, 0)),
    terminal: lsPos.clone().add(new THREE.Vector3(-0.2, 1.45, 1.5)),
    filter: lsPos.clone().add(new THREE.Vector3(1.05, 0.95, 0.97)),
  };
  const sensorPos = LAYOUT.sensors.map((sp) => new THREE.Vector3(sp.x, heightAt(sp.x, sp.z) + 1.3, sp.z));

  /** The point the player should head to for the current objective (null = no marker). */
  function guideTarget(): { pos: THREE.Vector3; label: string; sky?: boolean } | null {
    if (missionNumber.value === 1) {
      switch (mission1!.current?.id) {
        case 'earth':
          return { pos: camera.position.clone().addScaledVector(EARTH_DIR, 1000), label: 'wp.earth', sky: true };
        case 'reach':
          return { pos: GUIDE.habitat, label: 'wp.habitat' };
        case 'scan': {
          const feet = player!.feet;
          let best: THREE.Vector3 | null = null;
          sensorPos.forEach((sp, i) => {
            if (!mission1!.isScanned(i) && (!best || sp.distanceToSquared(feet) < best.distanceToSquared(feet))) best = sp;
          });
          return best ? { pos: best, label: 'wp.sensor' } : null;
        }
        case 'airlock':
          return { pos: GUIDE.airlock, label: 'wp.airlock' };
        default:
          return null;
      }
    }
    switch (mission2!.current?.id) {
      case 'goto':
        return { pos: GUIDE.ls, label: 'wp.ls' };
      case 'inspect':
      case 'o2':
      case 'water':
      case 'air':
        return { pos: GUIDE.terminal, label: 'wp.terminal' };
      case 'filter':
        return { pos: GUIDE.filter, label: 'wp.filter' };
      default:
        return null;
    }
  }

  // A soft vertical light beam over the target, visible from far away.
  const beam = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 60, 12, 1, true), beamMat);
  beamCore.position.y = 30;
  const beamRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48), beamMat.clone());
  beamRing.rotation.x = -Math.PI / 2;
  beamRing.position.y = 0.05;
  beam.add(beamCore, beamRing);
  beam.visible = false;
  scene.add(beam);

  const ndc = new THREE.Vector3();
  function updateGuide(now: number) {
    const target = screen.value === 'playing' && !terminalOpen.value ? guideTarget() : null;
    if (!target || !player) {
      if (waypoint.value) waypoint.value = null;
      beam.visible = false;
      return;
    }
    const feet = player.feet;
    const dist = target.sky ? null : Math.hypot(target.pos.x - feet.x, target.pos.z - feet.z);
    // Beam: only for ground targets that are not right in front of you.
    beam.visible = !target.sky && dist !== null && dist > 9;
    if (beam.visible) {
      beam.position.set(target.pos.x, heightAt(target.pos.x, target.pos.z), target.pos.z);
      (beamRing.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(now * 3) * 0.12;
    }
    // Near enough to read the "Press E" prompt: hide the marker so it doesn't cover it.
    if (dist !== null && dist < 2.6) {
      if (waypoint.value) waypoint.value = null;
      return;
    }
    ndc.copy(target.pos).project(camera);
    const behind = ndc.z > 1;
    let x = behind ? -ndc.x : ndc.x;
    let y = behind ? -ndc.y : ndc.y;
    const onScreen = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.82;
    if (!onScreen) {
      // Push the marker to the edge of the screen, in the target's direction.
      if (behind && Math.abs(x) < 0.05 && Math.abs(y) < 0.05) x = 1;
      const k = 1 / Math.max(Math.abs(x) / 0.86, Math.abs(y) / 0.74);
      x *= k;
      y *= k;
    }
    waypoint.value = {
      x: (x * 0.5 + 0.5) * innerWidth,
      y: (1 - (y * 0.5 + 0.5)) * innerHeight,
      onScreen,
      angle: Math.atan2(-y, x),
      dist,
      label: target.label,
    };
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
    const inMission = screen.value === 'playing' && !panel.value;
    const playing = inMission && !terminalOpen.value;

    if (player) {
      player.update(dt, playing);
      if (playing) {
        const holdId = missionNumber.value === 2 ? mission2!.holdId : null;
        if (focused && holdId && focused.id === holdId) {
          // Hold E to do a repair: keep looking at the part while holding the key.
          input.pressed('KeyE');
          holdTime = input.isDown('KeyE') ? holdTime + dt : 0;
          holdProgress.value = holdTime > 0 ? Math.min(1, holdTime / FILTER_HOLD_SECONDS) : null;
          if (holdTime >= FILTER_HOLD_SECONDS) {
            holdTime = 0;
            holdProgress.value = null;
            mission2!.holdComplete(holdId);
          }
        } else {
          holdTime = 0;
          holdProgress.value = null;
          if (input.pressed('KeyE') && focused) use(focused);
        }
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

        if (missionNumber.value === 1) mission1!.update(dt, { distance: player.stats.distance, jumps: player.stats.jumps, feet: player.feet, look: player.forward() });
        simulateSuit(dt);
      } else prompt.value = null;
      if (inMission && missionNumber.value === 2) {
        // Life support keeps running while the terminal is open.
        simulateLife(dt);
        mission2!.update(dt, { feet: player.feet });
      }
      input.endFrame();
    }

    lamp.intensity = suit.value.light ? 30 : 0;
    updateGuide(t / 1000);
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
      if (warningTimer <= 0) flash('w.o2depleted', 1);
    } else if (s.o2 < 15 && warningTimer <= 0) flash('w.o2critical', 1);
    if (s.o2 < 30 && !lowO2Warned) {
      lowO2Warned = true;
      beep('warn');
      pushComm('mc', 'c.o2low');
      void playVoice('o2_low');
    }
    if (s.health === 0) {
      flash('w.blackout', 5);
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
        next: () => actions.next(),
        closeTerminal: () => actions.closeTerminal(),
        holdE: (ms: number) => {
          dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
          setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })), ms);
        },
        state: () => ({ mission: missionNumber.value, terminal: terminalOpen.value, screen: screen.value, suit: suit.value, stats: player!.stats, pos: player!.feet, grounded: player!.grounded }),
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
