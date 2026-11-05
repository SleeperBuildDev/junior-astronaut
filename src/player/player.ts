import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { settings } from '../engine/settings';
import { LAYOUT } from '../world/heightfield';
import type { Input } from './input';

// Lunar gravity is 1.62 m/s^2, about one sixth of Earth's 9.81 m/s^2.
export const MOON_G = 1.62;
const WALK = 2.4;
const SPRINT = 4.0;
const JUMP_SPEED = 2.1; // ~1.4 m high, ~2.6 s in the air
const GROUND_ACCEL = 10;
const AIR_ACCEL = 1.6; // little control once airborne: nothing to push against
const HALF_HEIGHT = 0.55;
const RADIUS = 0.35;
const EYE = 0.72; // above the capsule centre -> ~1.6 m eye height
const STEP = 1 / 60;

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private cc: RAPIER.KinematicCharacterController;
  private vel = new THREE.Vector3();
  private acc = 0;
  yaw = 0;
  pitch = 0;
  grounded = false;
  sprinting = false;
  moving = false;
  private airTime = 0;
  private bobPhase = 0;
  private landDip = 0;
  private landVel = 0;
  private run = 0;
  private lean = 0;
  private lastYaw = 0;
  stats = { distance: 0, jumps: 0 };
  onLand: (fall: number) => void = () => {};
  /** Called once per footfall while walking, with 0..1 strength. */
  onStep: (strength: number) => void = () => {};
  onJump: () => void = () => {};
  onBoundary: () => void = () => {};
  private boundaryCooldown = 0;

  constructor(
    private rapier: typeof RAPIER,
    private world: RAPIER.World,
    private input: Input,
    camera: THREE.PerspectiveCamera,
    start: THREE.Vector3,
  ) {
    this.camera = camera;
    this.body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + HALF_HEIGHT + RADIUS + 0.05, start.z));
    this.collider = world.createCollider(rapier.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);
    this.cc = world.createCharacterController(0.02);
    this.cc.enableAutostep(0.35, 0.25, true);
    this.cc.enableSnapToGround(0.3);
    this.cc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(38));
    this.cc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(45));
  }

  get position() {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  /** Feet position on the ground. */
  get feet() {
    return this.position.add(new THREE.Vector3(0, -(HALF_HEIGHT + RADIUS), 0));
  }

  /** Off while sitting in the rover, so the two don't collide. */
  setEnabled(on: boolean) {
    this.collider.setEnabled(on);
  }

  teleport(p: THREE.Vector3, yaw?: number) {
    this.body.setTranslation({ x: p.x, y: p.y + HALF_HEIGHT + RADIUS + 0.05, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + HALF_HEIGHT + RADIUS + 0.05, z: p.z });
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
  }

  update(dt: number, active: boolean) {
    // Mouse look (every frame for responsiveness)
    const s = settings.value;
    const look = this.input.takeLook();
    const sens = 0.0022 * s.sensitivity;
    if (active) {
      this.yaw -= look.x * sens;
      this.pitch -= look.y * sens * (s.invertY ? -1 : 1);
      if (s.arrowLook) {
        const k = 1.7 * dt;
        if (this.input.isDown('ArrowLeft')) this.yaw += k;
        if (this.input.isDown('ArrowRight')) this.yaw -= k;
        if (this.input.isDown('ArrowUp')) this.pitch += k * (s.invertY ? -1 : 1);
        if (this.input.isDown('ArrowDown')) this.pitch -= k * (s.invertY ? -1 : 1);
      }
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    }

    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.fixedStep(STEP, active);
      this.acc -= STEP;
    }
    this.updateCamera(dt);
  }

  private fixedStep(h: number, active: boolean) {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (active) {
      if (this.input.isDown('KeyW')) wish.add(fwd);
      if (this.input.isDown('KeyS')) wish.sub(fwd);
      if (this.input.isDown('KeyD')) wish.add(right);
      if (this.input.isDown('KeyA')) wish.sub(right);
    }
    if (wish.lengthSq() > 0) wish.normalize();
    this.sprinting = active && wish.lengthSq() > 0 && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    const target = wish.multiplyScalar(this.sprinting ? SPRINT : WALK);
    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const horiz = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const diff = target.sub(horiz);
    const maxDelta = accel * h;
    if (diff.length() > maxDelta) diff.setLength(maxDelta);
    this.vel.x += diff.x;
    this.vel.z += diff.z;

    if (this.grounded && active && this.input.pressed('Space')) {
      this.vel.y = JUMP_SPEED;
      this.grounded = false;
      this.stats.jumps++;
      this.onJump();
    }
    this.vel.y -= MOON_G * h;

    const desired = { x: this.vel.x * h, y: this.vel.y * h, z: this.vel.z * h };
    this.cc.computeColliderMovement(this.collider, desired);
    const m = this.cc.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.cc.computedGrounded();
    const p = this.body.translation();
    let nx = p.x + m.x;
    let nz = p.z + m.z;
    // Mission boundary: keep the astronaut inside the safe exploration zone.
    const dx = nx - LAYOUT.base.x;
    const dz = nz - LAYOUT.base.z;
    const d = Math.hypot(dx, dz);
    this.boundaryCooldown = Math.max(0, this.boundaryCooldown - h);
    if (d > LAYOUT.playRadius) {
      nx = LAYOUT.base.x + (dx / d) * LAYOUT.playRadius;
      nz = LAYOUT.base.z + (dz / d) * LAYOUT.playRadius;
      if (this.boundaryCooldown === 0) {
        this.boundaryCooldown = 20;
        this.onBoundary();
      }
    }
    this.body.setNextKinematicTranslation({ x: nx, y: p.y + m.y, z: nz });
    this.world.step();

    const moved = Math.hypot(m.x, m.z);
    this.moving = moved > 0.002;
    if (this.grounded) this.stats.distance += moved;

    if (this.grounded) {
      if (!wasGrounded && this.airTime > 0.35) {
        const fall = -this.vel.y;
        this.landVel = -Math.min(0.9, fall * 0.35);
        this.onLand(fall);
      }
      this.airTime = 0;
      if (this.vel.y < 0) this.vel.y = 0;
    } else {
      this.airTime += h;
      // Bumped our head on something: stop rising.
      if (this.vel.y > 0 && m.y < this.vel.y * h * 0.5) this.vel.y = 0;
    }
  }

  private updateCamera(dt: number) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && speed > 0.2) {
      const before = Math.floor(this.bobPhase / Math.PI);
      this.bobPhase += dt * (2.2 + speed * 0.9);
      // One footfall each time the head bob passes its lowest point.
      if (Math.floor(this.bobPhase / Math.PI) !== before) this.onStep(Math.min(1, 0.5 + speed / 8));
    }
    const motion = settings.value.motion ?? 1;
    const bobAmt = (this.grounded ? Math.min(speed / SPRINT, 1) : 0) * motion;
    // Running swings the head much more than walking: the lunar lope bounds you up and down
    // and rocks the heavy suit from side to side.
    const runTarget = this.grounded && this.sprinting && speed > 2.6 ? 1 : 0;
    this.run += (runTarget - this.run) * Math.min(1, dt * 4);
    // Strafing and turning lean the view a little (the body leans into the move).
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const side = this.vel.x * -fwdZ + this.vel.z * fwdX;
    const turn = THREE.MathUtils.clamp((this.yaw - this.lastYaw) / Math.max(dt, 1e-3), -6, 6);
    this.lastYaw = this.yaw;
    const leanTarget = (-side * 0.006 - turn * 0.004 * Math.min(1, speed / WALK)) * motion;
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 5);
    // A gentle spring for the landing dip: the suit's weight settling.
    this.landVel += (-this.landDip * 40 - this.landVel * 9) * dt;
    this.landDip += this.landVel * dt;
    const r = this.run;
    const sway = Math.sin(this.bobPhase) * THREE.MathUtils.lerp(0.025, 0.07, r) * bobAmt;
    const rise = Math.abs(Math.sin(this.bobPhase)) * THREE.MathUtils.lerp(0.045, 0.12, r) * bobAmt;
    const roll = Math.sin(this.bobPhase) * THREE.MathUtils.lerp(0.006, 0.028, r) * bobAmt;
    const nod = Math.sin(this.bobPhase * 2 + 0.6) * 0.016 * r * bobAmt;
    const p = this.position;
    this.camera.position.set(p.x + Math.cos(this.yaw) * sway, p.y + EYE + rise + this.landDip * 0.25 * Math.max(0.3, motion), p.z - Math.sin(this.yaw) * sway);
    this.camera.rotation.set(this.pitch + nod + this.landDip * 0.05 * motion, this.yaw, roll + this.lean, 'YXZ');
    const fov = settings.value.fov + (this.sprinting ? 4 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
}
