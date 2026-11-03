import { signal } from '@preact/signals';
import { beep, sfx } from '../audio/audio';
import { SUN_DIR } from '../world/sky';

// A simplified outpost electrical system: three VSAT-style solar towers, a main power
// bus, a battery bank and the loads that use the energy. Power is in kilowatts (kW,
// how fast energy flows); stored energy is in kilowatt-hours (kWh).

/** Peak output of one tower facing the Sun (NASA's VSAT goal was about 10 kW per tower). */
export const ARRAY_KW = 10;
export const BATTERY_KWH = 100;
/** How long the Sun stays below the horizon in Mission 3, in game hours. */
export const NIGHT_HOURS = 10;
/** Within this many degrees of the Sun, a tower locks on and starts tracking. */
export const LOCK_DEG = 4;
const DEPLOY_SECONDS = 5;

export type LoadId = 'life' | 'heat' | 'comms' | 'flood' | 'lab' | 'rover' | 'hab2' | 'gh';
/** extra: only listed once a later mission switches it on (e.g. the new habitat module). */
export const LOADS: { id: LoadId; kw: number; essential?: boolean; extra?: boolean }[] = [
  { id: 'life', kw: 3.0, essential: true },
  { id: 'heat', kw: 2.5, essential: true },
  { id: 'comms', kw: 0.4, essential: true },
  { id: 'flood', kw: 1.2 },
  { id: 'lab', kw: 2.0 },
  { id: 'rover', kw: 3.0 },
  { id: 'hab2', kw: 2.0, essential: true, extra: true },
  { id: 'gh', kw: 4.0, extra: true },
];

/** A load's power right now (the greenhouse depends on its light cycle). */
export function kwOf(id: LoadId, p = power.value) {
  return id === 'gh' ? p.ghKW : LOADS.find((l) => l.id === id)!.kw;
}

export interface ArrayState {
  /** 0 = stowed, 1 = fully deployed. */
  deploy: number;
  deploying: boolean;
  /** Direction the panels face, degrees (same convention as sunYaw()). */
  yaw: number;
  tracking: boolean;
  /** Fraction of the panels still working (1 = all; damage lowers it). */
  health?: number;
}

/** Stowed towers point the wrong way, each by a different amount. */
const STOWED_OFFSET = [72, -58, 115];

function initial() {
  return {
    arrays: STOWED_OFFSET.map((o) => ({ deploy: 0, deploying: false, yaw: sunYaw() + o, tracking: false }) as ArrayState),
    bus: false,
    batteryKWh: 12,
    loads: { life: true, heat: true, comms: true, flood: true, lab: true, rover: true, hab2: false, gh: false } as Record<LoadId, boolean>,
    /** Greenhouse grow-light power, kW (set by its light cycle). */
    ghKW: 0,
    /** Fraction of full sunlight reaching the towers (0 while the Sun is below the horizon). */
    sun: 1,
    planLocked: false,
  };
}

export const power = signal(initial());
/** Which tower's control panel is open. */
export const arrayPanel = signal(0);

type Listener = (event: 'deployed' | 'locked' | 'bus' | 'plan') => void;
let listener: Listener = () => {};
export function onPowerEvent(l: Listener) {
  listener = l;
}

export function resetPower() {
  power.value = initial();
}

/** The state Mission 3 leaves behind (used by later missions). */
export function powerOnline() {
  const p = initial();
  p.arrays = p.arrays.map(() => ({ deploy: 1, deploying: false, yaw: sunYaw(), tracking: true }));
  p.bus = true;
  p.batteryKWh = 80;
  power.value = p;
}

/** Compass direction of the Sun as a yaw angle in degrees. */
export function sunYaw() {
  return (Math.atan2(SUN_DIR.x, SUN_DIR.z) * 180) / Math.PI;
}

/** Signed angle between where a tower faces and the Sun, -180..180 degrees. */
export function aimError(a: ArrayState) {
  return ((((a.yaw - sunYaw()) % 360) + 540) % 360) - 180;
}

/** Sunlight falling on a flat panel scales with the cosine of the angle to the Sun. */
export function arrayKW(a: ArrayState, sun = power.value.sun) {
  if (a.deploy <= 0) return 0;
  return ARRAY_KW * a.deploy * (a.health ?? 1) * Math.max(0, Math.cos((aimError(a) * Math.PI) / 180)) * sun;
}

