import { signal } from '@preact/signals';
import { built, FACILITIES, type FacilityId } from './construction';
import { crew, CREW, type CrewId } from './crew';
import { emergency, NORMAL_TEMP } from './emergency';
import { greenhouse } from './greenhouse';
import { life } from './lifesupport';
import { capacityKWh, loadKW, power, solarKW, sunYaw } from './power';
import { NORMAL_SPEED } from './state';

// Mission 9: thirty days of keeping the whole outpost alive. Everything is linked:
// power runs life support and heating; life support turns water into oxygen; the
// greenhouse needs power and water; people need air, water, food and a safe temperature.
// Rates are per game day and based on NASA's numbers, rounded to keep them easy to follow.

export const SETTLE_DAYS = 30;
export type Speed = 'normal' | 'fast' | 'fastest';
/** Game seconds per real second: normal, one day in 30 s, one day in 15 s. */
export const SPEEDS: Record<Speed, number> = { normal: NORMAL_SPEED, fast: 2880, fastest: 5760 };

/** The oxygen reserve tanks hold 40 kg (the % shown is of this). */
export const O2_TANK_KG = 40;
/** Each astronaut breathes about 0.84 kg of oxygen a day (NASA). */
export const O2_PER_PERSON = 0.84;
/** The generator splits water into up to 4 kg of oxygen a day while powered. */
export const O2_GEN_KG = 4;
export const O2_PLANT_KG = 1.5;
/** Water each person uses a day for drinking, food and washing, litres. */
export const WATER_PER_PERSON = 10;
export const RECOVERY = 0.93;
export const RECOVERY_UPGRADED = 0.98;
/** Water split for oxygen that is not won back, litres a day. */
const ELECTROLYSIS_L = 2;
/** Days of food the greenhouse adds per day while it has light and water. */
export const GREENHOUSE_FOOD = 0.3;
/** What each Mission 9 facility adds to the outpost's power use once it runs, kW. */
const RUN_KW: Partial<Record<FacilityId, number>> = Object.fromEntries(FACILITIES.filter((f) => f.runKW > 0).map((f) => [f.id, f.runKW]));

export interface Building {
  id: FacilityId;
  hours: number;
  total: number;
}

function initial() {
  return {
    /** Settlement days passed (0..30). */
    day: 0,
    speed: 'normal' as Speed,
    /** Facilities under construction, with game hours left. */
    building: [] as Building[],
    /** Mission 9 facilities finished and running. */
    running: [] as FacilityId[],
    /** Fraction of full sunlight on the towers (dips during the long shadow). */
    sun: 1,
    /** Equipment condition, %. Machines wear; repairs and the workshop help. */
    condition: 100,
    /** Worst moments, for the final report. */
    low: { battery: 100, water: 999, food: 999, o2: 100 },
    failed: null as null | 'health',
    finished: false,
  };
}

export const settlement = signal(initial());
type S = ReturnType<typeof initial>;
function patch(p: Partial<S>) {
  settlement.value = { ...settlement.value, ...p };
}

export function resetSettlement() {
  settlement.value = initial();
}

export const has = (id: FacilityId, s = settlement.value) => s.running.includes(id);

export function setSpeed(speed: Speed) {
  patch({ speed });
}

/** Start building a facility (the planner already took the kits and energy). */
export function startBuilding(id: FacilityId) {
  const f = FACILITIES.find((x) => x.id === id)!;
  patch({ building: [...settlement.value.building, { id, hours: f.hours, total: f.hours }] });
}

/** The outpost's power is really reaching the machines. */
export function powered(p = power.value) {
  return p.batteryKWh > 0.05 || solarKW(p) >= loadKW(p);
}

export function o2GenRunning() {
  return powered() && power.value.loads.life && life.value.waterL > 0;
}

/** Daily rates, for the settlement panel (positive = going up). */
export function rates() {
  const s = settlement.value;
  const e = emergency.value;
  const on = powered();
  const gen = o2GenRunning() ? O2_GEN_KG : 0;
  const plant = has('oxygen') && on ? O2_PLANT_KG : 0;
  const breathe = O2_PER_PERSON * CREW.length;
  // Oxygen above what the crew breathes tops the tanks up, until they are full.
  const o2Kg = gen + plant - breathe;
  const use = WATER_PER_PERSON * CREW.length * (e.rationing ? 0.5 : 1);
  const recovery = !e.recycling ? (has('water') ? 0.6 : 0) : has('water') ? RECOVERY_UPGRADED : RECOVERY;
  const water = -use * (1 - recovery) - (gen > 0 ? ELECTROLYSIS_L : 0) - (power.value.loads.gh ? 0.5 : 0);
  const growing = on && power.value.loads.gh && life.value.waterL > 0;
  const food = -1 + (growing ? GREENHOUSE_FOOD : 0);
  void s;
  return { o2Pct: (o2Kg / O2_TANK_KG) * 100, o2Kg, water, food, gen, breathe, recovery, use };
}

/** Called when a facility finishes: what it changes. */
function finish(id: FacilityId) {
  const p = power.value;
  if (id === 'battery') power.value = { ...p, extraKWh: (p.extraKWh ?? 0) + 100 };
  else if (id === 'solar') power.value = { ...p, arrays: [...p.arrays, { deploy: 1, deploying: false, yaw: sunYaw(), tracking: true, health: 1 }] };
  const kw = RUN_KW[id] ?? 0;
  if (kw) power.value = { ...power.value, facilityKW: (power.value.facilityKW ?? 0) + kw };
}

