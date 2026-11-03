import { signal } from '@preact/signals';
import { beep, sfx } from '../audio/audio';
import { power } from './power';

// The construction planner: every facility type from the design spec, with what it
// costs to build (construction kits from cargo, battery energy, time), what it needs to
// run and what it adds to the outpost. Each type unlocks in the mission that teaches it.

export type FacilityId = 'hab' | 'greenhouse' | 'shelter' | 'lab' | 'workshop' | 'solar' | 'battery' | 'oxygen' | 'water' | 'comms';

export interface Facility {
  id: FacilityId;
  icon: string;
  kits: number;
  kwh: number;
  hours: number;
  /** Power it uses while running, kW (negative = it makes power). */
  runKW: number;
  /** First mission where it can be built. */
  unlock: number;
}

export const FACILITIES: Facility[] = [
  { id: 'hab', icon: '🏠', kits: 6, kwh: 15, hours: 8, runKW: 2.0, unlock: 4 },
  { id: 'greenhouse', icon: '🌱', kits: 5, kwh: 20, hours: 10, runKW: 4.0, unlock: 5 },
  { id: 'shelter', icon: '🛡️', kits: 4, kwh: 10, hours: 12, runKW: 0.3, unlock: 6 },
  { id: 'lab', icon: '🔬', kits: 4, kwh: 10, hours: 8, runKW: 2.0, unlock: 7 },
  { id: 'workshop', icon: '🔧', kits: 3, kwh: 8, hours: 6, runKW: 1.0, unlock: 8 },
  { id: 'solar', icon: '☀️', kits: 4, kwh: 5, hours: 6, runKW: -10, unlock: 9 },
  { id: 'battery', icon: '🔋', kits: 3, kwh: 0, hours: 4, runKW: 0, unlock: 9 },
  { id: 'oxygen', icon: '🫧', kits: 5, kwh: 15, hours: 10, runKW: 3.0, unlock: 9 },
  { id: 'water', icon: '💧', kits: 3, kwh: 8, hours: 6, runKW: 1.0, unlock: 9 },
  { id: 'comms', icon: '📡', kits: 2, kwh: 4, hours: 4, runKW: 0.5, unlock: 9 },
];

/** Construction kits (frames, panels, fasteners, cables) left from the cargo landers. */
export const kits = signal(8);
/** Facilities built so far. */
export const built = signal<FacilityId[]>([]);

export function resetConstruction(kitCount: number, done: FacilityId[] = []) {
  kits.value = kitCount;
  built.value = done;
}

/** What stops a facility from being built right now (empty = it can be built). */
export function blockers(f: Facility, mission: number) {
  const out: string[] = [];
  if (mission < f.unlock) out.push('locked');
  if (built.value.includes(f.id)) out.push('built');
  if (kits.value < f.kits) out.push('kits');
  if (power.value.batteryKWh < f.kwh) out.push('energy');
  return out;
}

// Several missions listen (each reacts only to its own facility).
const listeners: ((id: FacilityId) => void)[] = [];
export function onBuild(l: (id: FacilityId) => void) {
  listeners.push(l);
}

export function build(id: FacilityId, mission: number) {
  const f = FACILITIES.find((x) => x.id === id)!;
  if (blockers(f, mission).length) {
    beep('warn');
    return false;
  }
  kits.value -= f.kits;
  built.value = [...built.value, id];
  power.value = { ...power.value, batteryKWh: power.value.batteryKWh - f.kwh };
  beep('ok');
  sfx('servo');
  for (const l of listeners) l(id);
  return true;
}
