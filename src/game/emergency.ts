import { signal } from '@preact/signals';
import { beep, sfx } from '../audio/audio';
import { CREW, sendToShelter } from './crew';
import { greenhouse } from './greenhouse';
import { life } from './lifesupport';
import { capacityKWh, power, setArrayHealth, setExtraLoad } from './power';
import { rad } from './radiation';

// Mission 8 (and 9) emergencies. Each one runs the same way: an alarm with a severity and the
// systems it hits, a choice of first response, finding the cause, a repair, and an
// after-action report that explains what happened, why, and how engineers prevent it.
// The numbers are simplified but follow real cause and effect.

export type EmId = 'solar' | 'leak' | 'thermal' | 'recycler' | 'comms' | 'battery' | 'storm';
export const EM_ORDER: EmId[] = ['solar', 'leak', 'thermal'];
export type Severity = 'caution' | 'warning' | 'emergency';

export const EMERGENCIES: Record<EmId, { severity: Severity; systems: string[]; best: number; cause: number; order: number[] }> = {
  solar: { severity: 'warning', systems: ['power', 'battery'], best: 0, cause: 0, order: [1, 0, 2] },
  leak: { severity: 'emergency', systems: ['air', 'hab2', 'crew'], best: 0, cause: 0, order: [2, 0, 1] },
  thermal: { severity: 'warning', systems: ['temp', 'crew'], best: 0, cause: 0, order: [1, 2, 0] },
  // Mission 9 adds these (the storm has no cause to find: you get the crew to the shelter).
  recycler: { severity: 'warning', systems: ['water', 'crew'], best: 0, cause: 0, order: [2, 0, 1] },
  comms: { severity: 'caution', systems: ['comms'], best: 0, cause: 0, order: [0, 2, 1] },
  battery: { severity: 'warning', systems: ['battery', 'power'], best: 0, cause: 0, order: [1, 0, 2] },
  storm: { severity: 'emergency', systems: ['crew', 'rad'], best: 0, cause: -1, order: [1, 2, 0] },
};
/** For these, a bigger number is worse (the report quotes the highest). */
const HIGH_IS_WORSE: EmId[] = ['thermal', 'comms', 'storm'];

/** HAB-2 air pressure lost per game minute through the hole (about a 3 mm hole in this game). */
const LEAK_KPA_MIN = 0.5;
const REPRESS_KPA_MIN = 3;
/** HAB-1 warms this fast with no coolant flowing (crew, computers and lights all make heat). */
const HEAT_C_MIN = 0.12;
const COOL_C_MIN = 0.1;
export const NORMAL_TEMP = 22.5;
/** The non-essential loads switched off while running on the battery. */
const SHED = ['lab', 'rover', 'flood'] as const;

export type Phase = 'idle' | 'alert' | 'diagnose' | 'repair' | 'recover' | 'report';

export interface Report {
  tries: number;
  diagTries: number;
  minutes: number;
  worst: number;
}

function initial() {
  return {
    active: null as EmId | null,
    phase: 'idle' as Phase,
    /** Last wrong response or diagnosis picked (for its explanation), or null. */
    wrong: null as number | null,
    tries: 0,
    diagTries: 0,
    /** Leak hunt: which fitting really leaks, and which ones were checked. */
    leak: 0,
    checked: [] as number[],
    /** HAB-2 cabin pressure, kPa. */
    kpa: 101,
    /** HAB-1 cabin temperature, °C. */
    tempC: NORMAL_TEMP,
    /** Spare oxygen in the base's high-pressure tanks, % (used to refill lost air). */
    o2Reserve: 100,
    pumpA: true,
    pumpB: false,
    /** Water recovery running (Mission 9 recycler failure stops it). */
    recycling: true,
    /** Crew is saving water until the recycler is fixed. */
    rationing: false,
    /** Radio link to Earth: 'main' dish, 'backup' antenna (slow) or 'none'. */
    link: 'main' as 'main' | 'backup' | 'none',
    /** A battery module is overheating. */
    cellHot: false,
    /** Game minutes since the alarm. */
    minutes: 0,
    worst: 0,
    reports: {} as Partial<Record<EmId, Report>>,
    done: [] as EmId[],
  };
}

export const emergency = signal(initial());
/** Leak detector reading in dB while hunting the leak (null when not in use). */
export const detector = signal<number | null>(null);

export type EmEvent = 'alarm' | 'responded' | 'diagnosed' | 'found' | 'repaired' | 'report' | 'closed';
// Missions 8 and 9 both listen (each checks it is the one being played).
const listeners: ((e: EmEvent, id: EmId) => void)[] = [];
const listener = (e: EmEvent, id: EmId) => listeners.forEach((l) => l(e, id));
export function onEmEvent(l: (e: EmEvent, id: EmId) => void) {
  listeners.push(l);
}

type S = ReturnType<typeof initial>;
function patch(p: Partial<S>) {
  emergency.value = { ...emergency.value, ...p };
}

export function resetEmergency() {
  emergency.value = initial();
  detector.value = null;
}

