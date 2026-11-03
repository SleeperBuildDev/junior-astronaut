import { signal } from '@preact/signals';
import { beep, sfx } from '../audio/audio';
import { life } from './lifesupport';
import { setGreenhouseLoad } from './power';

// The greenhouse (GH-1): hydroponic trays under LED grow lights. Plants need water,
// nutrients at the right pH, light (which costs power) and time. Food is counted in
// "days of food" for the crew of four.

export type CropId = 'lettuce' | 'radish' | 'tomato' | 'wheat' | 'potato' | 'soy';
export type CropRole = 'fresh' | 'vitamins' | 'calories' | 'protein';

/** Days to harvest under a 16-hour light cycle (simplified from NASA and university trials). */
export const CROPS: { id: CropId; icon: string; days: number; role: CropRole }[] = [
  { id: 'lettuce', icon: '🥬', days: 30, role: 'fresh' },
  { id: 'radish', icon: '🌱', days: 27, role: 'fresh' },
  { id: 'tomato', icon: '🍅', days: 90, role: 'vitamins' },
  { id: 'wheat', icon: '🌾', days: 70, role: 'calories' },
  { id: 'potato', icon: '🥔', days: 100, role: 'calories' },
  { id: 'soy', icon: '🍃', days: 90, role: 'protein' },
];
/** The quick test crop in the fourth tray. */
export const MICRO_DAYS = 8;
export const TRAYS = 3;

/** Hours of LED light per day: more light grows plants faster but uses more power. */
export const LIGHT_CYCLES: { h: number; kw: number; speed: number }[] = [
  { h: 12, kw: 3.0, speed: 0.75 },
  { h: 16, kw: 4.0, speed: 1.0 },
  { h: 24, kw: 6.0, speed: 1.1 },
];
export const TANK_LITRES = 30;
/** Healthy nutrient solution for most hydroponic crops. */
export const PH_OK = { min: 5.5, max: 6.5 };
/** The day in the time-lapse when the pH drifts out of range. */
const ALARM_DAY = 3;
const ASSEMBLE_SECONDS = 6;

function initial(foodDays = 26) {
  return {
    built: false,
    /** 0..1 while the module is assembled on its pad. */
    assemble: 0,
    tank: false,
    /** Chosen light cycle in hours (0 = not chosen yet). */
    light: 0,
    trays: [] as CropId[],
    planted: false,
    growing: false,
    /** Days of growth so far. */
    day: 0,
    ph: 6.0,
    phAlarm: false,
    alarmDone: false,
    harvested: false,
    /** Stored food, in days for the whole crew. */
    foodDays,
  };
}

export const greenhouse = signal(initial());

export type GhEvent = 'assembled' | 'setup' | 'planted' | 'alarm' | 'fixed' | 'grown' | 'harvested';
let listener: (e: GhEvent) => void = () => {};
export function onGhEvent(l: (e: GhEvent) => void) {
  listener = l;
}

type State = ReturnType<typeof initial>;
const patch = (p: Partial<State>) => (greenhouse.value = { ...greenhouse.value, ...p });

export const cycle = (h = greenhouse.value.light) => LIGHT_CYCLES.find((c) => c.h === h);
/** How far a main crop has grown, 0..1 (more hours of light grow it faster). */
export function growth(days: number, g = greenhouse.value) {
  return Math.min(1, (g.day * (cycle(g.light)?.speed ?? 1)) / days);
}

/** The microgreens test tray is always ready after MICRO_DAYS, so Mission 5 ends on a fixed day. */
export function microGrowth(g = greenhouse.value) {
  return Math.min(1, g.day / MICRO_DAYS);
}

export function resetGreenhouse(foodDays = 26) {
  greenhouse.value = initial(foodDays);
  setGreenhouseLoad(0);
}

