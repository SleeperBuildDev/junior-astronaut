import * as THREE from 'three';
import type { Shot } from '../game/cutscenes';
import type { Discoveries } from '../game/discoveries';
import type { Astronaut } from '../world/astronaut';
import { Astronaut as AstronautModel } from '../world/astronaut';
import type { Outpost } from '../world/base';
import type { GroundEffects } from '../world/effects';
import { heightAt, LAYOUT } from '../world/heightfield';
import { EARTH_DIR, SUN_DIR, sunPath } from '../world/sky';

// "The Last Orbit": a music video rendered in the game engine. Every shot is timed to the
// song (76 BPM; sections found from the audio), mixing the game's own cutscenes with new
// scenes for the lyrics: ghosts of the crew, a terminal full of code, sparks in the dark,
// a lope across the plain and an astronaut floating alone in the black.
// Open the game with ?film to load it; qa/film.mjs steps it frame by frame and records it.

export interface FilmCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  outpost: Outpost;
  scenes: Record<string, Shot[]>;
  astronaut: Astronaut;
  discoveries: Discoveries;
  fx: GroundEffects;
  rover: { place: (p: THREE.Vector3, yaw: number) => void; obj: THREE.Object3D };
  sunScale: { value: number };
}

/** The song's sections (seconds). Lyric lines start on these cuts (see mtv/make_subs.py). */
export const SONG = {
  length: 160.77,
  verse1: [14.0, 16.6, 19.2, 21.8, 24.45],
  pre1: [24.45, 27.95, 31.45, 34.95, 38.46],
  chorus1: [38.46, 41.65, 44.84, 48.03, 51.22, 54.41, 57.6, 60.8, 64.0],
  verse2: [64.0, 66.76, 69.52, 72.28, 75.05],
  pre2: [75.05, 78.5, 81.95, 85.4, 88.84],
  chorus2: [88.84, 91.64, 94.44, 97.24, 100.05, 102.85, 105.65, 108.45, 111.25],
  bridge: [111.25, 117.6, 123.9, 130.2, 136.6, 140.0],
  outro: [140.0, 147.0, 154.0],
};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const gp = (x: number, z: number, h = 0) => v(x, heightAt(x, z) + h, z);
const ease = (t: number) => t * t * (3 - 2 * t);