const batteryPct = () => (power.value.batteryKWh / capacityKWh()) * 100;
/** The number each report quotes as "worst moment". */
function measure(id: EmId, s: S) {
  if (id === 'solar' || id === 'battery') return batteryPct();
  if (id === 'leak') return s.kpa;
  if (id === 'thermal') return s.tempC;
  if (id === 'recycler') return life.value.waterL;
  if (id === 'storm') return rad.value.lateDose;
  return s.minutes / 60; // comms: hours without the main link
}

export function trigger(id: EmId) {
  const s = emergency.value;
  if (id === 'solar') {
    // Plume grit: one tower shorted out, another lost cells.
    setArrayHealth(1, 0);
    setArrayHealth(2, 0.4);
  }
  if (id === 'thermal') patch({ pumpA: false });
  if (id === 'recycler') patch({ recycling: false });
  if (id === 'comms') patch({ link: 'none' });
  if (id === 'battery') {
    // One module overheats: its share of the stored energy is lost.
    patch({ cellHot: true });
    power.value = { ...power.value, extraKWh: (power.value.extraKWh ?? 0) - 25, batteryKWh: Math.min(power.value.batteryKWh, capacityKWh() - 25) };
  }
  const leak = id === 'leak' ? Math.floor(Math.random() * 3) : s.leak;
  patch({ active: id, phase: 'alert', wrong: null, tries: 0, diagTries: 0, minutes: 0, checked: [], leak, worst: measure(id, emergency.value) });
  sfx('klaxon');
  listener('alarm', id);
}

/** Take `cost` away, down to a small floor, but never push a value up. */
const lower = (v: number, cost: number) => Math.min(v, Math.max(5, v - cost));

/** Pick a first response. Wrong ones cost something real, then you choose again. */
export function respond(opt: number) {
  const s = emergency.value;
  const id = s.active;
  if (!id || s.phase !== 'alert') return;
  const tries = s.tries + 1;
  if (opt !== EMERGENCIES[id].best) {
    beep('warn');
    const p: Partial<S> = { tries, wrong: opt };
    if (id === 'solar') {
      if (opt === 1) p.o2Reserve = Math.max(0, s.o2Reserve - 4); // life support off: the crew breathes the reserve down
      else power.value = { ...power.value, batteryKWh: lower(power.value.batteryKWh, 8) };
    }
    if (id === 'leak') {
      if (opt === 1) p.o2Reserve = Math.max(0, s.o2Reserve - 10); // oxygen pumped straight out of the hole
      else {
        p.kpa = Math.max(60, s.kpa - 6);
        p.o2Reserve = Math.max(0, s.o2Reserve - 5);
      }
    }
    if (id === 'thermal') {
      if (opt === 1) p.o2Reserve = Math.max(0, s.o2Reserve - 8);
      else p.tempC = Math.min(33, s.tempC + 1);
    }
    if (id === 'recycler') {
      if (opt === 1) greenhouse.value = { ...greenhouse.value, foodDays: Math.max(0, greenhouse.value.foodDays - 2) };
      else life.value = { ...life.value, waterL: Math.max(0, life.value.waterL - 10) };
    }
    if (id === 'comms') {
      if (opt === 1) power.value = { ...power.value, batteryKWh: lower(power.value.batteryKWh, 5) };
      else p.minutes = s.minutes + 60;
    }
    if (id === 'battery') {
      if (opt === 1) power.value = { ...power.value, batteryKWh: lower(power.value.batteryKWh, 10) };
      // Dust in the cabinet: some capacity is lost for good (but never all of it).
      else power.value = { ...power.value, extraKWh: Math.max(-60, (power.value.extraKWh ?? 0) - 10) };
    }
    // Storm: every wrong idea wastes warning time.
    if (id === 'storm') rad.value = { ...rad.value, countdown: Math.min(rad.value.countdown, Math.max(15, rad.value.countdown - 20)) };
    patch(p);
    return;
  }
  beep('ok');
  if (id === 'solar') for (const l of SHED) setExtraLoad(l, false);
  if (id === 'thermal') {
    sfx('breaker');
    patch({ pumpB: true });
  }
  if (id === 'leak') sfx('airlock');
  if (id === 'recycler') patch({ rationing: true });
  if (id === 'comms') patch({ link: 'backup' });
  if (id === 'battery') {
    sfx('breaker');
    patch({ cellHot: false });
  }
  if (id === 'storm') for (const m of CREW) if (m.id !== 'eng') sendToShelter(m.id);
  patch({ tries, wrong: null, phase: 'diagnose' });
  listener('responded', id);
}

/** Answer "what caused it?" at the broken equipment. */
export function diagnose(opt: number) {
  const s = emergency.value;
  const id = s.active;
  if (!id || s.phase !== 'diagnose' || id === 'leak' || id === 'storm') return;
  if (opt !== EMERGENCIES[id].cause) {
    beep('warn');
    patch({ diagTries: s.diagTries + 1, wrong: opt });
    return;
  }
  beep('ok');
  patch({ diagTries: s.diagTries + 1, wrong: null, phase: 'repair' });
  listener('diagnosed', id);
}