/** The state Mission 5 leaves behind (used by later missions). */
export function greenhouseDone(foodDays: number) {
  greenhouse.value = { ...initial(foodDays), built: true, assemble: 1, tank: true, light: 16, trays: ['lettuce', 'wheat', 'soy'], planted: true, growing: true, day: 9, alarmDone: true, harvested: true };
  setGreenhouseLoad(4.0);
}

export const startAssembly = () => patch({ built: true });

function setupCheck() {
  const g = greenhouse.value;
  if (g.tank && g.light) listener('setup');
}

export function fillTank() {
  const g = greenhouse.value;
  if (g.tank || g.assemble < 1 || life.value.waterL < TANK_LITRES) return beep('warn');
  life.value = { ...life.value, waterL: life.value.waterL - TANK_LITRES };
  beep('ok');
  sfx('refill');
  patch({ tank: true });
  setupCheck();
}

export function chooseLight(h: number) {
  const g = greenhouse.value;
  const c = cycle(h);
  if (!c || g.planted || g.assemble < 1) return beep('warn');
  beep('select');
  setGreenhouseLoad(c.kw);
  const first = !g.light;
  patch({ light: h });
  if (first) setupCheck();
}

export function toggleTray(id: CropId) {
  const g = greenhouse.value;
  if (g.planted) return;
  beep('select');
  if (g.trays.includes(id)) patch({ trays: g.trays.filter((t) => t !== id) });
  else if (g.trays.length < TRAYS) patch({ trays: [...g.trays, id] });
  else beep('warn');
}

/** Why the chosen trays can't be planted yet (null = ready). */
export function trayProblem(trays = greenhouse.value.trays): string | null {
  if (trays.length < TRAYS) return 'gh.needThree';
  const roles = trays.map((t) => CROPS.find((c) => c.id === t)!.role);
  if (!roles.includes('fresh')) return 'gh.needFresh';
  if (!roles.some((r) => r === 'calories' || r === 'protein')) return 'gh.needCalories';
  return null;
}

export function plant() {
  const g = greenhouse.value;
  if (g.planted || !g.tank || !g.light || trayProblem()) {
    beep('warn');
    return false;
  }
  beep('ok');
  patch({ planted: true, growing: true });
  listener('planted');
  return true;
}

export function adjustPh(d: number) {
  const g = greenhouse.value;
  if (!g.phAlarm) return;
  beep('select');
  const ph = Math.round((g.ph + d) * 100) / 100;
  if (ph >= PH_OK.min && ph <= PH_OK.max) {
    patch({ ph, phAlarm: false, alarmDone: true });
    listener('fixed');
  } else patch({ ph });
}

export function harvest() {
  const g = greenhouse.value;
  if (g.harvested || microGrowth() < 1) return;
  sfx('clunk');
  // A few trays of microgreens: a small amount of food, but fresh vitamins matter.
  patch({ harvested: true, foodDays: g.foodDays + 0.5 });
  listener('harvested');
}

/** realDt drives the assembly; gameSeconds drives plant growth and the crew eating. */
export function simulateGreenhouse(realDt: number, gameSeconds: number) {
  const g = greenhouse.value;
  const p: Partial<State> = {};
  const events: GhEvent[] = [];
  if (g.built && g.assemble < 1) {
    p.assemble = Math.min(1, g.assemble + realDt / ASSEMBLE_SECONDS);
    if (p.assemble >= 1) events.push('assembled');
  }
  const days = gameSeconds / 86400;
  if (g.growing && !g.phAlarm) {
    const before = microGrowth(g);
    p.day = g.day + days;
    p.foodDays = Math.max(0, g.foodDays - days);
    if (!g.alarmDone && p.day >= ALARM_DAY) {
      // Nutrients get used up unevenly and the solution turns alkaline: iron locks up.
      p.ph = 7.6;
      p.phAlarm = true;
      p.day = ALARM_DAY;
      events.push('alarm');
    } else if (before < 1 && microGrowth({ ...g, ...p }) >= 1) events.push('grown');
  }
  if (Object.keys(p).length) greenhouse.value = { ...g, ...p };
  for (const e of events) listener(e);
}
