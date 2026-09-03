import { addDays } from './datetime.js';
import { t, type Locale } from './i18n.js';

const WEEKDAY_NAMES: Record<Locale, string[]> = {
  // Galininkas: „kas pirmadienį", ne „kas pirmadienis".
  lt: ['pirmadienį', 'antradienį', 'trečiadienį', 'ketvirtadienį',
    'penktadienį', 'šeštadienį', 'sekmadienį'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
    'Friday', 'Saturday', 'Sunday'],
};

// Griežtai kanoninė forma be pirmaujančio nulio (9 radinys): `<select>`
// sąraše yra tik `w:1`..`w:7` ir `m:1`, `m:5`, ..., `m:31` — jokio `w:01` ar
// `m:07`. Tokia reikšmė iš API (praeitų senesniu \d{1,2} šablonu) paliktų
// `<select>` be pasirinkimo, kai kortelė vis tiek rodo ↻.
const REPEAT_RE = /^([wm]):([1-9]|[12]\d|3[01])$/;

const pad = (n: number): string => String(n).padStart(2, '0');

export function isValidRepeat(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = REPEAT_RE.exec(value);
  if (match === null) return false;
  const n = Number(match[2]);
  return match[1] === 'w' ? n >= 1 && n <= 7 : n >= 1 && n <= 31;
}

export function repeatLabel(locale: Locale, repeat: string): string {
  const [kind, raw] = repeat.split(':');
  const n = Number(raw);
  return kind === 'w'
    ? t(locale, 'repeat.weekday', { day: WEEKDAY_NAMES[locale][n - 1] })
    : t(locale, 'repeat.monthday', { day: n });
}

/** ISO savaitės diena: pirmadienis = 1, sekmadienis = 7. */
function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

/** Paskutinė mėnesio diena; `month` — 1..12. */
function clampToMonth(year: number, month: number, day: number): string {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
}

export function nextOccurrence(repeat: string, fromDate: string): string {
  const [kind, raw] = repeat.split(':');
  const n = Number(raw);

  if (kind === 'w') {
    // `|| 7` paverčia nulį septyniomis: jei šiandien jau ta diena, kitas
    // kartas yra po savaitės, ne šiandien — ką tik ją atlikai.
    const delta = ((n - isoWeekday(fromDate) + 7) % 7) || 7;
    return addDays(fromDate, delta);
  }

  const [y, m] = fromDate.split('-').map(Number);
  const thisMonth = clampToMonth(y, m, n);
  if (thisMonth > fromDate) return thisMonth;
  return clampToMonth(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, n);
}
