import { effect, signal } from '@preact/signals';
import { knowledge } from './state';

// Saved progress (this browser only): the highest mission unlocked and the science
// cards found so far. Settings are saved separately in engine/settings.ts.

/** Missions that exist in this build. */
export const MISSION_COUNT = 3;

const KEY = 'junior-astronaut.progress';

function load(): { reached: number; knowledge: string[] } {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { reached: Math.max(1, Math.min(MISSION_COUNT, Number(p.reached) || 1)), knowledge: Array.isArray(p.knowledge) ? p.knowledge : [] };
  } catch {
    return { reached: 1, knowledge: [] };
  }
}

export const progress = signal(load());
knowledge.value = progress.value.knowledge;

effect(() => {
  const k = knowledge.value;
  if (k !== progress.value.knowledge) progress.value = { ...progress.value, knowledge: k };
});

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress.value));
  } catch {
    // Private windows can block storage; progress then lasts for this visit only.
  }
});

/** Unlocks the mission after `n`. */
export function missionDone(n: number) {
  const reached = Math.min(MISSION_COUNT, Math.max(progress.value.reached, n + 1));
  if (reached !== progress.value.reached) progress.value = { ...progress.value, reached };
}

export function resetProgress() {
  knowledge.value = [];
  progress.value = { reached: 1, knowledge: [] };
}
