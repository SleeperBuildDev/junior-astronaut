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
import { audioState, beep, muteGame, playVoice, setExertion, setHum, sfx, startAudio, stopVoices, thud, type Sfx } from './audio/audio';
import { createRenderer, Pipeline, PRESETS } from './engine/renderer';
import { settings, updateSettings, type Quality } from './engine/settings';
import { life, lifeOnline, resetLife, SAFE_O2 } from './game/lifesupport';
import { buildCutscenes, CutscenePlayer, type Shot } from './game/cutscenes';
import type { GameMission, MissionCtx } from './game/mission';
import { Mission1 } from './game/mission1';
import { Mission2 } from './game/mission2';
import { Mission3 } from './game/mission3';
import { Mission4 } from './game/mission4';
import { Mission5 } from './game/mission5';
import { Mission6 } from './game/mission6';
import { Mission7 } from './game/mission7';
import { Mission8 } from './game/mission8';
import { Mission9 } from './game/mission9';
import { resetSettlement, settlement } from './game/settlement';
import { emergency, resetEmergency } from './game/emergency';
import { resetScience, science } from './game/science';
import { Rover } from './player/rover';
import { crew } from './game/crew';
import { BERMS, rad, radiationDone, resetRadiation } from './game/radiation';
import { greenhouse, greenhouseDone, resetGreenhouse } from './game/greenhouse';
import { resetConstruction } from './game/construction';
import { resetCrew } from './game/crew';
import { habitat, habitatDone, resetHabitat } from './game/habitat';
import { capacityKWh, power, powerOnline, resetPower, setArrayHealth, sunYaw } from './game/power';
import { MISSION_COUNT, missionDone, progress } from './game/save';
import { airlockKpa, cardPopup, clock, fade, visorFx, habInside, habLights, knowledge, legend, comms, drive, fps, gameSpeed, heading, holdProgress, loadProgress, missionNumber, NORMAL_SPEED, panel, prompt, pushComm, screen, suit, terminal, unlock, warning, waypoint } from './game/state';
import { Input } from './player/input';
import { addCollider, createPhysics } from './player/physics';
import { Player } from './player/player';
import { ease, look, Moves, path, type Step } from './player/moves';
import { App, type Actions } from './ui/App';
import { loadTextures } from './world/assets';
import { buildOutpost, statusMaterials, type ColliderSpec, type Interactable, type OutpostModels } from './world/base';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { heightAt, LAYOUT } from './world/heightfield';
import { buildInterior } from './world/interior';
import { buildRocks } from './world/rocks';
import { buildTrails } from './world/trails';
import { Astronaut, MIRROR_LAYER, SHADOW_LAYER } from './world/astronaut';
import { shake } from './engine/shake';
import { buildGroundEffects } from './world/effects';
import { buildDiscoveries } from './game/discoveries';
import { buildSky, EARTH_DIR, SUN_DIR, sunlight, sunPath } from './world/sky';
import { buildTerrain, regolithMaterial } from './world/terrain';

const QA = new URLSearchParams(location.search).has('qa');
/** ?film: the music video (src/mtv/film.ts), stepped frame by frame by qa/film.mjs. */
const FILM = new URLSearchParams(location.search).has('film');

