import './style.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource/b612-mono/400.css';
import '@fontsource/b612-mono/700.css';
import '@fontsource-variable/orbitron';
import '@fontsource/noto-sans-myanmar/400.css';
import '@fontsource/noto-sans-myanmar/700.css';
import * as THREE from 'three';
import { render, h } from 'preact';
import { effect } from '@preact/signals';
import { audioState, beep, playVoice, setExertion, setHum, sfx, startAudio, thud, type Sfx } from './audio/audio';
import { createRenderer, Pipeline, PRESETS } from './engine/renderer';
import { settings, updateSettings, type Quality } from './engine/settings';
import { life, lifeOnline, resetLife } from './game/lifesupport';
import { buildCutscenes, CutscenePlayer, type Shot } from './game/cutscenes';
import type { GameMission, MissionCtx } from './game/mission';
import { Mission1 } from './game/mission1';
import { Mission2 } from './game/mission2';
import { Mission3 } from './game/mission3';
import { Mission4 } from './game/mission4';
import { Mission5 } from './game/mission5';
import { Mission6 } from './game/mission6';
import { Mission7 } from './game/mission7';
import { resetScience, science } from './game/science';
import { Rover } from './player/rover';
import { crew } from './game/crew';
import { BERMS, rad, radiationDone, resetRadiation } from './game/radiation';
import { greenhouse, greenhouseDone, resetGreenhouse } from './game/greenhouse';
import { resetConstruction } from './game/construction';
import { resetCrew } from './game/crew';
import { habitat, habitatDone, resetHabitat } from './game/habitat';
import { BATTERY_KWH, power, powerOnline, resetPower, sunYaw } from './game/power';
import { missionDone, progress } from './game/save';
import { cardPopup, clock, comms, drive, fps, gameSpeed, heading, holdProgress, loadProgress, missionNumber, NORMAL_SPEED, panel, prompt, pushComm, screen, suit, terminal, warning, waypoint } from './game/state';
import { Input } from './player/input';
import { addCollider, createPhysics } from './player/physics';
import { Player } from './player/player';
import { App, type Actions } from './ui/App';
import { loadTextures } from './world/assets';
import { buildOutpost, statusMaterials, type ColliderSpec, type Interactable, type OutpostModels } from './world/base';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { heightAt, LAYOUT } from './world/heightfield';
import { buildRocks } from './world/rocks';
import { buildTrails } from './world/trails';
import { buildSky, SUN_DIR, sunlight, sunPath } from './world/sky';
import { buildTerrain, regolithMaterial } from './world/terrain';

const QA = new URLSearchParams(location.search).has('qa');

