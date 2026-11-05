import * as THREE from 'three';

// Camera shake: "trauma" that anything can add to (a hard landing, the lander touching down,
// a storm arriving) and that fades by itself. `floor` is a steady rumble set each frame
// (driving, the lander's engine) and cleared after the frame is drawn.

let trauma = 0;
let floor = 0;
let t = 0;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const q = new THREE.Quaternion();

/** Smooth noise in -1..1 from a few unrelated sines. */
const wobble = (x: number, a: number) => Math.sin(x * 1.0 + a) * 0.5 + Math.sin(x * 2.3 + a * 1.7) * 0.3 + Math.sin(x * 4.1 + a * 2.9) * 0.2;

export const shake = {
  /** A jolt: 0.1 small bump, 0.5 big hit, 1 the most there is. */
  add(amount: number) {
    trauma = Math.min(1, trauma + amount);
  },
  /** A steady rumble for this frame only (0..1). */
  rumble(amount: number) {
    floor = Math.max(floor, Math.min(1, amount));
  },
  get level() {
    return Math.max(trauma, floor);
  },
  /** Shakes the camera for this frame (after it has been placed), scaled by the motion setting. */
  apply(cam: THREE.Camera, dt: number, scale: number) {
    t += dt;
    const k = Math.max(trauma, floor);
    trauma = Math.max(0, trauma - dt * 1.4);
    floor = 0;
    const s = k * k * scale;
    if (s < 1e-4) return;
    const f = t * 19;
    euler.set(wobble(f, 0) * 0.035 * s, wobble(f, 11) * 0.035 * s, wobble(f, 23) * 0.05 * s);
    cam.quaternion.multiply(q.setFromEuler(euler));
    cam.position.y += wobble(f, 37) * 0.025 * s;
  },
  reset() {
    trauma = floor = 0;
  },
};
