import { signal } from '@preact/signals';
import { beep, sfx } from '../audio/audio';
import { life } from './lifesupport';
import { setExtraLoad } from './power';

// The new inflatable habitat module (HAB-2): connect, inflate, pressurise, heat and fit
// it out so the crew of four has a safe place to live and sleep.

/** Cabin pressure choices, kPa. Earth's air at sea level is 101.3 kPa. */
export const PRESSURES: { kpa: number; id: 'sea' | 'explore' | 'suit'; ok: boolean }[] = [
  { kpa: 101, id: 'sea', ok: true },
  { kpa: 70, id: 'explore', ok: true },
  { kpa: 30, id: 'suit', ok: false },
];
/** Comfortable cabin temperatures, like the ISS (about 18–27 °C). */
export const COMFORT = { min: 18, max: 27 };
export const WATER_WALL_LITRES = 40;
const TUNNEL_SECONDS = 5;
const INFLATE_SECONDS = 12;
const LEAK_TEST_SECONDS = 6;

function initial() {
  return {
    built: false,
    /** 0..1: the connecting tunnel extends from the node. */
    tunnel: 0,
    /** 0 = packed, 1 = fully inflated. */
    inflate: 0,
    inflating: false,
    targetKPa: 0,
    kpa: 0,
    /** 0..1 progress of the leak check once the target pressure is reached. */
    leak: 0,
    pressurized: false,
    tempC: -60,
    setTemp: 12,
    heaters: false,
    lines: false,
    water: false,
    beds: false,
    crewIn: false,
  };
}

export const habitat = signal(initial());

export type HabEvent = 'built' | 'inflated' | 'pressurized' | 'heated' | 'outfit';
let listener: (e: HabEvent) => void = () => {};
export function onHabEvent(l: (e: HabEvent) => void) {
  listener = l;
}

function patch(p: Partial<ReturnType<typeof initial>>) {
  habitat.value = { ...habitat.value, ...p };
}

export function resetHabitat() {
  habitat.value = initial();
  setExtraLoad('hab2', false);
}

/** The state Mission 4 leaves behind (used by later missions). */
export function habitatDone() {
  habitat.value = { ...initial(), built: true, tunnel: 1, inflate: 1, targetKPa: 101, kpa: 101, leak: 1, pressurized: true, tempC: 21, setTemp: 21, heaters: true, lines: true, water: true, beds: true, crewIn: true };
  setExtraLoad('hab2', true);
}

export function startBuild() {
  patch({ built: true });
}

export function startInflate() {
  const h = habitat.value;
  if (h.inflate > 0 || h.inflating || h.tunnel < 1) return;
  sfx('inflate');
  patch({ inflating: true });
}

/** Returns false if the pressure is not safe to live in. */
export function choosePressure(kpa: number) {
  const h = habitat.value;
  const opt = PRESSURES.find((p) => p.kpa === kpa);
  if (!opt || h.inflate < 1 || h.pressurized) return false;
  if (!opt.ok) {
    beep('warn');
    return false;
  }
  beep('select');
  sfx('refill');
  patch({ targetKPa: kpa, leak: 0 });
  return true;
}

export function nudgeTemp(d: number) {
  const h = habitat.value;
  if (h.heaters) return;
  beep('select');
  patch({ setTemp: Math.max(10, Math.min(35, h.setTemp + d)) });
}

export function heatersOn() {
  const h = habitat.value;
  if (!h.pressurized || h.heaters || h.setTemp < COMFORT.min || h.setTemp > COMFORT.max) return beep('warn');
  beep('ok');
  sfx('powerup');
  setExtraLoad('hab2', true);
  patch({ heaters: true });
}

function outfitDone(h = habitat.value) {
  return h.lines && h.water && h.beds;
}

function fitOut(p: Partial<ReturnType<typeof initial>>) {
  const h = habitat.value;
  if (!h.heaters || Math.abs(h.tempC - h.setTemp) > 0.6) return beep('warn');
  beep('ok');
  sfx('clunk');
  patch(p);
  if (outfitDone()) listener('outfit');
}

export const connectLines = () => fitOut({ lines: true });
export function fillWaterWalls() {
  if (life.value.waterL < WATER_WALL_LITRES) return beep('warn');
  life.value = { ...life.value, waterL: life.value.waterL - WATER_WALL_LITRES };
  fitOut({ water: true });
}
export const installBeds = () => fitOut({ beds: true });
export const moveCrewIn = () => patch({ crewIn: true });

export function simulateHabitat(dt: number) {
  const h = habitat.value;
  const p: Partial<ReturnType<typeof initial>> = {};
  const events: HabEvent[] = [];
  if (h.built && h.tunnel < 1) {
    p.tunnel = Math.min(1, h.tunnel + dt / TUNNEL_SECONDS);
    if (p.tunnel >= 1) events.push('built');
  }
  if (h.inflating) {
    p.inflate = Math.min(1, h.inflate + dt / INFLATE_SECONDS);
    if (p.inflate >= 1) {
      p.inflating = false;
      events.push('inflated');
    }
  }
  if (h.targetKPa > 0 && !h.pressurized) {
    if (h.kpa < h.targetKPa) p.kpa = Math.min(h.targetKPa, h.kpa + 22 * dt);
    else {
      // Leak check: the pressure has to hold steady with the valves closed.
      p.leak = Math.min(1, h.leak + dt / LEAK_TEST_SECONDS);
      if (p.leak >= 1) {
        p.pressurized = true;
        events.push('pressurized');
      }
    }
  }
  if (h.heaters && Math.abs(h.tempC - h.setTemp) > 0.01) {
    const step = Math.sign(h.setTemp - h.tempC) * Math.min(Math.abs(h.setTemp - h.tempC), 10 * dt);
    p.tempC = h.tempC + step;
    if (Math.abs(p.tempC - h.setTemp) < 0.01) events.push('heated');
  }
  if (Object.keys(p).length) habitat.value = { ...h, ...p };
  for (const e of events) listener(e);
}