export function buildFilm(c: FilmCtx): Shot[] {
  const { scene, outpost, astronaut: A, fx } = c;
  const B = LAYOUT.base;
  const hab = outpost.habitatPos;
  const ls = outpost.lifeSupport.pos;
  const term = outpost.interactables.find((i) => i.id === 'hab2-terminal')!.object as THREE.Mesh;
  const pump = outpost.interactables.find((i) => i.id === 'pump-a')!.object;
  const disc = Object.fromEntries(c.discoveries.list().map((d) => [d.id, d]));
  c.discoveries.glints = false;
  c.discoveries.force(['skylight', 'icefrost', 'surveyor', 'impactflash', 'retroreflector', 'eclipse']);

  // ---------- new props for the video ----------
  // Ghosts of the crew: astronauts made of faint cyan light (bright at the edges).
  const ghostMat = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 }, color: { value: new THREE.Color(0x7fe8ff) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float opacity; uniform vec3 color;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        gl_FragColor = vec4(color * (0.12 + rim * 1.6) * opacity, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ghosts = [0, 1, 2, 3].map(() => {
    const g = new AstronautModel();
    g.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = ghostMat;
        m.castShadow = m.receiveShadow = false;
      }
    });
    g.root.visible = false;
    scene.add(g.root);
    return g;
  });
  const hideGhosts = () => ghosts.forEach((g) => (g.root.visible = false));

  // A terminal screen of scrolling code.
  const codeCanvas = document.createElement('canvas');
  codeCanvas.width = 512;
  codeCanvas.height = 328;
  const codeCtx = codeCanvas.getContext('2d')!;
  const codeTex = new THREE.CanvasTexture(codeCanvas);
  codeTex.colorSpace = THREE.SRGBColorSpace;
  const codeScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.42), new THREE.MeshBasicMaterial({ map: codeTex, toneMapped: false }));
  codeScreen.position.set(-0.078, 0, 0);
  codeScreen.rotation.y = -Math.PI / 2;
  codeScreen.visible = false;
  term.add(codeScreen);
  const words = ['O2_GEN', 'H2O_LOOP', 'BUS_A', 'VSAT-2', 'kPa', 'CO2_SCRUB', 'PUMP_B', 'HAB-2', 'mSv/d', 'LINK', 'RELAY', 'BATT', 'SEAL', 'TEMP'];
  function drawCode(t: number) {
    const g = codeCtx;
    g.fillStyle = '#021016';
    g.fillRect(0, 0, 512, 328);
    g.font = 'bold 17px monospace';
    const scroll = (t * 46) % 22;
    for (let i = -1; i < 16; i++) {
      const n = Math.floor(t * 2.1) + i;
      const seed = Math.sin(n * 91.7) * 10000;
      const r = (k: number) => Math.abs((Math.sin(seed + k * 12.9) * 43758) % 1);
      const alarm = r(1) > 0.86;
      g.fillStyle = alarm ? '#ff5a48' : r(2) > 0.5 ? '#5fe1ff' : '#2b9fbf';
      const hex = Math.floor(r(3) * 0xffffff).toString(16).padStart(6, '0').toUpperCase();
      const line = `${hex}  ${words[Math.floor(r(4) * words.length)]}  ${alarm ? 'FAULT' : r(5).toFixed(3)}  ${'>'.repeat(1 + Math.floor(r(6) * 6))}`;
      g.fillText(line, 14, 24 + i * 22 - scroll);
    }
    // A blinking cursor block.
    if (Math.floor(t * 3) % 2 === 0) {
      g.fillStyle = '#5fe1ff';
      g.fillRect(14, 300, 12, 18);
    }
    codeTex.needsUpdate = true;
  }

  // Sparks from a repair: hot points on clean ballistic arcs.
  const sparkN = 300;
  const sparkPos = new Float32Array(sparkN * 3).fill(-9999);
  const sparkVel = new Float32Array(sparkN * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffb14a, size: 0.035, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkNext = 0;
  const sparkLight = new THREE.PointLight(0xff9a3a, 0, 6, 1.5);
  scene.add(sparkLight);
  function spark(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const k = sparkNext++ % sparkN;
      sparkPos.set([at.x, at.y, at.z], k * 3);
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 2.2;
      sparkVel.set([Math.cos(a) * sp, 0.4 + Math.random() * 2, Math.sin(a) * sp], k * 3);
    }
  }
  function sparkStep(dt: number) {
    for (let i = 0; i < sparkN; i++) {
      if (sparkPos[i * 3 + 1] < -1000) continue;
      sparkVel[i * 3 + 1] -= 1.62 * dt;
      for (let j = 0; j < 3; j++) sparkPos[i * 3 + j] += sparkVel[i * 3 + j] * dt;
      if (sparkPos[i * 3 + 1] < heightAt(sparkPos[i * 3], sparkPos[i * 3 + 2])) sparkPos[i * 3 + 1] = -9999;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  // A red warning light that pulses in the dark.
  const alarm = new THREE.PointLight(0xff2418, 0, 14, 1.4);
  scene.add(alarm);

  // ---------- shot helpers ----------
  let clock = 0;
  let lastFov = 50;
  const lens = (cam: THREE.PerspectiveCamera, fov: number) => {
    if (fov !== lastFov || cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      lastFov = fov;
    }
  };
  /** Resets the props every shot starts from. */
  function reset(sunK: number) {
    sunPath(sunK);
    c.sunScale.value = 1;
    A.root.visible = false;
    A.lamp.visible = false;
    A.lamp.intensity = 0;
    A.root.rotation.set(0, 0, 0);
    A.resetGait();
    ghosts.forEach((g) => g.resetGait());
    hideGhosts();
    codeScreen.visible = false;
    alarm.intensity = 0;
    sparkLight.intensity = 0;
  }
  interface Opts {
    sun?: number;
    fov?: number;
    start?: () => void;
    update?: (k: number, dt: number, t: number) => void;
  }
  function shot(dur: number, camFn: (k: number, cam: THREE.PerspectiveCamera) => void, o: Opts = {}): Shot {
    let t = 0;
    return {
      dur,
      start: () => {
        t = 0;
        reset(o.sun ?? 0);
        o.start?.();
      },
      update: (k, dt) => {
        t += dt;
        clock += dt;
        sparkStep(dt);
        o.update?.(k, dt, t);
      },
      cam: (k, cam) => {
        lens(cam, o.fov ?? 50);
        cam.up.set(0, 1, 0);
        camFn(k, cam);
      },
    };
  }
  const look = (from: THREE.Vector3, to: THREE.Vector3) => (_k: number, cam: THREE.PerspectiveCamera) => {
    cam.position.copy(from);
    cam.lookAt(to);
  };
  const dolly = (p0: THREE.Vector3, p1: THREE.Vector3, l0: THREE.Vector3, l1: THREE.Vector3, smooth = false) => (k: number, cam: THREE.PerspectiveCamera) => {
    const e = smooth ? ease(k) : k;
    cam.position.lerpVectors(p0, p1, e);
    cam.lookAt(new THREE.Vector3().lerpVectors(l0, l1, e));
  };
  /** Walks (or lopes) the astronaut from a to b over the shot. */
  function walker(a: THREE.Vector3, b: THREE.Vector3, sprint = false) {
    const dir = b.clone().sub(a).setY(0);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pos = new THREE.Vector3();
    return (k: number, dt: number, dur: number) => {
      pos.lerpVectors(a, b, k);
      pos.y = heightAt(pos.x, pos.z);
      A.root.visible = true;
      A.root.position.copy(pos);
      const vel = dir.clone().multiplyScalar(1 / dur);
      A.gait(dt, vel, yaw, true, sprint);
      return pos;
    };
  }
  /** Reuses one shot of the game's own cutscenes, stretched to `dur`. */
  function reuse(s: Shot, dur: number, sun = 0, before?: () => void, after?: () => void): Shot {
    let done = false;
    return {
      dur,
      start: () => {
        reset(sun);
        done = false;
        before?.();
        s.start?.();
      },
      update: (k, dt) => {
        clock += dt;
        sparkStep(dt);
        s.update?.(k, dt);
        if (k >= 1 && !done) {
          done = true;
          after?.();
        }
      },
      cam: (k, cam) => {
        lens(cam, 50);
        s.cam(k, cam);
      },
    };
  }
  /** One shot from a secret discovery's cutscene (plain: no gold light), stretched to `dur`. */
  function discShot(id: string, index: number, dur: number, sun = 0, from?: THREE.Vector3, noAstronaut = false): Shot {
    const d = disc[id];
    let list: Shot[] = [];
    return {
      dur,
      start: () => {
        reset(sun);
        const feet = from ?? new THREE.Vector3(d.x + 3, 0, d.z + 3);
        list = c.discoveries.shots(id, feet, true);
        // Run the earlier shots' set-up so props and the astronaut are in place.
        for (let i = 0; i <= index; i++) list[i].start?.();
        for (let i = 0; i < index; i++) list[i].update?.(1, 0);
      },
      update: (k, dt) => {
        clock += dt;
        list[index].update?.(k, dt);
        if (noAstronaut) A.root.visible = false;
        if (k >= 1) c.discoveries.cleanup();
      },
      cam: (k, cam) => {
        lens(cam, 50);
        list[index].cam(k, cam);
      },
    };
  }

  /** Toward Earth's compass direction, tilted up `deg` degrees (frames Earth and a figure under it). */
  const towardEarth = (from: THREE.Vector3, deg: number) => {
    const e = THREE.MathUtils.degToRad(deg);
    return from.clone().add(v(toEarth.x * Math.cos(e), Math.sin(e), toEarth.z * Math.cos(e)).multiplyScalar(100));
  };
  /**
   * A long-lens spot: a camera place from which a figure `dist` m away toward Earth stands in
   * clear view (no hill in between, on level-ish ground). Tries places around the base.
   */
  function earthSpot(dist: number, skip = 0) {
    let found = 0;
    for (let r = 90; r < 220; r += 10)
      for (let a = 0; a < Math.PI * 2; a += 0.35) {
        const cam = gp(B.x + Math.cos(a) * r, B.z + Math.sin(a) * r, 0.6);
        const fig = cam.clone().addScaledVector(toEarth, dist);
        fig.y = heightAt(fig.x, fig.z);
        if (Math.abs(fig.y - (cam.y - 0.6)) > 1.2) continue;
        // Keep the outpost out of the picture: the view line must pass well clear of the base.
        let near = false;
        for (let i = 0; i <= 10 && !near; i++) {
          const q = cam.clone().addScaledVector(toEarth, (dist + 400) * (i / 10));
          if (Math.hypot(q.x - B.x, q.z - B.z) < 60) near = true;
        }
        if (near) continue;
        let clear = true;
        for (let i = 1; i < 20 && clear; i++) {
          const q = cam.clone().lerp(fig.clone().add(v(0, 0.3, 0)), i / 20);
          if (heightAt(q.x, q.z) > q.y - 0.05) clear = false;
        }
        if (clear && found++ === skip) return { cam, fig };
      }
    const cam = gp(B.x + 30, B.z - 60, 0.6);
    return { cam, fig: gp(cam.x + toEarth.x * dist, cam.z + toEarth.z * dist) };
  }

  const film: Shot[] = [];
  const add = (t0: number, t1: number, make: (dur: number) => Shot) => film.push(make(t1 - t0));
  const S = SONG;
  const toEarth = EARTH_DIR.clone().setY(0).normalize();
  const toSun = SUN_DIR.clone().setY(0).normalize();

  // ---------- Intro: stars, Earth, the dark outpost ----------
  add(0, 6.8, (d) =>
    shot(d, (k, cam) => {
      // Earth alone in the black, through a long lens, slowly drifting and pulling back.
      cam.position.set(B.x, hab.y + 3, B.z + 30);
      cam.lookAt(cam.position.clone().addScaledVector(EARTH_DIR, 100).add(v(0.4 - k * 0.8, 0.3 - k * 0.2, 0)));
      lens(cam, 4 + ease(k) * 10);
    }, { sun: 0.5, fov: 4 }),
  );
  add(6.8, 14.0, (d) =>
    shot(d, (k, cam) => {
      // Tilt down from Earth to the outpost asleep in the dark.
      const p = gp(B.x + 40, B.z + 70, 6);
      cam.position.copy(p);
      const earthLook = p.clone().addScaledVector(EARTH_DIR, 100);
      cam.lookAt(earthLook.lerp(v(B.x, hab.y + 2, B.z), ease(k)));
    }, { sun: 0.5, fov: 45 }),
  );

  // ---------- Verse 1 ----------
  const [v1a, v1b, v1c, v1d, v1e] = S.verse1;
  // "Cold steel and the silence": along the habitat hull in the blue before dawn.
  add(v1a, v1b, (d) => shot(d, dolly(v(hab.x - 9, hab.y + 1.2, hab.z + 5), v(hab.x + 3, hab.y + 1.6, hab.z + 4.2), v(hab.x - 4, hab.y + 1.8, hab.z), v(hab.x + 8, hab.y + 1.8, hab.z)), { sun: 0.82 }));
  // "Waiting for the dawn": the astronaut on a rise, the Sun coming up behind the hills.
  add(v1b, v1c, (d) => {
    const stand = gp(B.x - 30, B.z + 20);
    return shot(
      d,
      (k, cam) => {
        cam.position.copy(stand).addScaledVector(toSun, -6).add(v(1.5, 1.4, 0));
        cam.lookAt(stand.clone().addScaledVector(toSun, 40).add(v(0, 2.5 + k, 0)));
      },
      {
        sun: 0.86,
        start: () => {
          A.root.visible = true;
          A.place(stand, stand.clone().addScaledVector(toSun, 5));
          A.pose('stand', 0);
        },
        update: (k, dt) => {
          sunPath(0.86 + k * 0.1);
          A.update(dt);
        },
      },
    );
  });
  // "They move but they're hollow": the empty rover drives itself, the towers turn.
  add(v1c, v1d, (d) => {
    const p0 = gp(B.x - 20, B.z + 32);
    const p1 = gp(B.x - 7, B.z + 37);
    const yaw = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
    const pos = new THREE.Vector3();
    return shot(
      d,
      (k, cam) => {
        cam.position.copy(gp(B.x - 4, B.z + 46, 1.4));
        cam.lookAt(pos.clone().add(v(0, 1, 0)));
      },
      {
        update: (k, dt) => {
          pos.lerpVectors(p0, p1, k);
          pos.y = heightAt(pos.x, pos.z);
          c.rover.place(pos, yaw);
          fx.roll(pos, yaw, p0.distanceTo(p1) / d, dt);
        },
      },
    );
  });
  // "All the others gone": crane up over the outpost, one small figure alone.
  add(v1d, v1e, (d) => {
    const stand = gp(B.x - 8, B.z + 12);
    return shot(
      d,
      (k, cam) => {
        const e = ease(k);
        cam.position.copy(stand).add(v(4 + e * 10, 2 + e * 22, 6 + e * 16));
        cam.lookAt(stand.clone().add(v(0, 1, 0)));
      },
      {
        start: () => {
          A.root.visible = true;
          A.place(stand, v(hab.x, stand.y, hab.z));
          A.pose('look', 0);
        },
        update: (_k, dt) => A.update(dt),
      },
    );
  });

  // ---------- Pre-chorus (sparks, breath, wires, the walk away) ----------
  function preChorus(times: number[], variant: 0 | 1) {
    const [a, b, cc, dd, e] = times;
    // "Fixing up the broken pieces"
    add(a, b, (d) => {
      const target = variant === 0 ? ls.clone().add(v(1.05, 0.95, 0.9)) : pump.getWorldPosition(new THREE.Vector3());
      const stand = gp(target.x + (variant === 0 ? 0 : -1.3), target.z + (variant === 0 ? 1.4 : 0.3));
      return shot(
        d,
        (k, cam) => {
          const side = variant === 0 ? v(1.6, 0, 0.9) : v(-0.6, 0, 1.8);
          cam.position.copy(target).add(side).add(v(0, 0.2 + k * 0.15, 0));
          cam.lookAt(target.clone().lerp(stand.clone().add(v(0, 1, 0)), 0.3));
        },
        {
          sun: 0.5,
          start: () => {
            A.root.visible = true;
            A.place(stand, target);
            A.pose('kneel', 0);
            A.lamp.visible = true;
            A.lamp.intensity = 25;
          },
          update: (_k, dt, t) => {
            A.update(dt);
            const burst = Math.sin(t * 9) > 0.55;
            if (burst) spark(target, 6);
            sparkLight.position.copy(target);
            sparkLight.intensity = burst ? 4 + Math.random() * 4 : 0.5;
          },
        },
      );
    });
    // "Learning how to breathe again": the visor, very close, the world bent across the gold.
    add(b, cc, (d) => {
      const stand = variant === 0 ? gp(outpost.o2StationPos.x + 6, outpost.o2StationPos.z + 7) : gp(B.x - 14, B.z + 6);
      return shot(
        d,
        (k, cam) => {
          const vp = A.visorWorld();
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(A.root.quaternion);
          const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
          cam.position.copy(vp).addScaledVector(fwd, 0.85 - k * 0.3).addScaledVector(side, 0.25 * (variant ? -1 : 1)).add(v(0, -0.06, 0));
          cam.lookAt(vp);
        },
        {
          sun: variant === 0 ? 0 : 0.92,
          start: () => {
            A.root.visible = true;
            // Facing away from the station, so the camera in front sees it over the shoulder.
            A.place(stand, stand.clone().addScaledVector(variant === 0 ? toEarth : toSun, 5));
            A.pose('look', 0);
          },
          update: (k, dt) => {
            A.update(dt);
            if (variant === 1) sunPath(0.92 + k * 0.05);
            c.discoveries.refreshVisor();
            // A slow breath: the head rises and falls.
            A.root.position.y = stand.y + Math.sin(k * Math.PI * 2) * 0.01;
          },
        },
      );
    });
    // "Wires screaming in the dark": red light pulsing along the pipes and cables.
    add(cc, dd, (d) => {
      const target = variant === 0 ? ls.clone().add(v(-3.4, 1.4, -0.9)) : outpost.power.pos.clone().add(v(-1.5, 1, 1));
      return shot(
        d,
        (k, cam) => {
          const p0 = target.clone().add(v(2.5, -0.2, 3.2));
          const p1 = target.clone().add(v(-1.2, 0.3, 2.6));
          cam.position.lerpVectors(p0, p1, k);
          cam.lookAt(target);
        },
        {
          sun: 0.5,
          update: (_k, _dt, t) => {
            alarm.position.copy(target).add(v(0, 1.2, 1));
            const pulse = Math.max(0, Math.sin(t * Math.PI * 2 * (1 / 0.7921)));
            alarm.intensity = 12 + 45 * pulse ** 2 + (Math.random() < 0.06 ? 30 : 0);
          },
        },
      );
    });
    // "This is where the ends begin"
    if (variant === 0)
      add(dd, e, (d) => {
        // Turning away from the outpost, walking out into the dark.
        const a0 = gp(B.x - 14, B.z + 14);
        const a1 = gp(B.x - 22, B.z + 20);
        const walk = walker(a0, a1);
        return shot(d, look(gp(B.x - 9, B.z + 9, 1.3), a1.clone().add(v(0, 0.9, 0))), {
          sun: 0.5,
          start: () => {
            A.lamp.visible = true;
            A.lamp.intensity = 30;
          },
          update: (k, dt) => walk(k, dt, d),
        });
      });
    else add(dd, e, (d) => discShot('impactflash', 1, d, 0.5));
  }
  preChorus(S.pre1, 0);

  // ---------- Chorus ----------
  function chorus(times: number[], variant: 0 | 1) {
    const T = times;
    // "Lost inside the black expanse": a huge pull-back from one figure to the empty plain.
    add(T[0], T[1], (d) => {
      const a0 = gp(B.x - 60, B.z + 60);
      const a1 = gp(B.x - 63, B.z + 64);
      const walk = walker(a0, a1);
      let pos = a0.clone();
      return shot(
        d,
        (k, cam) => {
          const e = ease(k);
          cam.position.copy(pos).add(v(-2 - e * 40, 1.8 + e * 120, 3 + e * 60));
          cam.lookAt(pos);
        },
        { sun: variant ? 0.9 : 0, fov: 55, update: (k, dt) => (pos = walk(k, dt, d)) },
      );
    });
    // "Only me and ghosts remain": the crew fade in around you, made of light, then fade away.
    add(T[1], T[2], (d) => {
      const stand = variant ? gp(hab.x - 4, hab.z + 8) : gp(B.x - 34, B.z + 24);
      const around = [0.9, 2.3, 3.6, 5.0].map((a) => stand.clone().add(v(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6)));
      return shot(
        d,
        (k, cam) => {
          const a = 0.6 + k * 0.7;
          cam.position.copy(stand).add(v(Math.cos(a) * 6.5, 1.6, Math.sin(a) * 6.5));
          cam.lookAt(stand.clone().add(v(0, 1.1, 0)));
        },
        {
          sun: variant ? 0.5 : 0.84,
          start: () => {
            A.root.visible = true;
            A.place(stand, around[0]);
            A.pose('look', 0);
            ghosts.forEach((g, i) => {
              g.root.visible = true;
              g.place(around[i].clone().setY(heightAt(around[i].x, around[i].z)), stand);
              g.pose(i % 2 ? 'stand' : 'look', 0);
            });
          },
          update: (k, dt) => {
            A.update(dt);
            ghosts.forEach((g) => g.update(dt));
            ghostMat.uniforms.opacity.value = Math.sin(Math.min(1, k * 1.15) * Math.PI) * (0.85 + Math.random() * 0.15);
          },
        },
      );
    });
    // "Diving into deep forever"
    if (variant === 0)
      add(T[2], T[3], (d) => {
        // Down into the lava-tube pit, until there is only black.
        const p = disc.skylight;
        const ctr = v(p.x, heightAt(p.x, p.z), p.z);
        return shot(
          d,
          (k, cam) => {
            const e = k * k;
            cam.position.copy(ctr).add(v(6 - e * 6, 14 - e * 13.5, 6 - e * 6));
            cam.lookAt(ctr.clone().add(v(0, -3, 0)));
          },
          { fov: 60 },
        );
      });
    else add(T[2], T[3], (d) => discShot('icefrost', 1, d, 0));
    // "Heavy silence fills the frame": still. Earth over the horizon, a silhouette, nothing moves.
    add(T[3], T[4], (d) => {
      // A long lens from 40 m: Earth hangs big over the small figure.
      const { cam: camP, fig: stand } = earthSpot(40, variant ? 3 : 0);
      // Earth sits ~10° up and the figure near the horizon: a 17° lens holds both inside the letterbox.
      return shot(d, look(camP, towardEarth(camP, 5.6)), {
        sun: variant ? 0.5 : 0,
        fov: 17,
        start: () => {
          A.root.visible = true;
          A.place(stand, stand.clone().addScaledVector(toEarth, 5));
          A.pose('stand', 0);
        },
        update: (_k, dt) => A.update(dt),
      });
    });
    // Second half of the chorus: the same lines again, new pictures.
    // "Lost inside the black expanse": a lope across the plain, dust flying.
    add(T[4], T[5], (d) => {
      const a0 = gp(B.x - 50, B.z + 30);
      const a1 = gp(B.x - 40, B.z + 18);
      const walk = walker(a0, a1, true);
      let pos = a0.clone();
      return shot(
        d,
        (_k, cam) => {
          cam.position.copy(a1).add(v(-4, 0.6, -6));
          cam.lookAt(pos.clone().add(v(0, 1, 0)));
        },
        { sun: variant ? 0.92 : 0, fov: 40, update: (k, dt) => (pos = walk(k, dt, d)) },
      );
    });
    // "Only me and ghosts remain": they walk ahead of you toward the lander and dissolve.
    add(T[5], T[6], (d) => {
      const p0 = gp(LAYOUT.lander.x - 20, LAYOUT.lander.z - 30);
      const p1 = gp(LAYOUT.lander.x - 8, LAYOUT.lander.z - 12);
      const lines = ghosts.map((g, i) => ({ g, a: p0.clone().add(v(i * 1.6 - 2.4, 0, i * 0.8)), b: p1.clone().add(v(i * 1.6 - 2.4, 0, i * 0.8)) }));
      const dir = p1.clone().sub(p0).setY(0);
      const yaw = Math.atan2(-dir.x, -dir.z);
      return shot(
        d,
        (k, cam) => {
          cam.position.copy(p0).add(v(-2, 1.7, -4 + k * 2));
          cam.lookAt(p1.clone().add(v(0, 1.2, 0)));
        },
        {
          sun: variant ? 0 : 0.5,
          start: () => lines.forEach(({ g }) => (g.root.visible = true)),
          update: (k, dt) => {
            for (const { g, a, b } of lines) {
              const p = a.clone().lerp(b, k * 0.6);
              p.y = heightAt(p.x, p.z);
              g.root.position.copy(p);
              g.gait(dt, dir.clone().multiplyScalar(0.6 / d), yaw, true, false);
            }
            ghostMat.uniforms.opacity.value = Math.min(1, k * 4) * (1 - ease(Math.max(0, (k - 0.5) / 0.5)));
          },
        },
      );
    });
    // "Diving into deep forever"
    if (variant === 0) add(T[6], T[7], (d) => discShot('icefrost', 1, d, 0));
    else
      add(T[6], T[7], (d) => {
        // Spiralling down into the pit until there is only black.
        const p = disc.skylight;
        const ctr = v(p.x, heightAt(p.x, p.z), p.z);
        return shot(
          d,
          (k, cam) => {
            const e = k * k;
            const a = 2.4 + k * 1.8;
            cam.position.copy(ctr).add(v(Math.cos(a) * (9 - e * 9), 10 - e * 9.6, Math.sin(a) * (9 - e * 9)));
            cam.lookAt(ctr.clone().add(v(0, -3, 0)));
          },
          { fov: 60 },
        );
      });
    // "Heavy silence fills the frame"
    if (variant === 0)
      add(T[7], T[8], (d) => {
        // A slow orbit around the lone astronaut, fading toward black.
        const stand = gp(B.x - 34, B.z + 24);
        return shot(
          d,
          (k, cam) => {
            const a = 2.0 + k * 0.6;
            cam.position.copy(stand).add(v(Math.cos(a) * 5, 1.2, Math.sin(a) * 5));
            cam.lookAt(stand.clone().add(v(0, 1.2, 0)));
          },
          {
            sun: 0.84,
            start: () => {
              A.root.visible = true;
              A.place(stand, stand.clone().addScaledVector(toEarth, 4));
              A.pose('look', 0);
            },
            update: (k, dt) => {
              A.update(dt);
              c.sunScale.value = 1 - k * 0.9;
            },
          },
        );
      });
    else add(T[7], T[8], (d) => discShot('eclipse', 1, d, 0));
  }
  chorus(S.chorus1, 0);

  // ---------- Verse 2 ----------
  const [w0, w1, w2, w3, w4] = S.verse2;
  const termPos = term.getWorldPosition(new THREE.Vector3());
  const termFront = new THREE.Vector3(-1, 0, 0).applyQuaternion(term.getWorldQuaternion(new THREE.Quaternion())).normalize();
  // "Glow of the terminal screen"
  add(w0, w1, (d) =>
    shot(d, dolly(termPos.clone().addScaledVector(termFront, 2.2).add(v(0.6, 0, 0.8)), termPos.clone().addScaledVector(termFront, 1.0).add(v(0.2, 0, 0.3)), termPos, termPos), {
      sun: 0.5,
      start: () => {
        codeScreen.visible = true;
        const stand = gp(termPos.x + termFront.x * 0.9, termPos.z + termFront.z * 0.9);
        A.root.visible = true;
        A.place(stand, termPos);
        A.pose('look', 0);
      },
      update: (_k, dt, t) => {
        A.update(dt);
        drawCode(t);
      },
    }),
  );
  // "Flashing codes I have to know": the screen fills the frame.
  add(w1, w2, (d) =>
    shot(d, dolly(termPos.clone().addScaledVector(termFront, 0.6), termPos.clone().addScaledVector(termFront, 0.38), termPos, termPos), {
      sun: 0.5,
      fov: 40,
      start: () => (codeScreen.visible = true),
      update: (_k, _dt, t) => drawCode(t + 3),
    }),
  );
  // "Cold machines and empty eyes": the old robot lander's camera eye.
  add(w2, w3, (d) => {
    const p = disc.surveyor;
    const ctr = v(p.x, heightAt(p.x, p.z) + 1.6, p.z);
    return shot(d, dolly(ctr.clone().add(v(3.5, 0.2, 3.5)), ctr.clone().add(v(1.6, 0.1, 1.4)), ctr, ctr.clone().add(v(-0.3, 0, 0))), { sun: 0.93, fov: 45 });
  });
  // "Nowhere left for me to go": the edge of the safe zone, the plain going on forever.
  add(w3, w4, (d) => {
    const stand = gp(B.x - 200, B.z + 160);
    const out = v(-0.78, 0, 0.62).normalize();
    return shot(
      d,
      (k, cam) => {
        cam.position.copy(stand).addScaledVector(out, -4 - k).add(v(0.8, 1.7, 0));
        cam.lookAt(stand.clone().addScaledVector(out, 60).add(v(0, 1, 0)));
      },
      {
        sun: 0.9,
        start: () => {
          A.root.visible = true;
          A.place(stand, stand.clone().addScaledVector(out, 5));
          A.pose('stand', 0);
        },
        update: (_k, dt) => A.update(dt),
      },
    );
  });

  // ---------- Pre-chorus 2 and chorus 2 ----------
  preChorus(S.pre2, 1);
  chorus(S.chorus2, 1);

  // ---------- Bridge (guitar solo): the big shots ----------
  const [g0, g1, g2, g3, g4, g5] = S.bridge;
  // The landing, from the game's opening.
  add(g0, g1, (d) => reuse(c.scenes.intro[1], d, 0, () => c.scenes.intro[0].start?.(), () => c.scenes.intro[2].start?.()));
  // Sunrise over the solar towers (the Mission 3 ending crane).
  add(g1, g2, (d) => reuse(c.scenes.m3End[0], d, 0, undefined, undefined));
  // The laser from Earth bouncing off the mirror.
  add(g2, g3, (d) => discShot('retroreflector', 1, d, 0, undefined, true));
  // The rover racing across the plain, dust flying in rooster tails.
  add(g3, g4, (d) => {
    const ctr = gp(B.x - 40, B.z + 80);
    const R = 22;
    const pos = new THREE.Vector3();
    let yaw = 0;
    return shot(
      d,
      (k, cam) => {
        const a = 0.2 + k * 1.3;
        cam.position.copy(pos).add(v(Math.cos(a + 1.2) * 9, 2.2, Math.sin(a + 1.2) * 9));
        cam.lookAt(pos.clone().add(v(0, 0.8, 0)));
      },
      {
        update: (k, dt) => {
          const a = 0.2 + k * 1.3;
          pos.set(ctr.x + Math.cos(a) * R, 0, ctr.z + Math.sin(a) * R);
          pos.y = heightAt(pos.x, pos.z);
          // Rover forward is +X turned by yaw; it drives along the circle's tangent.
          const tx = -Math.sin(a);
          const tz = Math.cos(a);
          yaw = Math.atan2(-tz, tx);
          c.rover.place(pos, yaw);
          fx.roll(pos, yaw, 7, dt);
        },
      },
    );
  });
  // A slow-motion jump with Earth huge behind (a long lens from far away).
  add(g4, g5, (d) => {
    const camP = gp(B.x + 30, B.z - 60, 0.6);
    const stand = camP.clone().addScaledVector(toEarth, 45);
    stand.y = heightAt(stand.x, stand.z);
    return shot(d, look(camP, towardEarth(camP, 6)), {
      sun: 0,
      fov: 16,
      start: () => {
        A.root.visible = true;
        A.place(stand, camP);
      },
      update: (k, dt) => {
        // Up and down in one long arc (slow motion: the real jump would take ~2 s).
        const h = Math.max(0, Math.sin(Math.min(1, k * 1.15) * Math.PI)) * 1.6;
        A.root.position.y = stand.y + h;
        A.gait(dt, new THREE.Vector3(), Math.atan2(-(camP.x - stand.x), -(camP.z - stand.z)), h < 0.02, false);
        A.root.position.set(stand.x, stand.y + h, stand.z);
      },
    });
  });

  // ---------- Outro: floating alone in the infinite black ----------
  const [o0, o1, o2] = S.outro;
  const floatAt = v(B.x - 80, heightAt(B.x - 80, B.z + 40) + 160, B.z + 40);
  const floatStart = () => {
    A.root.visible = true;
    A.root.position.copy(floatAt);
    A.pose('stand', 0);
  };
  const tumble = (k: number, base: number) => {
    A.root.rotation.set(0.25 + Math.sin(base + k * 0.8) * 0.3, base + k * 0.9, 0.4 + Math.sin(base * 2 + k) * 0.25);
    A.update(0.016);
  };
  add(o0, o1, (d) =>
    shot(
      d,
      (k, cam) => {
        cam.position.copy(floatAt).add(v(-2.2 + k * 0.6, -1.4, 2.8));
        cam.lookAt(floatAt.clone().add(v(0, 0.9, 0)));
      },
      {
        sun: 0,
        fov: 45,
        start: () => {
          floatStart();
          A.pose('look', 0);
        },
        update: (k) => tumble(k, 0),
      },
    ),
  );
  add(o1, o2, (d) =>
    shot(
      d,
      (k, cam) => {
        // Pull away until the astronaut is a speck among the stars, then fade out.
        const e = ease(k);
        cam.position.copy(floatAt).add(v(-3 - e * 60, -2 - e * 30, 4 + e * 90));
        cam.lookAt(floatAt.clone().add(v(0, 0.9 + e * 30, 0)));
        c.sunScale.value = 1 - Math.max(0, (k - 0.7) / 0.3);
      },
      { sun: 0, fov: 45, start: floatStart, update: (k) => tumble(k, 0.8) },
    ),
  );
  // End card: black, under the last notes (the title is drawn by the subtitles).
  add(o2, S.length, (d) =>
    shot(d, (_k, cam) => {
      cam.position.set(0, -500, 0);
      cam.lookAt(0, -600, 0);
    }, { sun: 0.5 }),
  );
  return film;
}
