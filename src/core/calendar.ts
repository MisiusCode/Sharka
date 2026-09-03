import type { Locale } from './i18n.js';
import { formatLocalDate } from './datetime.js';

// Mėnesių pavadinimai vardininko linksniu — kalendoriaus antraštei („2026
// rugsėjis" / „September 2026"). Datai su dienos numeriu vartojamas
// kilmininkas, ir jis gyvena `datetime.ts` (`formatDate`): „rugsėjo 14", ne
// „rugsėjis 14" — angliškai tokio skirtumo nėra, tad ten lentelės sutampa.
export const MONTHS_NOMINATIVE: Record<Locale, string[]> = {
  lt: [
    'sausis', 'vasaris', 'kovas', 'balandis', 'gegužė', 'birželis',
    'liepa', 'rugpjūtis', 'rugsėjis', 'spalis', 'lapkritis', 'gruodis',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

// Abi savaitės prasideda pirmadieniu — angliškai tai ne visur įprasta, bet
// `monthGrid` poslinkis yra pirmadieninis ir padengtas testais, o kalbai
// priklausoma savaitės pradžia įvestų tylų vienos dienos poslinkį (spec §5.4).
export const WEEKDAYS_SHORT: Record<Locale, string[]> = {
  lt: ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

// LAIKINI lietuviški apvalkalai — 2b dalis juos ištrina.
export const LITHUANIAN_MONTHS_NOMINATIVE = MONTHS_NOMINATIVE.lt;
export const LITHUANIAN_WEEKDAYS_SHORT = WEEKDAYS_SHORT.lt;

export interface CalendarDay {
  date: string;
  inMonth: boolean;
}

// Tikrina, ar eilutė yra reali data formatu `YYYY-MM-DD`. Vien reguliariojo
// reiškinio nepakanka: `2026-02-31` jį atitinka, bet tokios dienos nėra, o
// `new Date(2026, 1, 31)` tyliai persiverstų į kovo 3-ią.
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Visada 42 langeliai (6 savaitės), net kai mėnesiui užtenka 5 — antraip
// kalendorius keistų aukštį verčiant mėnesius, ir mygtukai šokinėtų po pirštu.
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month - 1, 1);
  // `getDay()` grąžina 0 sekmadieniui; lietuviškoje savaitėje pirmadienis yra 0.
  const offset = (first.getDay() + 6) % 7;

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(year, month - 1, 1 - offset + i);
    days.push({ date: formatLocalDate(d), inMonth: d.getMonth() === month - 1 });
  }
  return days;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthTitleIn(locale: Locale, year: number, month: number): string {
  const menuo = MONTHS_NOMINATIVE[locale][month - 1];
  // Tvarka skiriasi, ne tik pavadinimas: „2026 rugsėjis" prieš „September 2026".
  return locale === 'lt' ? `${year} ${menuo}` : `${menuo} ${year}`;
}

// LAIKINAS lietuviškas apvalkalas — 2b dalis jį ištrina.
export function monthTitle(year: number, month: number): string {
  return monthTitleIn('lt', year, month);
}
