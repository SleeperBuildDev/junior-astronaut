import { signal } from '@preact/signals';

export type Screen = 'loading' | 'menu' | 'cutscene' | 'briefing' | 'playing' | 'paused' | 'complete' | 'discovery' | 'mtv';

export const screen = signal<Screen>('loading');
export const loadProgress = signal(0);
/** Which overlay panel is open on top of the game (pauses input). */
export const panel = signal<null | 'settings' | 'controls' | 'knowledge' | 'missions' | 'crew' | 'colony'>(null);

export const suit = signal({ o2: 100, power: 100, health: 100, tempIn: 21, tempOut: -48, dose: 0, light: false });

export interface Step {
  id: string;
  text: string;
  done: boolean;
  progress?: string;
}
export const mission = signal<{ title: string; steps: Step[] }>({ title: 'Mission 1: First Steps on the Moon', steps: [] });

export const prompt = signal<string | null>(null);
export const warning = signal<string | null>(null);
export const heading = signal(0);
export const clock = signal({ day: 1, minutes: 6 * 60 + 10 });

export interface Comm {
  id: number;
  from: string;
  text: string;
}
export const comms = signal<Comm[]>([]);
let commId = 0;
export function pushComm(from: string, text: string) {
  comms.value = [...comms.value.slice(-3), { id: ++commId, from, text }];
}

/** Knowledge cards the player has unlocked, newest last. */
export const knowledge = signal<string[]>([]);
/** A card popup announcing a newly unlocked fact. */
export const cardPopup = signal<string | null>(null);
export function unlock(id: string) {
  if (knowledge.value.includes(id)) return;
  knowledge.value = [...knowledge.value, id];
  cardPopup.value = id;
}

/** The machine screen open on top of the game, if any (the game keeps running behind it). */
export const terminal = signal<null | 'life' | 'power' | 'array' | 'build' | 'hab' | 'gh' | 'rad' | 'shelter' | 'notes' | 'lab' | 'alert' | 'diag' | 'aar' | 'final'>(null);
/** Rover dashboard (shown while driving). */
export const drive = signal({ driving: false, speed: 0, battery: 100 });

/**
 * Game seconds per real second. The mission clock normally runs 30x faster than real
 * time; missions speed it up further for long waits (charging, the dark hours).
 */
export const NORMAL_SPEED = 30;
export const gameSpeed = signal(NORMAL_SPEED);

export const fps = signal(0);
/** The mission currently loaded (1-based). */
export const missionNumber = signal(1);
/** Progress of a hold-E action, 0..1, or null. */
export const holdProgress = signal<number | null>(null);
/** Screen-space guide marker for the current objective (computed every frame in main.ts). */
export const waypoint = signal<{ x: number; y: number; onScreen: boolean; angle: number; dist: number | null; label: string } | null>(null);

/** What the cutscene overlay shows: a subtitle key and an optional big location caption. */
export const cinema = signal<{ sub: string | null; caption: string | null; gold?: boolean }>({ sub: null, caption: null });
/** The secret discovery being revealed (its card id), for the gold title and the reveal screen. */
export const legend = signal<string | null>(null);