export function solarKW(p = power.value) {
  return p.arrays.reduce((s, a) => s + arrayKW(a, p.sun), 0);
}

export function loadKW(p = power.value) {
  return LOADS.reduce((s, l) => s + (p.loads[l.id] ? kwOf(l.id, p) : 0), 0);
}

/** How long the battery would last with no sunlight at the current load. */
export function hoursLeft(p = power.value) {
  const load = loadKW(p);
  return load > 0 ? p.batteryKWh / load : Infinity;
}

function patchArray(i: number, patch: Partial<ArrayState>) {
  const arrays = power.value.arrays.map((a, k) => (k === i ? { ...a, ...patch } : a));
  power.value = { ...power.value, arrays };
}

/** Damage or repair a tower (0 = no output, 1 = all panels working). */
export function setArrayHealth(i: number, health: number) {
  patchArray(i, { health });
}

export function deployArray(i: number) {
  const a = power.value.arrays[i];
  if (a.deploy > 0 || a.deploying) return beep('warn');
  beep('select');
  sfx('servo');
  patchArray(i, { deploying: true });
}

/** Turns a deployed tower; it locks on once it faces the Sun closely enough. */
export function aimArray(i: number, yaw: number) {
  const a = power.value.arrays[i];
  if (a.deploy < 1 || a.tracking) return;
  const next = { ...a, yaw };
  patchArray(i, { yaw });
  if (Math.abs(aimError(next)) < LOCK_DEG) {
    patchArray(i, { tracking: true });
    beep('ok');
    sfx('powerup');
    listener('locked');
  }
}

export function connectBus() {
  if (power.value.bus) return;
  power.value = { ...power.value, bus: true };
  sfx('powerup');
  listener('bus');
}

export function setLoad(id: LoadId, on: boolean) {
  const p = power.value;
  if (p.planLocked || LOADS.find((l) => l.id === id)?.essential) return beep('warn');
  beep('select');
  power.value = { ...p, loads: { ...p.loads, [id]: on } };
}

/** Accepts the power plan if the battery would last through the dark. */
export function confirmPlan() {
  if (power.value.planLocked) return false;
  if (hoursLeft() < NIGHT_HOURS) {
    beep('warn');
    return false;
  }
  power.value = { ...power.value, planLocked: true };
  listener('plan');
  return true;
}

/** Switches a facility's load on or off from game logic (not the player's power plan). */
export function setExtraLoad(id: LoadId, on: boolean) {
  const p = power.value;
  if (p.loads[id] !== on) power.value = { ...p, loads: { ...p.loads, [id]: on } };
}

/** Grow lights on at this power (0 = off). */
export function setGreenhouseLoad(kw: number) {
  const p = power.value;
  power.value = { ...p, ghKW: kw, loads: { ...p.loads, gh: kw > 0 } };
}

export function setSunlight(sun: number) {
  if (Math.abs(sun - power.value.sun) > 1e-4) power.value = { ...power.value, sun };
}

/**
 * Advances the power system. realDt drives the machines (deploying, turning);
 * gameSeconds drives the energy flow, so sped-up time charges the battery faster.
 */
export function simulatePower(realDt: number, gameSeconds: number) {
  const p = power.value;
  let changed = false;
  const sy = sunYaw();
  const arrays = p.arrays.map((a) => {
    if (a.deploying) {
      changed = true;
      const deploy = Math.min(1, a.deploy + realDt / DEPLOY_SECONDS);
      if (deploy >= 1) queueMicrotask(() => listener('deployed'));
      return { ...a, deploy, deploying: deploy < 1 };
    }
    if (a.tracking) {
      // Tracking motors turn the tower to follow the Sun as it moves along the horizon.
      const err = ((((sy - a.yaw) % 360) + 540) % 360) - 180;
      if (Math.abs(err) > 0.01) {
        changed = true;
        return { ...a, yaw: a.yaw + Math.sign(err) * Math.min(Math.abs(err), 20 * realDt) };
      }
    }
    return a;
  });
  let battery = p.batteryKWh;
  if (p.bus) {
    const net = solarKW({ ...p, arrays }) - loadKW(p);
    battery = Math.max(0, Math.min(BATTERY_KWH, battery + (net * gameSeconds) / 3600));
    changed ||= battery !== p.batteryKWh;
  }
  if (changed) power.value = { ...p, arrays, batteryKWh: battery };
}