/** Leak hunt: press the detector against a fitting. True if this is the leak. */
export function checkFitting(i: number) {
  const s = emergency.value;
  if (s.active !== 'leak' || s.phase !== 'diagnose') return false;
  sfx('scan');
  const checked = s.checked.includes(i) ? s.checked : [...s.checked, i];
  if (i !== s.leak) {
    patch({ checked, diagTries: s.diagTries + 1 });
    return false;
  }
  beep('ok');
  patch({ checked, diagTries: s.diagTries + 1, phase: 'repair' });
  listener('found', 'leak');
  return true;
}

export function repair() {
  const s = emergency.value;
  const id = s.active;
  if (!id || s.phase !== 'repair') return;
  if (id === 'solar') {
    // The shorted string is cut out; the other three strings work again.
    setArrayHealth(1, 0.75);
    for (const l of SHED) setExtraLoad(l, true);
    sfx('powerup');
  }
  if (id === 'thermal') {
    patch({ pumpA: true, pumpB: false });
    sfx('powerup');
  }
  if (id === 'leak') sfx('inflate');
  if (id === 'recycler') {
    patch({ recycling: true, rationing: false });
    sfx('powerup');
  }
  if (id === 'comms') {
    patch({ link: 'main' });
    sfx('servo');
  }
  if (id === 'battery') {
    // The spare module goes in: full capacity again.
    power.value = { ...power.value, extraKWh: (power.value.extraKWh ?? 0) + 25 };
    sfx('powerup');
  }
  patch({ phase: 'recover' });
  listener('repaired', id);
}

/** Storm: you made it inside (the storm is now being waited out). */
export function stormSheltered() {
  const s = emergency.value;
  if (s.active === 'storm' && s.phase === 'diagnose') patch({ phase: 'repair' });
}

/** Storm: the particles have died down. */
export function stormDone() {
  const s = emergency.value;
  if (s.active === 'storm' && (s.phase === 'repair' || s.phase === 'diagnose')) {
    patch({ phase: 'recover' });
    listener('repaired', 'storm');
  }
}

export function openReport() {
  const s = emergency.value;
  const id = s.active;
  if (!id || s.phase !== 'recover') return;
  const reports = { ...s.reports, [id]: { tries: s.tries, diagTries: s.diagTries, minutes: s.minutes, worst: Math.max(0, s.worst) } };
  patch({ phase: 'report', reports });
  sfx('terminal');
  listener('report', id);
}

export function closeReport() {
  const s = emergency.value;
  const id = s.active;
  if (!id || s.phase !== 'report') return;
  patch({ active: null, phase: 'idle', done: [...s.done, id] });
  listener('closed', id);
}

let tick = 0;
/**
 * Leak hunt: the detector reading and its beeps, which speed up and rise in pitch near the
 * hole. distance = metres from your eyes to the leak (null while a terminal is open).
 */
export function updateDetector(dt: number, distance: number | null) {
  const s = emergency.value;
  const hunting = s.active === 'leak' && s.phase === 'diagnose';
  if (!hunting) {
    if (detector.value !== null) detector.value = null;
    return;
  }
  if (distance === null) return;
  const db = Math.min(96, 20 + 75 * Math.exp(-(distance - 1.2) / 1.6));
  detector.value = db;
  tick -= dt;
  if (tick <= 0 && distance < 14) {
    sfx('tick', db / 92);
    tick = 1.1 + (0.07 - 1.1) * Math.max(0, Math.min(1, (db - 20) / 76));
  }
}

/** True once the systems have come back after a repair (ready for the report). */
export function recovered(s = emergency.value) {
  if (s.phase !== 'recover') return false;
  if (s.active === 'leak') return s.kpa >= 100.5;
  if (s.active === 'thermal') return s.tempC <= 24;
  return true;
}

/** Advances the cabin pressure and temperature by game time. */
export function simulateEmergency(gameSeconds: number) {
  const s = emergency.value;
  if (!s.active) return;
  const mins = gameSeconds / 60;
  const p: Partial<S> = {};
  if (s.phase !== 'report') p.minutes = s.minutes + mins;
  if (s.active === 'leak') {
    if (s.phase === 'recover') {
      // Refill from the tanks: every kPa put back comes out of the oxygen reserve.
      const add = Math.min(101 - s.kpa, REPRESS_KPA_MIN * mins);
      p.kpa = s.kpa + add;
      p.o2Reserve = Math.max(0, s.o2Reserve - add * 0.25);
    } else if (s.phase !== 'report') p.kpa = Math.max(60, s.kpa - LEAK_KPA_MIN * mins);
  }
  if (s.active === 'thermal') {
    const flowing = s.pumpA || s.pumpB;
    p.tempC = flowing ? Math.max(NORMAL_TEMP, s.tempC - COOL_C_MIN * mins) : Math.min(33, s.tempC + HEAT_C_MIN * mins);
  }
  const next = { ...s, ...p };
  const m = measure(s.active, next);
  p.worst = HIGH_IS_WORSE.includes(s.active) ? Math.max(s.worst, m) : Math.min(s.worst, m);
  patch(p);
}
