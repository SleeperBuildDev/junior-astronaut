import * as THREE from 'three';

// Short first-person camera moves that play while the game keeps running: climbing into the rover
// seat, walking through the airlock, sitting on the exercise bike. Each step eases the camera along
// a path and can run things when it starts, as it goes and when it ends. Space skips to the end.

export interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

export interface Step {
  dur: number;
  start?: () => void;
  /** Camera pose at eased progress k (0..1). Steps without one hold the last pose. */
  pose?: (k: number, out: Pose) => void;
  update?: (k: number, raw: number) => void;
  end?: () => void;
}

export const ease = (k: number) => k * k * (3 - 2 * k);

/** A view direction as a quaternion (same convention as the player's camera: yaw, then pitch). */
export const look = (yaw: number, pitch = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

/** Yaw that faces from a to b. */
export const yawTo = (a: THREE.Vector3, b: THREE.Vector3) => Math.atan2(-(b.x - a.x), -(b.z - a.z));

/** Ease along a smooth curve through the points while turning from one view to another. */
export function path(points: THREE.Vector3[], from: THREE.Quaternion, to: THREE.Quaternion, turnStart = 0, turnEnd = 1) {
  const curve = points.length > 2 ? new THREE.CatmullRomCurve3(points, false, 'centripetal') : null;
  return (k: number, out: Pose) => {
    if (curve) curve.getPoint(k, out.pos);
    else out.pos.lerpVectors(points[0], points[1], k);
    const t = THREE.MathUtils.clamp((k - turnStart) / (turnEnd - turnStart), 0, 1);
    out.quat.slerpQuaternions(from, to, ease(t));
  };
}

export class Moves {
  private steps: Step[] = [];
  private i = 0;
  private t = 0;
  private started = false;
  private done: (() => void) | null = null;
  readonly pose: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  active = false;
  /** False for moves that must not be skipped (e.g. a few seconds of exercise are fine to skip, a door is not). */
  skippable = true;
  /** True for a move that is a walk (the airlock): your body walks along under the camera. */
  walking = false;

  play(steps: Step[], cam: THREE.Camera, done?: () => void, skippable = true, walking = false) {
    this.walking = walking;
    this.steps = steps;
    this.i = 0;
    this.t = 0;
    this.started = false;
    this.done = done ?? null;
    this.active = true;
    this.skippable = skippable;
    this.pose.pos.copy(cam.position);
    this.pose.quat.copy(cam.quaternion);
  }

  update(dt: number, cam: THREE.Camera) {
    if (!this.active) return;
    let left = dt;
    while (this.active && left >= 0) {
      const s = this.steps[this.i];
      if (!s) {
        this.finish();
        break;
      }
      if (!this.started) {
        this.started = true;
        s.start?.();
      }
      const use = Math.min(left, s.dur - this.t);
      this.t += use;
      left -= use;
      const raw = s.dur > 0 ? Math.min(1, this.t / s.dur) : 1;
      s.pose?.(ease(raw), this.pose);
      s.update?.(ease(raw), raw);
      if (raw >= 1) {
        s.end?.();
        this.i++;
        this.t = 0;
        this.started = false;
        if (left <= 0) break;
      } else break;
    }
    cam.position.copy(this.pose.pos);
    cam.quaternion.copy(this.pose.quat);
  }

  /** Jump to the end: every remaining step starts, finishes and ends at once. */
  skip(cam?: THREE.Camera) {
    if (!this.active) return;
    for (; this.i < this.steps.length; this.i++) {
      const s = this.steps[this.i];
      if (!this.started) s.start?.();
      this.started = false;
      s.pose?.(1, this.pose);
      s.update?.(1, 1);
      s.end?.();
    }
    if (cam) {
      cam.position.copy(this.pose.pos);
      cam.quaternion.copy(this.pose.quat);
    }
    this.finish();
  }

  /** Stop without finishing (mission reset, blackout). */
  cancel() {
    this.active = false;
    this.steps = [];
    this.done = null;
  }

  private finish() {
    this.active = false;
    const d = this.done;
    this.done = null;
    d?.();
  }
}