// Suit model (simplified for gameplay): a real suit holds about 8 hours of oxygen.
const O2_PER_SEC = 100 / (14 * 60); // a full tank lasts ~14 real minutes of walking
const POWER_PER_SEC = 100 / (30 * 60);
const LAMP_POWER_PER_SEC = 100 / (20 * 60);
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
  /** Every playable mission, by number, with where it starts and its cutscenes. */
  interface MissionEntry {
    m: GameMission;
    spawn: { pos: THREE.Vector3; yaw: number };
    intro?: Shot[];
    ending?: Shot[];
    /** Mission day the clock starts on (defaults to the mission number). */
    day?: number;
  }
  const registry = new Map<number, MissionEntry>();
  const current = () => registry.get(missionNumber.value)!;
  let started = false;
  const cut = new CutscenePlayer();
  let scenes: ReturnType<typeof buildCutscenes> | null = null;
  function playCut(shots: Shot[] | undefined, done: () => void) {
    if (!shots) return done();
    input.enabled = false;
    input.unlock();
    prompt.value = null;
    screen.value = 'cutscene';
    cut.play(shots, done);
  }
  let lowO2Warned = false;

  /** Loads mission n, plays its intro, then shows its briefing. */
  function openMission(n: number) {
    startAudio();
    panel.value = null;
    missionNumber.value = n;
    resetMission();
    playCut(current().intro, () => (screen.value = 'briefing'));
  }

  const actions: Actions = {
    start() {
      openMission(1);
    },
    play(n: number) {
      openMission(n);
    },
    skipCutscene() {
      cut.skip();
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
        current().m.begin();
      }
    },
    next() {
      if (registry.has(missionNumber.value + 1)) openMission(missionNumber.value + 1);
    },
    closeTerminal() {
      terminal.value = null;
      void actions.resume();
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

  // Free the mouse whenever a mission ends, so the player can click the
  // "Mission complete" buttons (the cursor stays hidden while it is captured).
  effect(() => {
    if (screen.value === 'complete') {
      input.enabled = false;
      input.unlock();
      sfx('complete');
    }
  });
  effect(() => {
    if (cardPopup.value) sfx('unlock');
  });
  effect(() => {
    if (terminal.value) sfx('terminal');
  });
  effect(() => {
    if (panel.value) sfx('panel');
  });
  // Menu sounds: a tick on hover, a click on press.
  document.addEventListener('click', (e) => (e.target as HTMLElement).closest?.('button') && sfx('click'));
  document.addEventListener('mouseover', (e) => (e.target as HTMLElement).closest?.('button:not(:disabled)') && sfx('hover'));

  input.onLockChange = (locked) => {
    if (!locked && screen.value === 'playing' && !terminal.value && !QA) screen.value = 'paused';
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
  const names = ['hab_module', 'lab_module', 'node_module', 'rover', 'floodlight', 'power_unit', 'battery_bank', 'inflatable_hab', 'greenhouse'] as const;
  const loaded = await Promise.all(names.map((n) => gltf.loadAsync(`./assets/models/${n}.glb`)));
  const models = Object.fromEntries(names.map((n, i) => [n, loaded[i].scene])) as unknown as OutpostModels;
  const outpost = buildOutpost(models);
  scene.add(outpost.group);
  // Floodlights light the deep shadows around the base (skipped on Low to save GPU time).
  const floodLights: THREE.SpotLight[] = [];
  if (settings.value.quality !== 'low')
    for (const f of outpost.floodSpots) {
      const spot = new THREE.SpotLight(0xffe9cc, 9, 45, 0.6, 0.7, 1.6);
      spot.position.copy(f.pos);
      spot.target.position.copy(f.target);
      scene.add(spot, spot.target);
      floodLights.push(spot);
    }
  const hemi = scene.children.find((c) => (c as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  scene.add(await buildTrails());
  const rocks = await buildRocks(preset.terrainSegments > 260 ? 1600 : 900);
  scene.add(rocks.group);
  loadProgress.value = 0.85;

  const { RAPIER, world, terrainHandle } = await createPhysics(terrain.physics, [...outpost.colliders, ...rocks.colliders]);
  // The rover: parked by the habitat until Mission 7, then drivable.
  const rover = new Rover(RAPIER, world, outpost.rover, terrainHandle);
  const roverPark = { pos: outpost.rover.position.clone(), yaw: outpost.rover.rotation.y };
  rover.onBump = (k) => thud(2 + k * 4);
  // HAB-2 (none before Mission 4, packed, then inflated) and the greenhouse (once assembled).
  const setHab2Collider = dynamicCollider();
  const setGhCollider = dynamicCollider();
  const bermColliders = Object.fromEntries(BERMS.map((b) => [b, dynamicCollider()])) as Record<(typeof BERMS)[number], ReturnType<typeof dynamicCollider>>;
  const startPos = new THREE.Vector3(LAYOUT.lander.x - 3, 0, LAYOUT.lander.z - 6);
  startPos.y = heightAt(startPos.x, startPos.z);
  const startYaw = Math.atan2(-(LAYOUT.base.x - startPos.x), -(LAYOUT.base.z - startPos.z));
  player = new Player(RAPIER, world, input, camera, startPos);
  player.yaw = startYaw;
  player.onLand = (fall) => thud(fall);
  player.onStep = (k) => sfx('step', k);
  player.onJump = () => sfx('jump');
  player.onBoundary = () => {
    pushComm('mc', 'c.boundary');
    void playVoice('boundary');
  };
  scenes = buildCutscenes(scene, outpost, { pos: startPos, yaw: startYaw });
  const spawnAt = (x: number, z: number, look: THREE.Vector3) => {
    const pos = new THREE.Vector3(x, heightAt(x, z), z);
    return { pos, yaw: Math.atan2(-(look.x - pos.x), -(look.z - pos.z)) };
  };
  // Missions 2 and 3 start just outside the airlock, as if the crew had rested inside.
  registry.set(1, { m: new Mission1(outpost), spawn: { pos: startPos, yaw: startYaw }, intro: scenes.intro, ending: scenes.m1End });
  registry.set(2, { m: new Mission2(outpost), spawn: spawnAt(LAYOUT.base.x - 9, LAYOUT.base.z + 4, outpost.lifeSupport.pos), intro: scenes.m2Intro, ending: scenes.m2End });
  registry.set(3, { m: new Mission3(outpost), spawn: spawnAt(LAYOUT.base.x - 9, LAYOUT.base.z + 4, outpost.power.pos), intro: scenes.m3Intro, ending: scenes.m3End });
  registry.set(7, { m: new Mission7(outpost), spawn: spawnAt(LAYOUT.base.x - 5, LAYOUT.base.z + 9, outpost.rover.position), intro: scenes.m7Intro, ending: scenes.m7End, day: 16 });
  registry.set(6, { m: new Mission6(outpost), spawn: spawnAt(LAYOUT.base.x - 9, LAYOUT.base.z + 4, outpost.radiation.monitorPos), intro: scenes.m6Intro, ending: scenes.m6End, day: 14 });
  registry.set(5, { m: new Mission5(outpost), spawn: spawnAt(LAYOUT.base.x - 7, LAYOUT.base.z + 5.5, outpost.hab2.buildTerminalPos), intro: scenes.m5Intro, ending: scenes.m5End });
  registry.set(4, { m: new Mission4(outpost), spawn: spawnAt(LAYOUT.base.x - 7, LAYOUT.base.z + 5.5, outpost.hab2.buildTerminalPos), intro: scenes.m4Intro, ending: scenes.m4End });
  for (const [n, e] of registry)
    e.m.onFinished = () => {
      panel.value = null;
      terminal.value = null;
      missionDone(n);
      playCut(e.ending, () => (screen.value = 'complete'));
    };
  // Space, Enter or Esc skips a cutscene.
  addEventListener('keydown', (e) => {
    if (screen.value === 'cutscene' && ['Space', 'Enter', 'Escape'].includes(e.code)) {
      e.preventDefault();
      cut.skip();
    }
  });
  loadProgress.value = 1;

  /** Puts the world in the state the current mission starts from (earlier missions' work done). */
  function setupWorld(n: number) {
    sunPath(0);
    gameSpeed.value = NORMAL_SPEED;
    if (n >= 3) {
      lifeOnline();
      const l = outpost.lifeSupport.lights;
      l.o2.material = l.water.material = l.co2.material = statusMaterials.green;
    } else resetLife();
    if (n >= 4) powerOnline();
    else resetPower();
    // Mission 4 builds HAB-2 from 8 construction kits; a cargo drop brings 4 more for
    // Mission 5's greenhouse. Later missions start with both finished.
    if (n >= 5) habitatDone();
    else resetHabitat();
    if (n >= 6) {
      greenhouseDone(18);
      resetConstruction(1, ['hab', 'greenhouse']);
    } else {
      resetGreenhouse(30 - (n - 1));
      resetConstruction(n === 5 ? 6 : 8, n === 5 ? ['hab'] : []);
    }
    resetCrew(n);
    if (n >= 7) radiationDone();
    else resetRadiation();
    resetScience();
    leaveRover(false);
    rover.place(roverPark.pos, roverPark.yaw);
    rover.battery = 100;
    // The packed module only arrives on its pad for Mission 4.
    const h2 = outpost.hab2;
    h2.shell.visible = n >= 4;
    for (const b of h2.bands) b.visible = n >= 4;
  }

  /** A collider that changes with the world (modules that inflate or get built). */
  function dynamicCollider() {
    let current: ColliderSpec | null = null;
    let handle: ReturnType<typeof addCollider> | null = null;
    return (spec: ColliderSpec | null) => {
      if (spec === current) return;
      if (handle) world.removeCollider(handle, false);
      handle = spec ? addCollider(world, spec) : null;
      current = spec;
    };
  }

  function resetMission() {
    for (const e of registry.values()) e.m.end?.();
    started = false;
    terminal.value = null;
    setupWorld(missionNumber.value);
    const sp = current().spawn;
    player!.teleport(sp.pos, sp.yaw);
    player!.pitch = 0;
    player!.stats = { distance: 0, jumps: 0 };
    suit.value = { o2: 100, power: 100, health: 100, tempIn: 21, tempOut: -48, dose: 0, light: false };
    clock.value = { day: 1, minutes: 6 * 60 + 10 };
    comms.value = [];
    warning.value = null;
    lowO2Warned = false;
  }

  /** Where the camera looks (works on foot and from the rover seat). */
  const viewDir = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

  // ---------- rover: getting in and out ----------
  function enterRover() {
    rover.driving = true;
    rover.lookYaw = 0;
    rover.lookPitch = -0.08;
    player!.setEnabled(false);
    prompt.value = null;
    sfx('clunk');
    drive.value = { driving: true, speed: 0, battery: rover.battery };
  }
  function leaveRover(sound = true) {
    if (!rover.driving) return;
    const out = rover.exitPoint();
    // Boxed in (by a wall or rocks): say so, unless the mission is resetting anyway.
    if (!out && sound) {
      beep('warn');
      flash('w.noRoomExit');
      return;
    }
    rover.driving = false;
    rover.speed = 0;
    player!.setEnabled(true);
    player!.teleport(out ?? rover.obj.position.clone().add(new THREE.Vector3(0, 2.2, 0)), rover.yaw - Math.PI / 2);
    player!.pitch = 0;
    if (sound) sfx('clunk');
    drive.value = { driving: false, speed: 0, battery: rover.battery };
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
    const l = current().m.label(it.id);
    if (l) return l;
    if (it.id === 'o2') return suit.value.o2 > 98 ? 'p.o2full' : 'p.o2refill';
    return it.label();
  }

  function use(it: Interactable) {
    if (it.id === 'rover') {
      enterRover();
      current().m.interact('rover');
      return;
    }
    if (it.id === 'o2') {
      if (suit.value.o2 > 98) return;
      suit.value = { ...suit.value, o2: 100 };
      lowO2Warned = false;
      sfx('refill');
      pushComm('mc', 'c.o2refill');
      void playVoice('o2_refill');
      return;
    }
    const reason = current().m.interact(it.id);
    if (reason) {
      beep('warn');
      flash(reason);
    }
    if (terminal.value) input.unlock();
    // At a solar tower, look up at it so you can watch it deploy and turn.
    if (terminal.value === 'array') {
      const rig = outpost.arrays[Number(it.id.split('-')[1])];
      const eye = camera.position;
      const top = rig.pos.clone().add(new THREE.Vector3(0, rig.height * 0.42, 0));
      player!.yaw = Math.atan2(-(top.x - eye.x), -(top.z - eye.z));
      player!.pitch = Math.min(1.0, Math.atan2(top.y - eye.y, Math.hypot(top.x - eye.x, top.z - eye.z)));
    }
  }
  let holdTime = 0;
  /** Visible all the way up the scene graph. */
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));

  // ---------- guidance: where to go next ----------
  const ctx = (): MissionCtx => ({
    feet: rover.driving ? rover.obj.position.clone() : player!.feet,
    look: viewDir(),
    eye: camera.position,
    distance: player!.stats.distance,
    jumps: player!.stats.jumps,
    playing: screen.value === 'playing' && !panel.value && !terminal.value,
  });

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
    const target = screen.value === 'playing' && !terminal.value && player ? current().m.guide(ctx()) : null;
    if (!target || !player) {
      if (waypoint.value) waypoint.value = null;
      beam.visible = false;
      return;
    }
    const feet = rover.driving ? rover.obj.position : player.feet;
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
    const playing = inMission && !terminal.value;

    if (screen.value === 'cutscene') cut.update(dt, camera);
    else if (player && rover.driving) {
      // Driving: the rover moves and steps the physics; E gets out. Paused or a panel: it waits.
      if (inMission) rover.update(dt, input, playing);
      else input.takeLook();
      rover.applyCamera(camera);
      if (playing) {
        if (input.pressed('KeyE')) leaveRover();
        if (input.pressed('KeyC') && missionNumber.value >= 4) {
          panel.value = 'crew';
          input.unlock();
        }
        if (input.pressed('KeyK')) {
          panel.value = 'knowledge';
          input.unlock();
        }
        simulateSuit(dt);
      }
      prompt.value = null;
      focused = null;
      if (inMission && started) {
        current().m.update(dt, ctx());
        advanceClock(dt);
      }
      input.endFrame();
      if (rover.driving) drive.value = { driving: true, speed: rover.speed, battery: rover.battery };
    } else if (player) {
      player.update(dt, playing);
      if (playing) {
        const m = current().m;
        const holdSecs = m.holdSeconds ?? 2.5;
        const holdId = focused && (m.canHold ? m.canHold(focused.id) : focused.id === m.holdId) ? focused.id : null;
        if (focused && holdId) {
          // Hold E to do a repair: keep looking at the part while holding the key.
          input.pressed('KeyE');
          const before = holdTime;
          holdTime = input.isDown('KeyE') ? holdTime + dt : 0;
          // A ratchet sound every 0.35 s while the wrench turns.
          if (holdTime > 0 && Math.floor(holdTime / 0.35) !== Math.floor(before / 0.35)) sfx('ratchet');
          holdProgress.value = holdTime > 0 ? Math.min(1, holdTime / holdSecs) : null;
          if (holdTime >= holdSecs) {
            holdTime = 0;
            holdProgress.value = null;
            m.holdComplete?.(holdId);
            sfx('clunk');
          }
        } else {
          holdTime = 0;
          holdProgress.value = null;
          if (input.pressed('KeyE') && focused) use(focused);
        }
        if (input.pressed('KeyF')) {
          suit.value = { ...suit.value, light: !suit.value.light };
          sfx('lamp');
        }
        if (input.pressed('KeyK')) {
          panel.value = 'knowledge';
          input.unlock();
        }
        if (input.pressed('KeyC') && missionNumber.value >= 4) {
          panel.value = 'crew';
          input.unlock();
        }
        // Focus the interactable under the crosshair.
        ray.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hit = ray.intersectObjects(targets, false)[0];
        focused = hit ? (byObject.get(hit.object) ?? null) : null;
        // Ignore things not in use yet: before their mission, or hidden (raycasts still hit hidden meshes).
        if (focused && ((focused.minMission ?? 0) > missionNumber.value || !shown(focused.object))) focused = null;
        prompt.value = focused ? labelFor(focused) : null;

        simulateSuit(dt);
      } else prompt.value = null;
      if (inMission && started) {
        // Missions keep running while a terminal is open (machines don't stop).
        current().m.update(dt, ctx());
        advanceClock(dt);
      }
      input.endFrame();
    }

    lamp.intensity = suit.value.light ? 30 : 0;
    // Running machines hum through the ground and the suit when you stand close.
    if (player && screen.value === 'playing') {
      const f = player.feet;
      const near = (p: THREE.Vector3, r: number) => Math.max(0, 1 - Math.hypot(f.x - p.x, f.z - p.z) / r);
      const lsRunning = missionNumber.value === 1 || life.value.o2gen === 'online' ? 1 : 0.4;
      const pduRunning = power.value.bus ? 0.8 : 0.15;
      if (rover.driving) setHum(0.25 + (Math.abs(rover.speed) / 5.5) * 0.6);
      else
      setHum(Math.max(near(outpost.lifeSupport.pos, 14) * lsRunning, near(outpost.habitatPos, 12) * 0.5, near(outpost.power.pos, 10) * pduRunning));
    } else setHum(0);
    syncPower();
    syncHab2();
    syncGreenhouse();
    syncRadiation();
    updateGuide(t / 1000);
    // Sunlight, ground bounce and reflections all fade when the Sun goes below the horizon.
    const day = sunlight();
    sun.intensity = 7.5 * day;
    sun.visible = day > 0.002;
    hemi.intensity = 0.32 * (0.35 + 0.65 * day);
    scene.environmentIntensity = 0.55 * (0.2 + 0.8 * day);
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
      const f = viewDir();
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
    const exertion = rover.driving ? 0.8 : player!.sprinting ? 1.8 : player!.moving ? 1.15 : 0.8;
    s.o2 = Math.max(0, s.o2 - O2_PER_SEC * exertion * dt);
    s.power = Math.max(0, s.power - (POWER_PER_SEC + (s.light ? LAMP_POWER_PER_SEC : 0)) * dt);
    if (s.power === 0) s.light = false;
    s.dose += (DOSE_PER_GAME_DAY / 86400) * gameSpeed.value * dt;
    s.tempOut = -48 + Math.sin(performance.now() / 9000) * 3;
    if (s.o2 === 0) {
      s.health = Math.max(0, s.health - 4 * dt);
      if (warningTimer <= 0) {
        flash('w.o2depleted', 1);
        sfx('alarm');
      }
    } else if (s.o2 < 15 && warningTimer <= 0) flash('w.o2critical', 1);
    if (s.o2 < 30 && !lowO2Warned) {
      lowO2Warned = true;
      sfx('alarm');
      pushComm('mc', 'c.o2low');
      void playVoice('o2_low');
    }
    if (s.health === 0) {
      flash('w.blackout', 5);
      player!.teleport(current().spawn.pos, current().spawn.yaw);
      s.o2 = 100;
      s.health = 60;
      lowO2Warned = false;
    }
    suit.value = s;
    setExertion(player!.sprinting && !rover.driving ? 1 : s.o2 < 20 ? 0.8 : 0.2);
  }

  function advanceClock(dt: number) {
    const minutes = clock.value.minutes + (dt * gameSpeed.value) / 60;
    clock.value = { day: (current().day ?? missionNumber.value) + Math.floor((minutes - 6 * 60 - 10) / 1440), minutes };
  }

  // ---------- HAB-2 visuals: tunnel, inflating shell, windows ----------
  function syncHab2() {
    const h = habitat.value;
    const rig = outpost.hab2;
    rig.tunnel.scale.z = Math.max(0.001, h.tunnel);
    rig.tunnel.visible = h.tunnel > 0;
    rig.cover.visible = h.tunnel < 0.02;
    // Fabric fills out quickly at first, then slowly stretches tight against the straps.
    const k = 1 - Math.pow(1 - h.inflate, 2.2);
    const r = THREE.MathUtils.lerp(rig.packed.r, 1, Math.min(1, k * 1.15));
    rig.shell.scale.set(r, r, THREE.MathUtils.lerp(rig.packed.l, 1, k));
    for (const b of rig.bands) b.visible = rig.shell.visible && h.inflate === 0 && !h.inflating;
    rig.valveLight.material = h.inflate >= 1 ? statusMaterials.green : h.inflating ? statusMaterials.cyan : statusMaterials.amber;
    if (rig.glass) rig.glass.emissiveIntensity = h.crewIn ? 1.4 : h.heaters ? 0.35 : 0;
    setHab2Collider(!rig.shell.visible ? null : h.inflate >= 1 ? rig.fullCollider : rig.packedCollider);
  }

  // ---------- radiation visuals: berms rising, survey tripods, mover markers ----------
  function syncRadiation() {
    const r = rad.value;
    const rig = outpost.radiation;
    const n = missionNumber.value;
    for (const b of BERMS) {
      const h = r.berms[b];
      const parts = rig.berms[b];
      parts.mesh.visible = h > 0;
      parts.mesh.scale.y = Math.max(0.02, towerEase(h) * 1.25);
      parts.marker.visible = n === 6;
      parts.light.material = h >= 1 ? statusMaterials.green : r.piling === b ? statusMaterials.cyan : statusMaterials.amber;
      // Wait until the player has stepped off the spot before the wall becomes solid.
      const c = parts.collider as { center: THREE.Vector3; half: THREE.Vector3 };
      const f = player!.feet;
      const inside = Math.abs(f.x - c.center.x) < c.half.x + 0.4 && Math.abs(f.z - c.center.z) < c.half.z + 0.4;
      if (h < 1) bermColliders[b](null);
      else if (!inside) bermColliders[b](parts.collider);
    }
    // Survey tripods are only out during Mission 6's survey (the berms later bury that ground).
    const surveying = n === 6 && BERMS.every((b) => r.berms[b] === 0);
    for (const id of ['hab1', 'hab2', 'gh'] as const) {
      rig.survey[id].group.visible = surveying;
      rig.survey[id].light.material = r.scans.includes(id) ? statusMaterials.green : statusMaterials.cyan;
    }
  }

  // ---------- greenhouse visuals: assembly and grow lights ----------
  function syncGreenhouse() {
    const g = greenhouse.value;
    const rig = outpost.greenhouse;
    rig.body.visible = g.built;
    rig.body.scale.z = Math.max(0.04, towerEase(g.assemble));
    rig.tunnel.visible = g.assemble >= 1;
    for (const h of rig.hatchParts) h.visible = g.assemble >= 1;
    // Pink-purple: the red and blue LEDs plants use most.
    if (rig.glass) rig.glass.emissiveIntensity = g.light && g.tank ? 2.6 : 0;
    setGhCollider(g.assemble >= 1 ? rig.collider : null);
  }

  // ---------- power system visuals (solar towers, battery gauges, main switch, floodlights) ----------
  const towerEase = (x: number) => x * x * (3 - 2 * x);
  function syncPower() {
    const p = power.value;
    outpost.arrays.forEach((rig, i) => {
      const a = p.arrays[i];
      // The mast extends first, then the blankets roll down.
      rig.upper.position.y = THREE.MathUtils.lerp(rig.stowedY, rig.deployedY, towerEase(Math.min(1, a.deploy / 0.55)));
      const unroll = Math.max(0.02, towerEase(Math.max(0, (a.deploy - 0.45) / 0.55)));
      for (const w of rig.wings) w.scale.y = unroll;
      rig.head.rotation.y = THREE.MathUtils.degToRad(a.yaw) - rig.group.rotation.y;
      rig.light.material = a.tracking ? statusMaterials.green : a.deploy >= 1 ? statusMaterials.cyan : statusMaterials.amber;
    });
    const charge = p.batteryKWh / BATTERY_KWH;
    const gaugeMat = charge > 0.5 ? statusMaterials.green : charge > 0.2 ? statusMaterials.amber : statusMaterials.red;
    for (const g of outpost.power.gauges) {
      g.scale.y = Math.max(0.03, charge);
      g.material = gaugeMat;
    }
    outpost.power.busLight.material = p.bus ? statusMaterials.green : statusMaterials.red;
    const lever = outpost.power.lever;
    lever.rotation.z += ((p.bus ? Math.PI - 0.9 : 0.9) - lever.rotation.z) * 0.15;
    const floodOn = p.loads.flood;
    for (const f of floodLights) f.intensity = floodOn ? 9 : 0;
    if (outpost.floodLamp) outpost.floodLamp.emissiveIntensity = floodOn ? 1 : 0;
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
        play: () => {
          cut.skip();
          return actions.resume();
        },
        skip: () => cut.skip(),
        cut: (name: keyof NonNullable<typeof scenes>) => playCut(scenes![name], () => (screen.value = 'menu')),
        /** Jump straight to mission n (skips the lock), playing its intro. */
        mission: (n: number) => openMission(n),
        /** Stand `dist` metres in front of an interactable, looking at it. */
        goTo: (id: string, dist = 1.6, angle?: number) => {
          const it = outpost.interactables.find((i) => i.id === id)!;
          const p = it.object.getWorldPosition(new THREE.Vector3());
          const f = player!.feet;
          const a = angle ?? Math.atan2(f.x - p.x, f.z - p.z);
          const x = p.x + Math.sin(a) * dist;
          const z = p.z + Math.cos(a) * dist;
          const feet = new THREE.Vector3(x, heightAt(x, z), z);
          player!.teleport(feet, Math.atan2(-(p.x - x), -(p.z - z)));
          player!.pitch = Math.atan2(p.y - (feet.y + 1.62), dist);
        },
        power: () => ({ ...power.value, sunYaw: sunYaw() }),
        habitat: () => habitat.value,
        greenhouse: () => greenhouse.value,
        rad: () => rad.value,
        science: () => science.value,
        /** Put the rover somewhere (and keep driving if in it). */
        roverTo: (x: number, z: number, yaw = 0) => rover.place(new THREE.Vector3(x, 0, z), yaw),
        drive: (ms: number) => {
          dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
          setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })), ms);
        },
        rover: () => ({ driving: rover.driving, speed: rover.speed, x: rover.obj.position.x, z: rover.obj.position.z, battery: rover.battery }),
        crew: () => crew.value,
        speed: () => gameSpeed.value,
        progress: () => progress.value,
        cutscene: () => screen.value === 'cutscene',
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
        state: () => ({ mission: missionNumber.value, terminal: terminal.value, screen: screen.value, suit: suit.value, stats: player!.stats, pos: player!.feet, grounded: player!.grounded }),
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
        sfx: (n: Sfx) => sfx(n),
        audio: () => audioState(),
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
