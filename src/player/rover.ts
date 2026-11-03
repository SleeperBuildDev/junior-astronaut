import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { settings } from '../engine/settings';
import { heightAt, LAYOUT } from '../world/heightfield';
import type { Input } from './input';

// The pressurised-cabin-free lunar rover, driven from the left seat. Arcade handling with
// simple, honest limits: low top speed, gentle acceleration, it follows the ground and
// gets stopped by rocks and buildings (Rapier's character controller does the collisions).

export const ROVER_MAX = 5.5; // m/s (about 20 km/h; Apollo's rover managed about 13 km/h)
const REVERSE_MAX = 2;
const ACCEL = 1.6;
const BRAKE = 4.5;
const DRAG = 0.5;
const TURN = 0.85; // rad/s at speed
/** Driver's eye in the model's frame (+X is forward, the driver sits on the left, -Z). */
const SEAT = new THREE.Vector3(0.2, 2.02, -0.48);
const HALF = { x: 1.75, y: 0.5, z: 1.15 };
const CLEARANCE = 0.95; // collider centre above the ground

export class Rover {
  readonly obj: THREE.Object3D;
  private body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private cc: RAPIER.KinematicCharacterController;
  yaw = 0;
  speed = 0;
  private steer = 0;
  driving = false;
  battery = 100;
  lookYaw = 0;
  lookPitch = -0.08;
  /** Called with 0..1 when the rover hits something hard. */
  onBump: (k: number) => void = () => {};

  constructor(
    private rapier: typeof RAPIER,
    private world: RAPIER.World,
    obj: THREE.Object3D,
    private terrainHandle: number,
  ) {
    this.obj = obj;
    this.yaw = obj.rotation.y;
    const p = obj.position;
    this.body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + CLEARANCE, p.z));
    this.collider = world.createCollider(rapier.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z), this.body);
    this.cc = world.createCharacterController(0.03);
    this.place(p, this.yaw);
  }

  get forward() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /**
   * Where the driver can step out: beside the left seat if there is room, otherwise the
   * right side, behind or in front. Null if the rover is boxed in.
   */
  exitPoint(): THREE.Vector3 | null {
    const left = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const f = this.forward;
    const capsule = new this.rapier.Capsule(0.55, 0.35);
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    for (const [dir, d] of [[left, 2.4], [left, -2.4], [f, -3.3], [f, 3.3], [left, 3.4], [left, -3.4]] as [THREE.Vector3, number][]) {
      const p = this.obj.position.clone().addScaledVector(dir, d);
      p.y = heightAt(p.x, p.z);
      let blocked = false;
      this.world.intersectionsWithShape({ x: p.x, y: p.y + 0.95, z: p.z }, rot, capsule, () => {
        blocked = true;
        return false;
      }, undefined, undefined, this.collider, undefined, (c) => c.handle !== this.terrainHandle);
      if (!blocked) return p;
    }
    return null;
  }

  place(p: THREE.Vector3, yaw: number) {
    this.yaw = yaw;
    this.speed = this.steer = 0;
    const y = heightAt(p.x, p.z);
    this.obj.position.set(p.x, y, p.z);
    this.settle();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    this.body.setTranslation({ x: p.x, y: y + CLEARANCE, z: p.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  }

  /** Sit the chassis on the ground: height from the wheels, pitch and roll from the slope. */
  private settle() {
    const o = this.obj.position;
    const f = this.forward;
    const l = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const h = (dx: number, dz: number) => heightAt(o.x + dx, o.z + dz);
    const hf = h(f.x * 1.3, f.z * 1.3);
    const hb = h(-f.x * 1.3, -f.z * 1.3);
    const hl = h(l.x * 0.95, l.z * 0.95);
    const hr = h(-l.x * 0.95, -l.z * 0.95);
    o.y = (hf + hb + hl + hr) / 4;
    const pitch = Math.atan2(hf - hb, 2.6);
    const roll = -Math.atan2(hl - hr, 1.9);
    this.obj.rotation.set(roll, this.yaw, pitch, 'YZX');
  }

  update(dt: number, input: Input, active: boolean) {
    const fwdKey = active && input.isDown('KeyW');
    const backKey = active && input.isDown('KeyS');
    const brake = active && input.isDown('Space');
    // A flat battery stops the motors; a nearly flat one only allows a slow crawl home.
    const cap = this.battery <= 0 ? 0 : this.battery < 10 ? 1.5 : ROVER_MAX;
    if (this.speed > cap) this.speed = Math.max(cap, this.speed - BRAKE * dt);
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * dt);
    else if (fwdKey) this.speed = Math.min(cap, this.speed + (this.speed < 0 ? BRAKE : ACCEL) * dt);
    else if (backKey) this.speed = Math.max(-Math.min(REVERSE_MAX, cap), this.speed - (this.speed > 0 ? BRAKE : ACCEL * 0.6) * dt);
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), DRAG * dt);
    const steerTarget = active ? (input.isDown('KeyA') ? 1 : 0) - (input.isDown('KeyD') ? 1 : 0) : 0;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 5);
    this.yaw += this.steer * TURN * THREE.MathUtils.clamp(this.speed / 2.5, -1, 1) * dt;

    // Mouse look from the seat.
    const s = settings.value;
    const look = input.takeLook();
    const sens = 0.0022 * s.sensitivity;
    if (active) {
      this.lookYaw = THREE.MathUtils.clamp(this.lookYaw - look.x * sens, -2.3, 2.3);
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - look.y * sens * (s.invertY ? -1 : 1), -1.1, 1.1);
    }

    const f = this.forward;
    const want = { x: f.x * this.speed * dt, y: 0, z: f.z * this.speed * dt };
    // Rocks and buildings block the rover; the ground itself is handled by settle().
    this.cc.computeColliderMovement(this.collider, want, undefined, undefined, (c) => c.handle !== this.terrainHandle);
    const m = this.cc.computedMovement();
    const asked = Math.hypot(want.x, want.z);
    const got = Math.hypot(m.x, m.z);
    if (asked > 0.004 && got < asked * 0.5) {
      this.onBump(Math.min(1, Math.abs(this.speed) / ROVER_MAX));
      this.speed *= 0.2;
    }
    const o = this.obj.position;
    let nx = o.x + m.x;
    let nz = o.z + m.z;
    const dx = nx - LAYOUT.base.x;
    const dz = nz - LAYOUT.base.z;
    const d = Math.hypot(dx, dz);
    if (d > LAYOUT.playRadius) {
      nx = LAYOUT.base.x + (dx / d) * LAYOUT.playRadius;
      nz = LAYOUT.base.z + (dz / d) * LAYOUT.playRadius;
      this.speed *= 0.5;
    }
    o.x = nx;
    o.z = nz;
    this.settle();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
    this.body.setNextKinematicTranslation({ x: nx, y: o.y + CLEARANCE, z: nz });
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    this.world.step();
    // A full battery drives for about 25 minutes at top speed.
    this.battery = Math.max(0, this.battery - (Math.abs(this.speed) / ROVER_MAX) * (100 / 1500) * dt);
  }

  /** First-person view from the driver's seat. */
  applyCamera(cam: THREE.PerspectiveCamera) {
    this.obj.updateMatrixWorld();
    cam.position.copy(SEAT).applyMatrix4(this.obj.matrixWorld);
    const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lookPitch, -Math.PI / 2 + this.lookYaw, 0, 'YXZ'));
    cam.quaternion.copy(this.obj.quaternion).multiply(local);
  }
}
