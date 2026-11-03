import { signal } from '@preact/signals';
import { beep, sfx } from '../audio/audio';

// Mission 7 field science: at each site, scan it, answer a field-notes question about
// what you observe, then collect a sample. Samples go to the lab for analysis.

export type SiteState = 'new' | 'noted' | 'sampled';
/** Which answer is right for each site's field-notes question (options are 0..2). */
export const CORRECT = [0, 1, 2];
export const SITE_NAMES = ['a', 'b', 'c'] as const;

function initial() {
  return {
    sites: ['new', 'new', 'new'] as SiteState[],
    /** The site whose field notes are open. */
    notes: 0,
    /** The last wrong answer picked at the open site (to show a hint), or null. */
    wrong: null as number | null,
    delivered: false,
    analyzed: false,
  };
}

export const science = signal(initial());

export type SciEvent = 'noted' | 'sampled' | 'analyzed';
let listener: (e: SciEvent, site: number) => void = () => {};
export function onSciEvent(l: (e: SciEvent, site: number) => void) {
  listener = l;
}

export function resetScience() {
  science.value = initial();
}

export const samples = (s = science.value) => s.sites.filter((x) => x === 'sampled').length;

export function openNotes(site: number) {
  sfx('scan');
  science.value = { ...science.value, notes: site, wrong: null };
}

export function answer(site: number, option: number) {
  const s = science.value;
  if (s.sites[site] !== 'new') return;
  if (option !== CORRECT[site]) {
    beep('warn');
    science.value = { ...s, wrong: option };
    return;
  }
  beep('ok');
  const sites = s.sites.map((x, i) => (i === site ? 'noted' : x)) as SiteState[];
  science.value = { ...s, sites, wrong: null };
  listener('noted', site);
}

export function collect(site: number) {
  const s = science.value;
  if (s.sites[site] !== 'noted') return;
  sfx('clunk');
  const sites = s.sites.map((x, i) => (i === site ? 'sampled' : x)) as SiteState[];
  science.value = { ...s, sites };
  listener('sampled', site);
}

export function deliver() {
  science.value = { ...science.value, delivered: true };
  sfx('airlock');
}

export function analyze() {
  const s = science.value;
  if (!s.delivered || s.analyzed) return;
  beep('ok');
  sfx('powerup');
  science.value = { ...s, analyzed: true };
  listener('analyzed', -1);
}
