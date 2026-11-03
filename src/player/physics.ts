import RAPIER from '@dimforge/rapier3d-compat';
import type { ColliderSpec } from '../world/base';

export type Rapier = typeof RAPIER;

export async function createPhysics(terrain: { vertices: Float32Array; indices: Uint32Array }, colliders: ColliderSpec[]) {
  await RAPIER.init();
  // Gravity is applied by the character controller itself; no dynamic bodies yet.
  const world = new RAPIER.World({ x: 0, y: -1.62, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.trimesh(terrain.vertices, terrain.indices));
  for (const c of colliders) addCollider(world, c);
  return { RAPIER, world };
}

/** Adds a static collider (also used for things that change shape, like the inflatable module). */
export function addCollider(world: RAPIER.World, c: ColliderSpec) {
  let desc: RAPIER.ColliderDesc;
  if (c.kind === 'box') desc = RAPIER.ColliderDesc.cuboid(c.half.x, c.half.y, c.half.z);
  else if (c.kind === 'cylinder') desc = RAPIER.ColliderDesc.cylinder(c.halfHeight, c.radius);
  else desc = RAPIER.ColliderDesc.ball(c.radius);
  desc.setTranslation(c.center.x, c.center.y, c.center.z);
  if (c.kind !== 'ball' && c.quat) desc.setRotation({ x: c.quat.x, y: c.quat.y, z: c.quat.z, w: c.quat.w });
  return world.createCollider(desc);
}
