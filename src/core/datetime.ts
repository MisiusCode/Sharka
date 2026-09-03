import type { Locale } from './i18n.js';

const pad = (n: number): string => String(n).padStart(2, '0');

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatLocalDateTime(d: Date): string {
  return `${formatLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return formatLocalDate(new Date(y, m - 1, d + n));
}

export function dateOf(dueAt: string): string {
  return dueAt.slice(0, 10);
}

export function timeOf(dueAt: string): string | null {
  return dueAt.length > 10 ? dueAt.slice(11, 16) : null;
}

// Mėnesių pavadinimai kilmininko linksniu (naudojama su dienos numeriu, pvz.
// „rugpjūčio 20“) — būtent taip lietuviškai skaitomos datos, ne vardininku.
const LITHUANIAN_MONTHS_GENITIVE = [
  'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
];

// Lietuviškai data skaitoma kilmininku („rugsėjo 14"), angliškai — vardininku
// („September 14"), tad tai atskira lentelė, ne `calendar.ts` kopija.
const MONTHS_FOR_DATE: Record<Locale, string[]> = {
  lt: LITHUANIAN_MONTHS_GENITIVE,
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

// Formatuoja datą abiem kalbomis. Metai rodomi tik tada, kai data ne tų
// pačių metų kaip `today` — tai atitinka natūralią kalbėseną („rugpjūčio 20“ /
// „August 20“ šiais metais, bet „2027 m. sausio 5“ / „January 5, 2027“
// kitais — tvarka skiriasi: lietuviškai metai eina pirma su žyme „m.“,
// angliškai — paskui po kablelio). Sąmoningai neremiamasi `Intl`/
// `toLocaleDateString`: šis failas turi likti importuojamas naršyklės
// pakete tapačiai Electron, planšetės naršyklėje ir jsdom testuose,
// nepriklausomai nuo priimančiosios sistemos lokalės.
export function formatDate(locale: Locale, dateStr: string, today: string): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  const time = timeOf(dateStr);
  const todayYear = Number(today.slice(0, 4));

  const monthName = MONTHS_FOR_DATE[locale][month - 1];
  const sameYear = year === todayYear;
  const datePart = locale === 'lt'
    ? (sameYear ? `${monthName} ${day}` : `${year} m. ${monthName} ${day}`)
    : (sameYear ? `${monthName} ${day}` : `${monthName} ${day}, ${year}`);
  return time === null ? datePart : `${datePart}, ${time}`;
}

// LAIKINAS lietuviškas apvalkalas — 2b dalis jį ištrina.
export function formatLithuanianDate(dateStr: string, today: string): string {
  return formatDate('lt', dateStr, today);
}
