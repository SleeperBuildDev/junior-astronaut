import { signal } from '@preact/signals';
import { beep } from '../audio/audio';

// The four-person crew. The player is the flight engineer; the other three are
// characters who report by radio. Later missions affect their health and safety.

export type CrewId = 'cmdr' | 'eng' | 'sci' | 'med';

export const CREW: { id: CrewId; icon: string }[] = [
  { id: 'cmdr', icon: '🎖️' },
  { id: 'eng', icon: '🔧' },
  { id: 'sci', icon: '🔬' },
  { id: 'med', icon: '⚕️' },
];

export type Where = 'lander' | 'hab2' | 'outside' | 'lab' | 'gh' | 'moving' | 'shelter';

export interface CrewMember {
  health: number;
  where: Where;
  /** Status text key. */
  status: string;
  /** Seconds until they reach the shelter (while moving). */
  eta?: number;
}

/** How long each crew member takes to reach the storm shelter from their Mission 6 job, seconds. */
export const SHELTER_ETA: Partial<Record<CrewId, number>> = { cmdr: 4, med: 7, sci: 15 };

function crewAt(where: Where, status: string): Record<CrewId, CrewMember> {
  return {
    cmdr: { health: 100, where, status },
    eng: { health: 100, where: 'outside', status: 'crew.st.eva' },
    sci: { health: 100, where, status },
    med: { health: 100, where, status },
  };
}

export const crew = signal(crewAt('lander', 'crew.st.cramped'));

/** Missions before 4: the crew sleeps in the lander. Mission 5: in HAB-2. Mission 6: out at work. */
export function resetCrew(mission: number) {
  if (mission === 6) {
    crew.value = {
      cmdr: { health: 100, where: 'lab', status: 'crew.st.lab' },
      eng: { health: 100, where: 'outside', status: 'crew.st.eva' },
      sci: { health: 100, where: 'outside', status: 'crew.st.samples' },
      med: { health: 100, where: 'gh', status: 'crew.st.gh' },
    };
  } else crew.value = mission >= 5 ? crewAt('hab2', 'crew.st.safe') : crewAt('lander', 'crew.st.cramped');
}

export function crewMovesIn() {
  crew.value = crewAt('hab2', 'crew.st.safe');
}

let listener: () => void = () => {};
/** Called once all three crew members have been ordered to the shelter. */
export function onAllSent(l: () => void) {
  listener = l;
}

const OTHERS: CrewId[] = ['cmdr', 'sci', 'med'];
/** Everyone has been told to go (they may still be on the way). */
export const allSent = (c = crew.value) => OTHERS.every((id) => c[id].where === 'moving' || c[id].where === 'shelter');

export function sendToShelter(id: CrewId) {
  const m = crew.value[id];
  if (id === 'eng' || m.where === 'shelter' || m.where === 'moving') return;
  beep('select');
  crew.value = { ...crew.value, [id]: { ...m, where: 'moving', status: 'crew.st.moving', eta: SHELTER_ETA[id] ?? 5 } };
  if (allSent()) listener();
}

export const othersSheltered = (c = crew.value) => OTHERS.every((id) => c[id].where === 'shelter');

export function simulateCrew(dt: number) {
  const c = crew.value;
  let changed = false;
  const next = { ...c };
  for (const id of ['cmdr', 'sci', 'med'] as CrewId[]) {
    const m = c[id];
    if (m.where !== 'moving') continue;
    changed = true;
    const eta = (m.eta ?? 0) - dt;
    next[id] = eta <= 0 ? { ...m, where: 'shelter', status: 'crew.st.shelter', eta: 0 } : { ...m, eta };
  }
  if (!changed) return;
  crew.value = next;
  if (othersSheltered(next) && !othersSheltered(c)) beep('ok');
}

/** The player, safe inside. */
export function engineerInside() {
  crew.value = { ...crew.value, eng: { ...crew.value.eng, where: 'shelter', status: 'crew.st.shelter' } };
}