// Suit model (simplified for gameplay): a real suit holds about 8 hours of oxygen.
const O2_PER_SEC = 100 / (14 * 60); // a full tank lasts ~14 real minutes of walking
const HAB_O2_PER_SEC = 0.6; // inside HAB-1 the suit tank refills from the cabin supply (empty to full in ~3 min)
const EYE_HEIGHT = 1.67; // player camera above the feet
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
  let mvStarted = 0;
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
    playMusicVideo() {
      input.enabled = false;
      input.unlock();
      panel.value = null;
      prompt.value = null;
      stopVoices(); // a narration still going would only freeze, then finish over the complete screen
      muteGame(true);
      mvStarted = performance.now();
      screen.value = 'mtv';
    },
    endMusicVideo() {
      if (screen.value !== 'mtv') return;
      muteGame(false);
      screen.value = 'complete';
    },
    setQuality(q: Quality) {
      updateSettings({ quality: q });
      pipeline.apply(q);
      sun.shadow.mapSize.setScalar(PRESETS[q].shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      me.setShadows(q !== 'low');
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
    if (!terminal.value) return;
    sfx('terminal');
    input.unlock();
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
  const terrainMat = regolithMaterial(tex.regolith);
  const terrain = buildTerrain(terrainMat, preset.terrainSegments);
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
  sun.shadow.camera.layers.enable(SHADOW_LAYER);
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
  // HAB-1's inside: you walk in through the airlock.
  const interior = buildInterior(outpost.habitatPos);
  scene.add(interior.group);
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
  // Boot prints, rover tracks and dust; your astronaut (cutscenes) and its shadow (play).
  const fx = buildGroundEffects(settings.value.quality);
  scene.add(fx.group);
  const astronaut = new Astronaut();
  astronaut.root.visible = false;
  scene.add(astronaut.root);
  // Your own body: you see it when you look down, in mirrors, and as your long shadow. A little
  // smaller than the cutscene astronaut so your eyes sit inside its helmet (which, with the
  // backpack, only mirrors and the shadow camera draw).
  const me = new Astronaut();
  me.root.scale.setScalar(0.9);
  me.firstPerson(true);
  me.setShadows(settings.value.quality !== 'low');
  me.root.visible = false;
  scene.add(me.root);
  sun.shadow.camera.layers.enable(MIRROR_LAYER);
  for (const m of [interior.mirror, outpost.outsideMirror]) m.getReflectionCamera(camera).layers.enable(MIRROR_LAYER);
  const outsideMirrorPos = outpost.outsideMirror.getWorldPosition(new THREE.Vector3());
  // Depth of field in cutscenes focuses where the shot looks (every shot aims with lookAt).
  const focusPoint = new THREE.Vector3();
  let focusFrame = -1;
  let frameNo = 0;
  const camLookAt = camera.lookAt.bind(camera);
  camera.lookAt = ((x: THREE.Vector3 | number, y?: number, z?: number) => {
    if (typeof x === 'number') focusPoint.set(x, y!, z!);
    else focusPoint.copy(x);
    focusFrame = frameNo;
    camLookAt(x as never, y as never, z as never);
  }) as typeof camera.lookAt;
  const sunScale = { value: 1 };
  const discoveries = buildDiscoveries({ scene, sky: sky.group, renderer, astronaut, fx, terrainMat, sunScale, quality: () => settings.value.quality });
  scene.add(discoveries.group);
  loadProgress.value = 0.85;

  const { RAPIER, world, terrainHandle } = await createPhysics(terrain.physics, [...outpost.colliders, ...interior.colliders, ...rocks.colliders, ...discoveries.colliders]);
  // The rover: parked by the habitat until Mission 7, then drivable.
  const rover = new Rover(RAPIER, world, outpost.rover, terrainHandle);
  const roverPark = { pos: outpost.rover.position.clone(), yaw: outpost.rover.rotation.y };
  rover.onBump = (k) => {
    thud(2 + k * 4);
    shake.add(0.12 + k * 0.3);
  };
  // HAB-2 (none before Mission 4, packed, then inflated) and the greenhouse (once assembled).
  const setHab2Collider = dynamicCollider();
  const setGhCollider = dynamicCollider();
  const bermColliders = Object.fromEntries(BERMS.map((b) => [b, dynamicCollider()])) as Record<(typeof BERMS)[number], ReturnType<typeof dynamicCollider>>;
  const startPos = new THREE.Vector3(LAYOUT.lander.x - 3, 0, LAYOUT.lander.z - 6);
  startPos.y = heightAt(startPos.x, startPos.z);
  const startYaw = Math.atan2(-(LAYOUT.base.x - startPos.x), -(LAYOUT.base.z - startPos.z));
  player = new Player(RAPIER, world, input, camera, startPos);
  player.yaw = startYaw;
  player.onLand = (fall) => {
    thud(fall);
    me.land(fall);
    shake.add(THREE.MathUtils.clamp((fall - 1.2) * 0.13, 0, 0.45));
    if (!habInside.value) fx.land(player!.feet, fall);
  };
  // Camera moves (rover seat, airlock, interior stations) and the airlock's outer hatch.
  const moves = new Moves();
  let hatchOpen = 0;
  let hatchTarget = 0;
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
  const mission9 = new Mission9(outpost);
  registry.set(9, { m: mission9, spawn: spawnAt(LAYOUT.base.x - 9, LAYOUT.base.z + 4, outpost.habitatPos), intro: scenes.m9Intro, ending: scenes.m9End, day: 20 });
  actions.finishSettlement = () => mission9.finish();
  registry.set(8, { m: new Mission8(outpost), spawn: spawnAt(LAYOUT.base.x - 9, LAYOUT.base.z + 4, outpost.power.pos), intro: scenes.m8Intro, ending: scenes.m8End, day: 19 });
  registry.set(7, { m: new Mission7(outpost), spawn: spawnAt(LAYOUT.base.x - 5, LAYOUT.base.z + 9, outpost.rover.position), intro: scenes.m7Intro, ending: scenes.m7End, day: 16 });
  registry.set(6, { m: new Mission6(outpost), spawn: spawnAt(LAYOUT.base.x - 9, LAYOUT.base.z + 4, outpost.radiation.monitorPos), intro: scenes.m6Intro, ending: scenes.m6End, day: 14 });
  registry.set(5, { m: new Mission5(outpost), spawn: spawnAt(LAYOUT.base.x - 7, LAYOUT.base.z + 5.5, outpost.hab2.buildTerminalPos), intro: scenes.m5Intro, ending: scenes.m5End });
  registry.set(4, { m: new Mission4(outpost), spawn: spawnAt(LAYOUT.base.x - 7, LAYOUT.base.z + 5.5, outpost.hab2.buildTerminalPos), intro: scenes.m4Intro, ending: scenes.m4End });
  for (const [n, e] of registry)
    e.m.onFinished = () => {
      panel.value = null;
      terminal.value = null;
      missionDone(n);
      // Winning Mission 9 (the last one) plays the music video before the complete screen.
      const won = n === MISSION_COUNT && !settlement.value.failed;
      playCut(e.ending, () => (won ? actions.playMusicVideo!() : (screen.value = 'complete')));
    };
  // Space, Enter or Esc skips a cutscene or the music video. The video ignores held keys and
  // its first second, so the key that skipped the ending cutscene doesn't skip it too.
  addEventListener('keydown', (e) => {
    if (!['Space', 'Enter', 'Escape'].includes(e.code)) return;
    if (screen.value === 'cutscene') {
      e.preventDefault();
      cut.skip();
    } else if (screen.value === 'mtv') {
      e.preventDefault();
      if (!e.repeat && performance.now() - mvStarted > 1000) actions.endMusicVideo!();
    } else if (screen.value === 'playing' && moves.active && moves.skippable && e.code === 'Space' && !e.repeat) {
      moves.skip(camera);
      input.pressed('Space');
    }
  });
  // Compile the shaders for the interior lights now, so the first walk-in doesn't stutter.
  interior.setLightsOn(true);
  renderer.compile(scene, camera);
  interior.setLightsOn(false);
  effect(() => interior.setMode(habLights.value));
  // HAB-1's windows glow warm from outside; from inside the glass is clear.
  const habGlow = outpost.habGlass?.emissiveIntensity ?? 0;
  effect(() => {
    if (outpost.habGlass) outpost.habGlass.emissiveIntensity = habInside.value ? 0 : habGlow;
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
    resetEmergency();
    resetSettlement();
    // After Mission 8: tower 2 lost one panel string; tower 3 waits for its spare blanket.
    if (n >= 9) {
      setArrayHealth(1, 0.75);
      setArrayHealth(2, 0.4);
    }
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
    // A walk-in or rover move cut short (mission ended, restarted): you can walk again.
    moves.cancel();
    leaveHabitatNow();
    player!.setEnabled(true);
    holdProgress.value = null;
    for (const e of registry.values()) e.m.end?.();
    fx.clear();
    discoveries.cleanup();
    legend.value = null;
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
  const camPose = () => ({ pos: camera.position.clone(), quat: camera.quaternion.clone() });
  const roverLeft = () => new THREE.Vector3(-Math.sin(rover.yaw), 0, -Math.cos(rover.yaw));
  /** Step up beside the seat, swing in and sit down; then you drive. */
  function enterRover() {
    rover.lookYaw = 0;
    rover.lookPitch = -0.08;
    player!.setEnabled(false);
    prompt.value = null;
    const from = camPose();
    const seatCam = new THREE.PerspectiveCamera();
    rover.applyCamera(seatCam);
    const side = seatCam.position.clone().addScaledVector(roverLeft(), 0.85).add(new THREE.Vector3(0, 0.14, 0));
    let sat = false;
    moves.play(
      [
        {
          dur: 1.15,
          pose: path([from.pos, side, seatCam.position], from.quat, seatCam.quaternion, 0.2, 1),
          update: (_k, raw) => {
            if (raw > 0.82 && !sat) {
              sat = true;
              sfx('clunk');
            }
          },
        },
      ],
      camera,
      () => {
        rover.driving = true;
        drive.value = { driving: true, speed: 0, battery: rover.battery };
        current().m.interact('rover');
      },
      false,
    );
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
    rover.speed = 0;
    drive.value = { driving: false, speed: 0, battery: rover.battery };
    const yaw = rover.yaw - Math.PI / 2;
    const feet = out ?? rover.obj.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    const finish = () => {
      rover.driving = false;
      player!.setEnabled(true);
      player!.teleport(feet, yaw);
      player!.pitch = 0;
    };
    if (!sound || !out) return finish();
    // Swing the legs out over the side and step down.
    const from = camPose();
    const side = from.pos.clone().addScaledVector(roverLeft(), 0.8).add(new THREE.Vector3(0, 0.12, 0));
    sfx('clunk');
    moves.play([{ dur: 1.1, pose: path([from.pos, side, feet.clone().add(new THREE.Vector3(0, EYE_HEIGHT, 0))], from.quat, look(yaw, 0), 0, 0.8) }], camera, finish, false);
  }

  // ---------- HAB-1: walking in and out through the airlock ----------
  const H = outpost.habitatPos;
  /** World point at x along the module and y above the base pad, on the module's centre line. */
  const hp = (x: number, y: number) => new THREE.Vector3(H.x + x, H.y + y, H.z);
  const EAST = look(-Math.PI / 2, 0);
  const WEST = look(Math.PI / 2, 0);
  const CHAMBER = hp(-6.15, 2.97);
  const HAB_SPOT = hp(-3.7, 1.7);
  const walkTime = (from: THREE.Vector3, to: THREE.Vector3) => Math.min(1.4, Math.max(0.6, from.distanceTo(to) / 2.2));
  function enterHabitat() {
    player!.setEnabled(false);
    prompt.value = null;
    const from = camPose();
    const stand = hp(-7.75, 2.42); // on the top step, facing the hatch
    const steps: Step[] = [
      { dur: walkTime(from.pos, stand), pose: path([from.pos, stand], from.quat, look(-Math.PI / 2, -0.06)) },
      {
        dur: 0.9,
        start: () => {
          hatchTarget = 1;
          sfx('door');
        },
      },
      {
        dur: 1.3,
        start: () => {
          interior.setChamberAir(0);
          interior.setLightsOn(true);
        },
        pose: path([stand, hp(-7.05, 2.62), CHAMBER], look(-Math.PI / 2, -0.06), EAST),
      },
      // Look back and watch the hatch shut.
      { dur: 0.6, pose: path([CHAMBER, CHAMBER], EAST, look(Math.PI / 2 - 0.01, -0.06)) },
      {
        dur: 0.8,
        start: () => {
          hatchTarget = 0;
          sfx('door');
        },
      },
      { dur: 0.6, pose: path([CHAMBER, CHAMBER], look(Math.PI / 2 - 0.01, -0.06), EAST) },
      // Fill the chamber with air: 0 -> 101 kPa, the lamp turns from red to green.
      {
        dur: 2.4,
        start: () => sfx('hiss'),
        update: (k) => {
          airlockKpa.value = Math.round(101 * k);
          interior.setChamberAir(k);
        },
        end: () => {
          airlockKpa.value = null;
          beep('ok');
        },
      },
      {
        dur: 0.8,
        start: () => {
          interior.setInnerDoor(true);
          sfx('door');
        },
      },
      { dur: 1.4, pose: path([CHAMBER, hp(-4.55, 3.12), HAB_SPOT.clone().setY(HAB_SPOT.y + EYE_HEIGHT)], EAST, EAST) },
    ];
    moves.play(steps, camera, () => {
      habInside.value = true;
      interior.setInnerDoor(false);
      sfx('door');
      player!.setEnabled(true);
      player!.teleport(HAB_SPOT, -Math.PI / 2);
      player!.pitch = 0;
      unlock('airlock');
    });
    moves.walking = true; // your body walks in under the camera
  }
  function exitHabitat() {
    player!.setEnabled(false);
    prompt.value = null;
    const from = camPose();
    const near = hp(-3.85, 1.7 + EYE_HEIGHT);
    const outFeet = new THREE.Vector3(H.x - 9.0, 0, H.z);
    outFeet.y = heightAt(outFeet.x, outFeet.z);
    const steps: Step[] = [
      { dur: walkTime(from.pos, near), pose: path([from.pos, near], from.quat, WEST) },
      {
        dur: 0.8,
        start: () => {
          interior.setChamberAir(1);
          interior.setInnerDoor(true);
          sfx('door');
        },
      },
      { dur: 1.4, pose: path([near, hp(-4.55, 3.12), CHAMBER], WEST, WEST) },
      {
        dur: 0.8,
        start: () => {
          interior.setInnerDoor(false);
          sfx('door');
        },
      },
      // Pump the air out: 101 -> 0 kPa, green to red.
      {
        dur: 2.2,
        start: () => sfx('hiss'),
        update: (k) => {
          airlockKpa.value = Math.round(101 * (1 - k));
          interior.setChamberAir(1 - k);
        },
        end: () => {
          airlockKpa.value = null;
          beep('ok');
        },
      },
      {
        dur: 0.9,
        start: () => {
          hatchTarget = 1;
          habInside.value = false;
          sfx('door');
        },
      },
      { dur: 1.7, pose: path([CHAMBER, hp(-7.05, 2.62), hp(-7.75, 2.42), outFeet.clone().setY(outFeet.y + EYE_HEIGHT)], WEST, look(Math.PI / 2, -0.04)) },
    ];
    moves.play(steps, camera, () => {
      habInside.value = false;
      interior.setLightsOn(false);
      hatchTarget = 0;
      sfx('door');
      player!.setEnabled(true);
      player!.teleport(outFeet, Math.PI / 2);
      player!.pitch = 0;
    });
    moves.walking = true; // your body walks out under the camera
  }
  /** Mission reset or blackout: you are simply outside again. */
  function leaveHabitatNow() {
    habInside.value = false;
    interior.setLightsOn(false);
    interior.setInnerDoor(false);
    hatchTarget = 0;
    airlockKpa.value = null;
    fade.value = 0;
  }

  // ---------- HAB-1 stations ----------
  function useStation(id: string, it: Interactable) {
    const from = camPose();
    if (id === 'hab-suit') {
      // Plug the suit into the port: oxygen and battery to full.
      player!.setEnabled(false);
      moves.play(
        [
          {
            dur: 2.6,
            start: () => sfx('refill'),
            update: (k) => (holdProgress.value = k),
            end: () => (holdProgress.value = null),
          },
        ],
        camera,
        () => {
          player!.setEnabled(true);
          suit.value = { ...suit.value, o2: 100, power: 100 };
          lowO2Warned = false;
          sfx('powerup');
          flash('i.hab.suitDone');
          unlock('plss');
        },
      );
    } else if (id === 'hab-galley') {
      sfx('refill');
      suit.value = { ...suit.value, health: Math.min(100, suit.value.health + 15) };
      flash('i.hab.drink');
      unlock('foodsystem');
    } else if (id === 'hab-bike') {
      // Sit on the bike and pedal for a few seconds (good for muscles and bones).
      player!.setEnabled(false);
      const seat = interior.at(-2.36, 1.55, 0.86);
      const q = look(-Math.PI / 2, -0.12);
      moves.play(
        [
          { dur: 1.0, pose: path([from.pos, seat], from.quat, q) },
          {
            dur: 4.2,
            start: () => {
              interior.pedal(4.2);
              sfx('servo');
            },
            update: (_k, raw) => {
              moves.pose.pos.copy(seat).y += Math.abs(Math.sin(raw * 26)) * 0.018;
              moves.pose.quat.copy(q);
            },
          },
          { dur: 0.9, pose: path([seat, from.pos], q, from.quat) },
        ],
        camera,
        () => {
          player!.setEnabled(true);
          suit.value = { ...suit.value, health: Math.min(100, suit.value.health + 5) };
          flash('i.hab.bike');
          unlock('exercise');
        },
      );
    } else if (id === 'hab-console') {
      terminal.value = 'hab1';
      input.unlock();
    } else if (id === 'hab-window') {
      // Lean in to the porthole and zoom in on Earth.
      player!.setEnabled(false);
      const eye = interior.at(2.4, 1.55, -1.62);
      const q = look(Math.atan2(-EARTH_DIR.x, -EARTH_DIR.z), Math.asin(EARTH_DIR.y));
      const fov0 = camera.fov;
      const zoom = (f: number) => {
        camera.fov = f;
        camera.updateProjectionMatrix();
      };
      moves.play(
        [
          { dur: 1.2, pose: path([from.pos, eye], from.quat, q) },
          { dur: 1.6, update: (k) => zoom(fov0 + (22 - fov0) * k) },
          { dur: 3.0 },
          { dur: 1.2, update: (k) => zoom(22 + (fov0 - 22) * k) },
          { dur: 1.0, pose: path([eye, from.pos], q, from.quat) },
        ],
        camera,
        () => {
          zoom(fov0);
          player!.setEnabled(true);
          unlock('earth');
        },
      );
    } else if (id === 'hab-bunk') {
      // Lie down in the sleep station for a rest: the screen fades out and back in.
      player!.setEnabled(false);
      // Sit on the edge of the bunk, looking in at the pillow and the reading light.
      const p = it.object.getWorldPosition(new THREE.Vector3());
      const side = Math.sign(p.z - H.z);
      const eye = new THREE.Vector3(p.x - 0.2, interior.floor + 1.25, p.z - side * 0.42);
      const pillow = new THREE.Vector3(p.x + 0.5, interior.floor + 0.45, p.z);
      const d = pillow.clone().sub(eye);
      const q = look(Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z)));
      moves.play(
        [
          { dur: 1.1, pose: path([from.pos, eye], from.quat, q) },
          { dur: 1.0, update: (k) => (fade.value = k) },
          { dur: 1.6, start: () => (suit.value = { ...suit.value, health: 100 }) },
          { dur: 1.0, update: (k) => (fade.value = 1 - k) },
          { dur: 1.0, pose: path([eye, from.pos], q, from.quat) },
        ],
        camera,
        () => {
          fade.value = 0;
          player!.setEnabled(true);
          flash('i.hab.rested');
          unlock('sleep');
        },
      );
    } else if (id === 'hab-node') {
      beep('warn');
      flash('w.hab.node');
    }
  }

  // ---------- interaction ----------
  const ray = new THREE.Raycaster();
  ray.far = 3.4;
  const allInteractables = [...outpost.interactables, ...interior.interactables, ...discoveries.interactables];
  const targets = allInteractables.map((i) => i.object);
  const byObject = new Map<THREE.Object3D, Interactable>(allInteractables.map((i) => [i.object, i]));
  const indoor = new Set<Interactable>(interior.interactables);
  let focused: Interactable | null = null;
  let warningTimer = 0;
  const flash = (msg: string, secs = 3) => {
    warning.value = msg;
    warningTimer = secs;
  };

  /** A secret find: the legendary cutscene, then the gold card screen. */
  function playDiscovery(id: string) {
    legend.value = id;
    const shots = discoveries.shots(id, player!.feet.clone());
    playCut(shots, () => {
      discoveries.cleanup();
      camera.fov = settings.value.fov + (player!.sprinting ? 4 : 0);
      camera.updateProjectionMatrix();
      if (!knowledge.value.includes(id)) knowledge.value = [...knowledge.value, id];
      screen.value = 'discovery';
      sfx('unlock');
    });
  }
  actions.closeDiscovery = () => {
    legend.value = null;
    void actions.resume();
  };

  function labelFor(it: Interactable) {
    const secret = discoveries.idOf(it.id);
    if (secret) return knowledge.value.includes(secret) ? 'p.disc.again' : 'p.disc';
    const l = current().m.label(it.id);
    if (l) return l;
    if (it.id === 'airlock' && missionNumber.value !== 1) return 'p.hab.enter';
    if (it.id === 'hab-exit') return current().m.label('airlock') ?? it.label();
    if (it.id === 'o2') return suit.value.o2 > 98 ? 'p.o2full' : 'p.o2refill';
    return it.label();
  }

  function use(it: Interactable) {
    const secret = discoveries.idOf(it.id);
    if (secret) return playDiscovery(secret);
    if (it.id === 'rover') return enterRover();
    // The airlock leads into HAB-1, unless the mission needs it (the storm shelter, Mission 1's ending).
    const lockClaimed = missionNumber.value === 1 || !!current().m.label('airlock');
    if (it.id === 'airlock' && !lockClaimed) return enterHabitat();
    if (it.id === 'hab-exit') {
      if (!lockClaimed) return exitHabitat();
      const reason = current().m.interact('airlock');
      if (reason) {
        beep('warn');
        flash(reason);
      }
      if (terminal.value) input.unlock();
      return;
    }
    if (it.id.startsWith('hab-')) return useStation(it.id, it);
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
    let target = screen.value === 'playing' && !terminal.value && player && !moves.active ? current().m.guide(ctx()) : null;
    // Inside HAB-1 every job is outside (or in the shelter): point at the way out.
    if (target && habInside.value) target = { pos: interior.at(-4.5, 1.3, 0), label: current().m.label('airlock') ? target.label : 'wp.hab.exit' };
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

  const lastFeet = new THREE.Vector3();
  const bodyVel = new THREE.Vector3();
  const printFeet = new THREE.Vector3();
  let walkAcc = 0;
  const loop = (t: number) => {
    timer.update(t);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (screen.value === 'mtv') return; // the video covers the screen: leave the GPU to it
    const inMission = screen.value === 'playing' && !panel.value;
    const playing = inMission && !terminal.value;

    if (screen.value === 'cutscene') cut.update(dt, camera);
    else if (player && moves.active) {
      // A camera move (rover seat, airlock, a station): the world and the mission keep going.
      if (inMission) moves.update(dt, camera);
      input.takeLook();
      prompt.value = null;
      focused = null;
      if (playing) simulateSuit(dt);
      if (inMission && started) {
        current().m.update(dt, ctx());
        advanceClock(dt);
      }
      input.endFrame();
    } else if (player && rover.driving) {
      // Driving: the rover moves and steps the physics; E gets out. Paused or a panel: it waits.
      if (inMission) {
        rover.update(dt, input, playing);
        fx.roll(rover.obj.position, rover.yaw, rover.speed, dt);
      } else input.takeLook();
      rover.applyCamera(camera);
      if (playing) {
        if (input.pressed('KeyE')) leaveRover();
        if (input.pressed('KeyC') && missionNumber.value >= 4) {
          panel.value = 'crew';
          input.unlock();
        }
        if (input.pressed('KeyT') && missionNumber.value === 9) {
          panel.value = 'colony';
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
        if (input.pressed('KeyT') && missionNumber.value === 9) {
          panel.value = 'colony';
          input.unlock();
        }
        // Focus the interactable under the crosshair.
        ray.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hit = ray.intersectObjects(targets, false)[0];
        focused = hit ? (byObject.get(hit.object) ?? null) : null;
        // Ignore things not in use yet: before their mission, or hidden (raycasts still hit hidden meshes).
        if (focused && ((focused.minMission ?? 0) > missionNumber.value || !shown(focused.object))) focused = null;
        // The hull is in between: no using HAB-1's stations from outside, or the outside from in there.
        if (focused && indoor.has(focused) !== habInside.value) focused = null;
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
    syncEmergency(dt);
    updateGuide(t / 1000);
    // Sunlight, ground bounce and reflections all fade when the Sun goes below the horizon.
    const day = sunlight();
    sun.intensity = 7.5 * day * sunScale.value;
    sun.visible = day > 0.002;
    hemi.intensity = 0.32 * (0.35 + 0.65 * day);
    scene.environmentIntensity = 0.55 * (0.2 + 0.8 * day);
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, 300);
    sun.target.position.copy(camera.position);
    sky.update(camera);
    fx.update(dt);
    // Secret finds of this mission: glints and the scanner chirp.
    discoveries.update(dt, missionNumber.value, player && screen.value === 'playing' && !rover.driving && !habInside.value ? player.feet : null, knowledge.value, suit.value.light, screen.value === 'cutscene');
    // The airlock's outer hatch swings to where the walk-in/out wants it; the interior animates.
    hatchOpen += THREE.MathUtils.clamp(hatchTarget - hatchOpen, -dt / 0.85, dt / 0.85);
    outpost.airlockHatch.rotation.y = ease(hatchOpen) * 1.75;
    interior.update(dt, suit.value);
    // A boot print every 0.7 m walked (one real stride), alternating left and right.
    if (player && screen.value === 'playing' && !rover.driving && !habInside.value && !moves.active) {
      const f = player.feet;
      const moved = Math.hypot(f.x - printFeet.x, f.z - printFeet.z);
      if (moved > 3) printFeet.copy(f); // teleported
      else if (player.grounded) {
        walkAcc += moved;
        if (walkAcc >= 0.7) {
          walkAcc = 0;
          fx.step(f, player.yaw, Math.min(1, 0.45 + moved / dt / 8));
        }
      }
      printFeet.copy(f);
    }
    updateBody(dt);
    updateMirrors();
    updateLens(dt, t / 1000);
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
    // Camera shake for this frame only: the camera goes back where the game put it after drawing.
    shakePos.copy(camera.position);
    shakeQuat.copy(camera.quaternion);
    if (screen.value === 'playing' || screen.value === 'cutscene') shake.apply(camera, dt, settings.value.motion ?? 1);
    else shake.reset();
    pipeline.render(dt);
    camera.position.copy(shakePos);
    camera.quaternion.copy(shakeQuat);
    frameNo++;
  };
  renderer.setAnimationLoop(FILM ? null : loop);

  // ---------- your body, mirrors, the helmet's view ----------
  const shakePos = new THREE.Vector3();
  const shakeQuat = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  const SEAT_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  let bodyMode: 'hidden' | 'walk' | 'move' | 'seat' = 'hidden';
  let perfOff = new Set<string>(); // QA: effects switched off for measuring

  /** Your body under the camera: walking, walking through the airlock, or sitting in the rover. */
  function updateBody(dt: number) {
    const firstPerson = !!player && (screen.value === 'playing' || screen.value === 'paused');
    let mode: typeof bodyMode = 'hidden';
    if (firstPerson) mode = moves.active ? (moves.walking ? 'move' : 'hidden') : rover.driving ? 'seat' : 'walk';
    const was = bodyMode;
    bodyMode = mode;
    me.root.visible = mode !== 'hidden' && !perfOff.has('body');
    if (mode === 'hidden' || dt <= 0) return;
    if (mode === 'seat') {
      if (was !== 'seat') me.pose('sit', 0);
      me.update(dt);
      me.root.quaternion.copy(rover.obj.quaternion).multiply(SEAT_TURN);
      // Put the helmet where the camera is (eyes a little in front of the helmet's centre).
      me.root.updateMatrixWorld(true);
      me.visorWorld(tmpV);
      const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(rover.obj.quaternion);
      me.root.position.add(camera.position.clone().addScaledVector(fwd, -0.09).sub(tmpV));
      return;
    }
    let yaw: number;
    const feet = new THREE.Vector3();
    if (mode === 'walk') {
      feet.copy(player!.feet);
      yaw = player!.yaw;
    } else {
      feet.copy(camera.position).setY(camera.position.y - EYE_HEIGHT);
      yaw = tmpE.setFromQuaternion(camera.quaternion, 'YXZ').y;
    }
    if (was !== mode) {
      me.resetGait();
      lastFeet.copy(feet);
      bodyVel.set(0, 0, 0);
      me.root.rotation.set(0, 0, 0);
    }
    // Real ground speed (smoothed), so the stride matches how far you actually moved.
    const dx = feet.x - lastFeet.x;
    const dz = feet.z - lastFeet.z;
    if (Math.hypot(dx, dz) > 3) bodyVel.set(0, 0, 0); // teleported
    else bodyVel.lerp(tmpV.set(dx / dt, 0, dz / dt), 1 - Math.exp(-12 * dt));
    lastFeet.copy(feet);
    // A step behind the eyes, so looking down shows your chest, arms and boots, not the inside of the suit.
    me.root.position.copy(feet).add(tmpV.set(Math.sin(yaw) * 0.28, 0, Math.cos(yaw) * 0.28));
    const moving = screen.value === 'playing';
    me.gait(dt, moving ? bodyVel : tmpV.set(0, 0, 0), yaw, mode === 'move' || player!.grounded, mode === 'walk' && player!.sprinting);
  }

  /** Mirrors render the scene again, so each is on only when you can see it. */
  function updateMirrors() {
    const live = screen.value === 'playing' || screen.value === 'paused';
    interior.mirror.visible = live && habInside.value && !perfOff.has('mirror');
    outpost.outsideMirror.visible = live && !habInside.value && settings.value.quality !== 'low' && camera.position.distanceTo(outsideMirrorPos) < 16 && !perfOff.has('mirror');
  }

  let fogAmt = 0;
  let blurAmt = 0;
  let lastWeather = rad.value.weather;
  const camFwd = new THREE.Vector3();
  const sunNdc = new THREE.Vector3();
  let cssAcc = 0;
  /** The helmet's view: visor, sun glare, fog when oxygen runs low, blur while driving, storm flashes; DOF in cutscenes. */
  function updateLens(dt: number, now: number) {
    const firstPerson = !!player && (screen.value === 'playing' || screen.value === 'paused');
    const motion = settings.value.motion ?? 1;
    const o2 = suit.value.o2;
    const fogTarget = firstPerson ? 1 - THREE.MathUtils.smoothstep(o2, 6, 30) : 0;
    fogAmt += (fogTarget - fogAmt) * Math.min(1, dt * (fogTarget > fogAmt ? 0.8 : 2.5)); // clears faster than it forms
    const blurTarget = firstPerson && rover.driving ? Math.min(1, Math.abs(rover.speed) / 3) * 0.8 * motion : 0;
    blurAmt += (blurTarget - blurAmt) * Math.min(1, dt * 3);
    if (rover.driving && screen.value === 'playing') shake.rumble((Math.abs(rover.speed) / 5.5) * 0.22);
    // A solar storm arriving: a jolt, then radiation flashes in your eyes while you're out in it.
    const weather = rad.value.weather;
    if (weather !== lastWeather && weather === 'storm' && screen.value === 'playing') shake.add(0.35);
    lastWeather = weather;
    const storm = firstPerson && weather === 'storm' && !rad.value.sheltered && !habInside.value ? 1 : 0;
    // Low has no post-processing: the visor rim and the fog are drawn in the UI instead.
    cssAcc += dt;
    if (cssAcc > 0.1) {
      cssAcc = 0;
      const on = firstPerson && !pipeline.visor;
      const fog = Math.round(fogAmt * 20) / 20;
      if (visorFx.value.on !== on || visorFx.value.fog !== fog) visorFx.value = { on, fog };
    }
    const v = pipeline.visor;
    if (!v) return;
    if (perfOff.has('visor')) {
      for (const k of ['uVisor', 'uFog', 'uBlur', 'uSpark', 'uSunAmt'] as const) v.set(k, 0);
      return;
    }
    v.set('uVisor', firstPerson ? 1 : 0);
    v.set('uFog', fogAmt);
    v.set('uBreath', 0.5 + 0.5 * Math.sin((now * Math.PI * 2) / (o2 < 20 ? 2.2 : 3.6)));
    v.set('uBlur', blurAmt);
    v.set('uSpark', storm);
    const day = sunlight();
    v.set('uDay', day);
    camera.getWorldDirection(camFwd);
    const facing = camFwd.dot(SUN_DIR);
    sunNdc.copy(camera.position).addScaledVector(SUN_DIR, 1000).project(camera);
    v.setSun(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5, THREE.MathUtils.smoothstep(facing, 0.75, 1));
    v.set('uSunAmt', THREE.MathUtils.smoothstep(facing, 0.35, 0.8) * day * sunScale.value);
    // Depth of field: only in cutscenes, sharp where the shot looks.
    if (screen.value === 'cutscene') {
      const fresh = focusFrame >= frameNo - 1;
      // Close subjects only: a wide landscape stays sharp (and the stars stay points).
      const d = fresh ? camera.position.distanceTo(focusPoint) : 99;
      pipeline.setDof(d < 20, d, Math.max(1.2, d * 0.55), 2.0);
    } else pipeline.setDof(false);
  }

  function simulateSuit(dt: number) {
    const s = { ...suit.value };
    const exertion = rover.driving ? 0.8 : player!.sprinting ? 1.8 : player!.moving ? 1.15 : 0.8;
    // Inside HAB-1 (once its air is breathable) the suit tank slowly refills instead of draining.
    const inside = habInside.value;
    if (inside && habAirOk()) {
      s.o2 = Math.min(100, s.o2 + HAB_O2_PER_SEC * dt);
      if (s.o2 > 40) lowO2Warned = false;
    } else s.o2 = Math.max(0, s.o2 - O2_PER_SEC * exertion * dt);
    s.power = Math.max(0, s.power - (POWER_PER_SEC + (s.light ? LAMP_POWER_PER_SEC : 0)) * dt);
    if (s.power === 0) s.light = false;
    // The habitat's walls and water stop part of the radiation.
    s.dose += (DOSE_PER_GAME_DAY / 86400) * gameSpeed.value * dt * (inside ? 0.3 : 1);
    s.tempOut = inside ? 21 : -48 + Math.sin(performance.now() / 9000) * 3;
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
      moves.cancel();
      leaveHabitatNow();
      if (rover.driving) {
        rover.driving = false;
        rover.speed = 0;
        drive.value = { driving: false, speed: 0, battery: rover.battery };
      }
      player!.setEnabled(true);
      player!.teleport(current().spawn.pos, current().spawn.yaw);
      s.o2 = 100;
      s.health = 60;
      lowO2Warned = false;
    }
    suit.value = s;
    setExertion(player!.sprinting && !rover.driving ? 1 : s.o2 < 20 ? 0.8 : 0.2);
  }

  /** HAB-1's air is breathable once life support is running (from Mission 2's start-up on). */
  function habAirOk() {
    return missionNumber.value >= 3 || life.value.habO2 >= SAFE_O2 - 0.05;
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

  const facilityColliders: Record<string, (spec: ColliderSpec | null) => void> = {};
  for (const id of Object.keys(outpost.settlement.facilities)) facilityColliders[id] = dynamicCollider();

  // ---------- Mission 8 visuals: tower damage, leak patch, cooling pumps ----------
  function syncEmergency(dt: number) {
    const e = emergency.value;
    const rig = outpost.emergency;
    const m8 = missionNumber.value === 8;
    rig.fittings.visible = missionNumber.value >= 8;
    const hit = m8 && (e.active === 'solar' || e.done.includes('solar'));
    // Mission 9 starts with the damage Mission 8 left; tower 3 is clean once its new blanket is on.
    rig.towerDamage[0].visible = hit || missionNumber.value >= 9;
    rig.towerDamage[1].visible = hit || (missionNumber.value >= 9 && (power.value.arrays[2].health ?? 1) < 1);
    // Tower 2's status light shows red until its shorted string is cut out.
    if (e.active === 'solar' && (e.phase === 'alert' || e.phase === 'diagnose' || e.phase === 'repair')) outpost.arrays[1].light.material = statusMaterials.red;
    const patched = e.done.includes('leak') || (e.active === 'leak' && (e.phase === 'recover' || e.phase === 'report'));
    rig.patches.forEach((p, i) => (p.visible = missionNumber.value >= 8 && patched && i === e.leak));
    // Mission 9 facilities rise while they are built, and become solid once finished.
    const st = settlement.value;
    for (const [id, f] of Object.entries(outpost.settlement.facilities)) {
      const b = st.building.find((x) => x.id === id);
      const done = st.running.includes(id as never);
      f!.group.visible = missionNumber.value === 9 && (done || !!b);
      f!.group.scale.y = done ? 1 : b ? Math.max(0.05, 1 - b.hours / b.total) : 1;
      facilityColliders[id](done && missionNumber.value === 9 ? f!.collider : null);
    }
    rig.pumpLights.a.material = e.pumpA ? statusMaterials.green : statusMaterials.red;
    rig.pumpLights.b.material = e.pumpB ? statusMaterials.green : statusMaterials.amber;
    if (e.pumpA) rig.rotors.a.rotation.x += dt * 14;
    if (e.pumpB) rig.rotors.b.rotation.x += dt * 14;
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
    const charge = p.batteryKWh / capacityKWh(p);
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
        discoveries: () => discoveries.list(),
        fx: () => fx.counts(),
        /** The helmet view, your body, mirrors and shake (qa/lens.mjs). */
        lens: () => ({
          sunYaw: Math.atan2(-SUN_DIR.x, -SUN_DIR.z),
          sunPitch: Math.asin(SUN_DIR.y),
          body: bodyMode,
          visor: pipeline.visor ? Object.fromEntries([...pipeline.visor.uniforms].filter(([, u]) => typeof u.value === 'number').map(([k, u]) => [k, u.value])) : null,
          mirrors: { inside: interior.mirror.visible, outside: outpost.outsideMirror.visible },
          shake: shake.level,
          css: visorFx.value,
        }),
        setO2: (v: number) => (suit.value = { ...suit.value, o2: v }),
        /** Switch new effects off to measure their cost: 'mirror', 'visor', 'body'. */
        perfOff: (what: string[]) => (perfOff = new Set(what)),
        dofInfo: () => pipeline.dofState(),
        roverLook: (yaw: number, pitch: number) => {
          rover.lookYaw = yaw;
          rover.lookPitch = pitch;
        },
        shake: (a: number) => shake.add(a),
        storm: (on: boolean) => (rad.value = { ...rad.value, weather: on ? 'storm' : 'quiet', sheltered: false }),
        /** Stand 2.2 m in front of a mirror, facing it. */
        mirrorView: (which: 'inside' | 'outside') => {
          if (which === 'outside') {
            const m = outpost.outsideMirror;
            const yaw = m.parent!.rotation.y;
            const p = outsideMirrorPos.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(2.4));
            player!.teleport(new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z), yaw);
          } else {
            habInside.value = true;
            interior.setLightsOn(true);
            const p = interior.mirror.position;
            player!.teleport(new THREE.Vector3(p.x - 0.1, interior.floor, p.z + 1.5), 0);
          }
          player!.pitch = -0.08;
        },

        /** Stand next to a secret find and press E on it. */
        discover: (id: string) => {
          const d = discoveries.list().find((x) => x.id === id)!;
          const a = Math.atan2(LAYOUT.base.x - d.x, LAYOUT.base.z - d.z);
          const x = d.x + Math.sin(a) * 2.2;
          const z = d.z + Math.cos(a) * 2.2;
          player!.teleport(new THREE.Vector3(x, heightAt(x, z), z), Math.atan2(-(d.x - x), -(d.z - z)));
          playDiscovery(id);
        },
        closeDiscovery: () => actions.closeDiscovery?.(),
        musicVideo: () => actions.playMusicVideo!(),
        habEnter: () => enterHabitat(),
        habExit: () => exitHabitat(),
        habUse: (id: string) => {
          const it = interior.interactables.find((i) => i.id === id)!;
          if (id === 'hab-exit') use(it);
          else useStation(id, it);
        },
        hab: () => ({ inside: habInside.value, moving: moves.active, kpa: airlockKpa.value, fade: fade.value, hatch: hatchOpen }),
        skipMove: () => moves.skip(camera),
        endMusicVideo: () => actions.endMusicVideo!(),
        power: () => ({ ...power.value, sunYaw: sunYaw() }),
        habitat: () => habitat.value,
        greenhouse: () => greenhouse.value,
        rad: () => rad.value,
        science: () => science.value,
        emergency: () => emergency.value,
        settlement: () => settlement.value,
        /** Mission 9: jump the settlement clock to a day (fires that day's events). */
        settleDay: (d: number) => {
          clock.value = { ...clock.value, minutes: clock.value.minutes + (d - settlement.value.day) * 1440 };
          settlement.value = { ...settlement.value, day: d };
        },
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
        /** What is under the crosshair (debugging). */
        pick: () => {
          const r = new THREE.Raycaster();
          camera.updateMatrixWorld();
          r.setFromCamera(new THREE.Vector2(0, 0), camera);
          const chain = (o: THREE.Object3D | null): string => (o ? `${chain(o.parent)}/${o.name || o.type}` : '');
          return r
            .intersectObjects(scene.children, true)
            .filter((h) => h.distance > 0.01 && (h.object as THREE.Mesh).isMesh && shown(h.object))
            .slice(0, 6)
            .map((h) => ({ obj: chain(h.object).slice(-90), d: +h.distance.toFixed(2), at: h.point.toArray().map((v) => +v.toFixed(2)), cam: camera.position.toArray().map((v) => +v.toFixed(2)) }));
        },
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

  // ---------- music video (?film) ----------
  if (FILM) {
    const { buildFilm, SONG } = await import('./mtv/film');
    document.getElementById('ui-root')!.style.display = 'none';
    actions.setQuality('high');
    missionNumber.value = 9;
    resetMission();
    const shots = buildFilm({ scene, camera, outpost, scenes: scenes as unknown as Record<string, Shot[]>, astronaut, discoveries, fx, rover, sunScale });
    let virtual = 0;
    Object.assign(window, {
      __film: {
        length: SONG.length,
        start: () => {
          // One frame on the real clock first, so the virtual clock starts with a normal step.
          loop((virtual = performance.now()));
          playCut(shots, () => {});
        },
        /** Advances one frame of 1/fps seconds and renders it. */
        frame: (fps = 30) => loop((virtual += 1000 / fps)),
        /** The frame just rendered, as a JPEG data URL (same task, so the buffer is still there). */
        grab: (q = 0.92) => renderer.domElement.toDataURL('image/jpeg', q),
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
