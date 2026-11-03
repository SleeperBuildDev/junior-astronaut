import { settings } from '../engine/settings';
import { en } from './en';
import { my } from './my';

export type Lang = 'en' | 'my';
const DICTS: Record<Lang, Record<string, string>> = { en, my };

/**
 * Translates a key for the current language, filling {placeholders} from vars.
 * Unknown keys fall back to English, then to the key itself.
 * Reading settings.value here makes Preact components re-render on a language change.
 */
export function t(key: string, vars?: Record<string, string | number>) {
  const lang = settings.value.lang;
  let s = DICTS[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

const MY_DIGITS = '၀၁၂၃၄၅၆၇၈၉';
/** Mission numbers etc. in Myanmar digits when the UI is Burmese. */
export function num(n: number | string) {
  return settings.value.lang === 'my' ? String(n).replace(/\d/g, (d) => MY_DIGITS[+d]) : String(n);
}
