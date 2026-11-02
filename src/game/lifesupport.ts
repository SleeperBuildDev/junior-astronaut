import { signal } from '@preact/signals';
import { beep } from '../audio/audio';

// A simplified Environmental Control and Life Support System (ECLSS), modelled on the
// ISS: an oxygen generator splits water by electrolysis, a water recovery system
// cleans used water so it can be used again, and a scrubber removes exhaled CO2.

export type SysState = 'offline' | 'starting' | 'online' | 'damaged';

export const O2_STEPS = [
  { label: 'Power on the electrolysis stack', why: 'Electrolysis uses electricity to split water (H₂O) into hydrogen and oxygen.' },
  { label: 'Open the water feed valve', why: 'The generator needs a steady supply of clean water to split.' },
  { label: 'Start oxygen production', why: 'Oxygen flows into the habitat. The hydrogen is vented or kept to make more water later.' },
];

export const life = signal({
  o2gen: 'offline' as SysState,
  water: 'damaged' as SysState,
  co2: 'online' as SysState,
  o2Step: 0,
  filterOk: false,
  /** Oxygen in the habitat air, % by volume. Earth's air is about 20.9%. */
  habO2: 15.2,
  /** Stored water, litres. */
  waterL: 46,
});

export const terminalOpen = signal(false);

export const SAFE_O2 = 20.9;

type Listener = (event: 'o2-online' | 'water-online' | 'filter') => void;
let listener: Listener = () => {};
export function onLifeEvent(l: Listener) {
  listener = l;
}

export function resetLife() {
  life.value = { o2gen: 'offline', water: 'damaged', co2: 'online', o2Step: 0, filterOk: false, habO2: 15.2, waterL: 46 };
}

export function o2Step(i: number) {
  const l = life.value;
  if (l.o2gen === 'online' || i !== l.o2Step) {
    beep('warn');
    return;
  }
  const next = l.o2Step + 1;
  beep(next === O2_STEPS.length ? 'ok' : 'select');
  life.value = { ...l, o2Step: next, o2gen: next === O2_STEPS.length ? 'online' : 'starting' };
  if (next === O2_STEPS.length) listener('o2-online');
}

export function replaceFilter() {
  life.value = { ...life.value, filterOk: true, water: 'offline' };
  listener('filter');
}

export function startWater() {
  const l = life.value;
  if (!l.filterOk || l.water === 'online') {
    beep('warn');
    return;
  }
  beep('ok');
  life.value = { ...l, water: 'online' };
  listener('water-online');
}

/** Advances the habitat air and water loop. Rates are sped up for gameplay. */
export function simulateLife(dt: number) {
  const l = { ...life.value };
  if (l.o2gen === 'online') {
    // Each kilogram of water split gives about 0.89 kg of oxygen.
    l.habO2 = Math.min(SAFE_O2, l.habO2 + (l.water === 'online' ? 0.42 : 0.12) * dt);
    l.waterL = Math.max(0, l.waterL - 0.15 * dt);
  } else {
    l.habO2 = Math.max(12, l.habO2 - 0.002 * dt);
  }
  // Recovery returns most of the water to the tank (the ISS reaches about 98%).
  if (l.water === 'online') l.waterL = Math.min(120, l.waterL + 0.6 * dt);
  life.value = l;
}
