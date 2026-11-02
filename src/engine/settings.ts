import { effect, signal } from '@preact/signals';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  fov: number;
  quality: Quality;
  volume: number;
  arrowLook: boolean;
  lang: 'en' | 'my';
}

const DEFAULTS: Settings = { sensitivity: 1, invertY: false, fov: 75, quality: 'medium', volume: 0.8, arrowLook: true, lang: 'en' };
const KEY = 'junior-astronaut.settings';

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = signal<Settings>(load());

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    // Private windows can block storage; settings then last for this visit only.
  }
});

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
}