export type SettleEvent = 'built' | 'failed' | 'day';
const listeners: ((e: SettleEvent, id?: FacilityId) => void)[] = [];
export function onSettleEvent(l: (e: SettleEvent, id?: FacilityId) => void) {
  listeners.push(l);
}
const emit = (e: SettleEvent, id?: FacilityId) => listeners.forEach((l) => l(e, id));

/** Advances the whole outpost by game time. */
export function simulateSettlement(gameSeconds: number) {
  const s = settlement.value;
  if (s.finished || s.failed) return;
  const days = gameSeconds / 86400;
  const hours = gameSeconds / 3600;
  const r = rates();
  const e = emergency.value;
  const p: Partial<S> = { day: Math.min(SETTLE_DAYS, s.day + days) };
  if (Math.floor(p.day!) !== Math.floor(s.day)) queueMicrotask(() => emit('day'));

  // Construction crews work around the clock.
  const done: FacilityId[] = [];
  const building = s.building
    .map((b) => ({ ...b, hours: b.hours - hours }))
    .filter((b) => {
      if (b.hours > 0) return true;
      done.push(b.id);
      return false;
    });
  p.building = building;
  if (done.length) {
    p.running = [...s.running, ...done];
    done.forEach(finish);
  }

  // Air, water and food.
  const em: Partial<typeof e> = {};
  em.o2Reserve = Math.max(0, Math.min(100, e.o2Reserve + r.o2Pct * days));
  life.value = { ...life.value, waterL: Math.max(0, Math.min(150, life.value.waterL + r.water * days)) };
  greenhouse.value = { ...greenhouse.value, foodDays: Math.max(0, greenhouse.value.foodDays + r.food * days) };
  // Heating: without power the habitat slowly cools toward freezing.
  if (e.active !== 'thermal') {
    const warm = powered() && power.value.loads.heat;
    em.tempC = warm ? Math.min(NORMAL_TEMP, e.tempC + 1 * hours) : Math.max(2, e.tempC - 0.6 * hours);
    if (warm && e.tempC > NORMAL_TEMP) em.tempC = Math.max(NORMAL_TEMP, e.tempC - 1 * hours);
  }
  emergency.value = { ...emergency.value, ...em };

  // Machines wear out a little every day (half as fast with a workshop).
  p.condition = Math.max(40, s.condition - days * (has('workshop', s) ? 0.5 : 1));

  // People: what hurts them, and the medical officer helping them recover.
  const o2Out = (em.o2Reserve ?? e.o2Reserve) <= 0 && !o2GenRunning();
  const hurts = [o2Out ? 40 : 0, life.value.waterL <= 0 ? 25 : 0, greenhouse.value.foodDays <= 0 ? 10 : 0, (em.tempC ?? e.tempC) < 12 || (em.tempC ?? e.tempC) > 30 ? 15 : 0];
  const harm = hurts.reduce((a, b) => a + b, 0);
  const c = { ...crew.value };
  for (const m of CREW) {
    const id = m.id as CrewId;
    const h = harm > 0 ? c[id].health - harm * days : Math.min(100, c[id].health + 6 * days);
    c[id] = { ...c[id], health: Math.max(0, h), status: harm > 0 ? 'crew.st.unwell' : c[id].status === 'crew.st.unwell' ? 'crew.st.safe' : c[id].status };
  }
  crew.value = c;

  const pw = power.value;
  p.low = {
    battery: Math.min(s.low.battery, (pw.batteryKWh / capacityKWh(pw)) * 100),
    water: Math.min(s.low.water, life.value.waterL),
    food: Math.min(s.low.food, greenhouse.value.foodDays),
    o2: Math.min(s.low.o2, emergency.value.o2Reserve),
  };
  if (CREW.some((m) => c[m.id as CrewId].health < 20)) {
    p.failed = 'health';
    queueMicrotask(() => emit('failed'));
  }
  patch(p);
  for (const id of done) emit('built', id);
}

/** Final score out of 100 and 1–3 stars. */
export function score(firstTry: number) {
  const s = settlement.value;
  const c = crew.value;
  const avg = CREW.reduce((a, m) => a + c[m.id as CrewId].health, 0) / CREW.length;
  const crewPts = Math.round((avg / 100) * 40);
  const supplyPts = (life.value.waterL >= 20 ? 10 : 0) + (greenhouse.value.foodDays >= 3 ? 10 : 0) + (emergency.value.o2Reserve >= 50 ? 10 : 0);
  // Three surprise emergencies: 20 points for the best first response every time.
  const emPts = Math.round((Math.min(firstTry, 3) / 3) * 20);
  const buildPts = Math.min(10, Math.round(s.running.length * 2.5));
  const total = crewPts + supplyPts + emPts + buildPts;
  return { avg, crewPts, supplyPts, emPts, buildPts, total, stars: total >= 85 ? 3 : total >= 65 ? 2 : 1 };
}

/** Facilities you could still build in Mission 9 (for the hint text). */
export const buildable = () => FACILITIES.filter((f) => !built.value.includes(f.id));
