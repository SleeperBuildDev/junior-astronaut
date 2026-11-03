import { signal } from '@preact/signals';

// The four-person crew. The player is the flight engineer; the other three are
// characters who report by radio. Later missions affect their health and safety.

export type CrewId = 'cmdr' | 'eng' | 'sci' | 'med';

export const CREW: { id: CrewId; icon: string }[] = [
  { id: 'cmdr', icon: '🎖️' },
  { id: 'eng', icon: '🔧' },
  { id: 'sci', icon: '🔬' },
  { id: 'med', icon: '⚕️' },
];

export type Where = 'lander' | 'hab2' | 'outside';

export interface CrewMember {
  health: number;
  where: Where;
  /** Status text key. */
  status: string;
}

function crewAt(where: Where, status: string): Record<CrewId, CrewMember> {
  return {
    cmdr: { health: 100, where, status },
    eng: { health: 100, where: 'outside', status: 'crew.st.eva' },
    sci: { health: 100, where, status },
    med: { health: 100, where, status },
  };
}

export const crew = signal(crewAt('lander', 'crew.st.cramped'));

/** Missions before 4: the crew sleeps in the lander. From Mission 5 on: in HAB-2. */
export function resetCrew(mission: number) {
  crew.value = mission >= 5 ? crewAt('hab2', 'crew.st.safe') : crewAt('lander', 'crew.st.cramped');
}

export function crewMovesIn() {
  crew.value = crewAt('hab2', 'crew.st.safe');
}
