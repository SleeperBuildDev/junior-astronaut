import { signal } from '@preact/signals';
import { beep, sfx } from '../audio/audio';

// Radiation on the outpost (simplified). Doses are in millisieverts (mSv). The surface
// rate is the one China's Chang'e 4 lander measured: about 1.37 mSv per day, mostly
// galactic cosmic rays. A solar particle event (SPE) adds a burst of energetic protons.

export const SURFACE_MSV_DAY = 1.37;

export type SurveyId = 'hab1' | 'hab2' | 'gh';
/** Dose rate measured inside each module before extra shielding, mSv/day. */
export const SURVEY: Record<SurveyId, number> = { hab1: 1.1, hab2: 1.25, gh: 1.2 };
/** Inside HAB-2's sleep area once it is buried under regolith. */
export const SHIELDED_MSV_DAY = 0.55;

export type BermId = 'west' | 'east' | 'south';
export const BERMS: BermId[] = ['west', 'east', 'south'];
const BERM_SECONDS = 4;

/** Real seconds from the flare warning until the particles arrive. */
export const WARNING_SECONDS = 120;
/** Storm length (game hours) and dose rates while it lasts, mSv per hour. */
export const STORM_HOURS = 30;
export const STORM_OUTSIDE_MSV_H = 10;
export const STORM_SHELTER_MSV_H = 0.5;

function initial() {
  return {
    monitorRead: false,
    scans: [] as SurveyId[],
    /** 0..1 height of each regolith berm section. */
    berms: { west: 0, east: 0, south: 0 } as Record<BermId, number>,
    piling: null as BermId | null,
    /** 'quiet' → 'warning' (countdown) → 'storm' (particles arriving) → 'clear'. */
    weather: 'quiet' as 'quiet' | 'warning' | 'storm' | 'clear',
    countdown: WARNING_SECONDS,
    sheltered: false,
    /** Storm progress 0..1 while sheltered. */
    storm: 0,
    /** Dose the player picked up during the storm before getting inside. */
    lateDose: 0,
  };
}

export const rad = signal(initial());

export type RadEvent = 'scanned' | 'berm' | 'bermsDone' | 'arrived' | 'stormOver';
let listener: (e: RadEvent) => void = () => {};
export function onRadEvent(l: (e: RadEvent) => void) {
  listener = l;
}

type State = ReturnType<typeof initial>;
const patch = (p: Partial<State>) => (rad.value = { ...rad.value, ...p });

export function resetRadiation() {
  rad.value = initial();
}

/** The state Mission 6 leaves behind: HAB-2 buried under regolith, storm over. */
export function radiationDone() {
  rad.value = { ...initial(), monitorRead: true, scans: ['hab1', 'hab2', 'gh'], berms: { west: 1, east: 1, south: 1 }, weather: 'clear', sheltered: true, storm: 1 };
}

export const markMonitorRead = () => patch({ monitorRead: true });

export function scan(id: SurveyId) {
  const r = rad.value;
  if (r.scans.includes(id)) return false;
  sfx('scan');
  patch({ scans: [...r.scans, id] });
  listener('scanned');
  return true;
}

export function startPiling(id: BermId) {
  const r = rad.value;
  if (r.piling || r.berms[id] > 0) return;
  sfx('servo');
  patch({ piling: id });
}

export const bermsDone = (r = rad.value) => BERMS.every((b) => r.berms[b] >= 1);

export function startWarning() {
  sfx('alarm');
  patch({ weather: 'warning', countdown: WARNING_SECONDS });
}

export function enterShelter() {
  beep('ok');
  sfx('airlock');
  // If you get inside before the protons arrive, the storm starts while you wait.
  patch({ sheltered: true, storm: 0, weather: rad.value.weather === 'warning' ? 'storm' : rad.value.weather });
}

/** realDt: machines and the warning countdown; gameSeconds: the storm itself. */
export function simulateRadiation(realDt: number, gameSeconds: number) {
  const r = rad.value;
  const p: Partial<State> = {};
  const events: RadEvent[] = [];
  if (r.piling) {
    const h = Math.min(1, r.berms[r.piling] + realDt / BERM_SECONDS);
    p.berms = { ...r.berms, [r.piling]: h };
    if (h >= 1) {
      p.piling = null;
      events.push('berm');
      if (bermsDone({ ...r, ...p })) events.push('bermsDone');
    }
  }
  if (r.weather === 'warning') {
    p.countdown = Math.max(0, r.countdown - realDt);
    if (p.countdown === 0) {
      p.weather = 'storm';
      events.push('arrived');
    }
  }
  if (r.weather === 'storm' && !r.sheltered) p.lateDose = r.lateDose + (STORM_OUTSIDE_MSV_H * realDt * 30) / 3600;
  if (r.sheltered && r.storm < 1 && (r.weather === 'storm' || r.weather === 'warning')) {
    p.storm = Math.min(1, r.storm + gameSeconds / (STORM_HOURS * 3600));
    if (p.storm >= 1) {
      p.weather = 'clear';
      events.push('stormOver');
    }
  }
  if (Object.keys(p).length) rad.value = { ...r, ...p };
  for (const e of events) listener(e);
}
