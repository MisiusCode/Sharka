import type { Priority, Status } from './types.js';

// Žinutės gyvena `core`, nes jų reikia visiems sluoksniams: lentai, tray
// meniu, CSV eksportui ir žadintuvui. Modulis PRIVALO likti be Node builtinų —
// jį importuoja naršyklės paketas (žr. CLAUDE.md taisyklę apie `core` modulius,
// kuriuos naudoja `ui`).

export type Locale = 'lt' | 'en';
export type LocaleSetting = Locale | 'system';

export const LOCALES: Locale[] = ['lt', 'en'];

const LT = {
  'bucket.today': 'Šiandien',
  'bucket.tomorrow': 'Rytoj',
  'bucket.week': 'Per savaitę',
  'bucket.later': 'Vėliau',

  'done.today': 'Šiandien',
  'done.yesterday': 'Vakar',
  'done.week': 'Šią savaitę',
  'done.earlier': 'Anksčiau',

  'status.todo': 'Reikia padaryti',
  'status.doing': 'Vykdoma',
  'status.done': 'Atlikta',

  'priority.1': 'Aukštas',
  'priority.2': 'Vidutinis',
  'priority.3': 'Žemas',

  'repeat.weekday': 'kas {day}',
  'repeat.monthday': 'kas {day} dieną',

  'csv.title': 'Pavadinimas',
  'csv.status': 'Būsena',
  'csv.priority': 'Prioritetas',
  'csv.due': 'Terminas',
  'csv.reminder': 'Priminimas',
  'csv.created': 'Sukurta',
  'csv.completed': 'Atlikta',
  'csv.repeat': 'Kartojimas',
} as const;

// Raktų aibė imama iš lietuviškos lentelės, tad TypeScript neleis angliškoje
// pamiršti rakto ar pridėti nesamo. Tai pigiau nei bet koks vykdymo meto
// tikrinimas — klaida matoma dar prieš paleidžiant testus.
export type MessageKey = keyof typeof LT;

const EN: Record<MessageKey, string> = {
  'bucket.today': 'Today',
  'bucket.tomorrow': 'Tomorrow',
  // Ne „This week": kolona apima šiandien+2…šiandien+7, tai slenkanti
  // savaitė, ne kalendorinė (spec, 6 skyrius pirminėje specifikacijoje).
  // Ne „Within a week" (skambėjo kaip įpareigojimas šalia „Today" / „Tomorrow" /
  // „Later") — „Next 7 days" tiksliai atitinka slenkantį langą ir simetriškai
  // pritampa prie „Last 7 days" žemiau (`done.week`).
  'bucket.week': 'Next 7 days',
  'bucket.later': 'Later',

  'done.today': 'Today',
  'done.yesterday': 'Yesterday',
  // Ne „This week": bucket'as skaičiuoja atgal septynias dienas nuo šiandien
  // (žr. `completedBucketOf`), tad prieš šešias dienas atlikta užduotis
  // dažniausiai yra PRAĖJUSIOS, ne šios kalendorinės savaitės.
  'done.week': 'Last 7 days',
  'done.earlier': 'Earlier',

  'status.todo': 'To do',
  'status.doing': 'In progress',
  'status.done': 'Done',

  'priority.1': 'High',
  'priority.2': 'Medium',
  'priority.3': 'Low',

  'repeat.weekday': 'every {day}',
  // Be kelintinių skaitvardžių: „15th" reikalautų galūnių lentelės, o
  // vienintelė nauda būtų grožis. Forma „monthly on day {day}", ne „on day
  // {day} of each month" — kad šalia „every {day}" (tas pats šaltinis, ↻
  // paaiškinimas ir CSV „Repeat" stulpelis) abu prasidėtų būdvardžiu/dažnumu,
  // ne prielinksniu.
  'repeat.monthday': 'monthly on day {day}',

  'csv.title': 'Title',
  'csv.status': 'Status',
  'csv.priority': 'Priority',
  // Ne vien „Due": stulpelis laiko datą, o plikas „Due" skaitosi kaip
  // vėliava/žymė, ne kaip stulpelio antraštė.
  'csv.due': 'Due date',
  'csv.reminder': 'Reminder',
  'csv.created': 'Created',
  'csv.completed': 'Completed',
  'csv.repeat': 'Repeat',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { lt: LT, en: EN };

export function t(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const sablonas = MESSAGES[locale][key];
  if (params === undefined) return sablonas;
  return sablonas.replace(/\{(\w+)\}/g, (visas, vardas: string) =>
    Object.prototype.hasOwnProperty.call(params, vardas) ? String(params[vardas]) : visas);
}

const STATUS_KEYS: Record<Status, MessageKey> = {
  todo: 'status.todo',
  doing: 'status.doing',
  done: 'status.done',
};

const PRIORITY_KEYS: Record<Priority, MessageKey> = {
  1: 'priority.1',
  2: 'priority.2',
  3: 'priority.3',
};

export function statusLabel(locale: Locale, status: Status): string {
  return t(locale, STATUS_KEYS[status]);
}

export function priorityLabel(locale: Locale, priority: Priority): string {
  return t(locale, PRIORITY_KEYS[priority]);
}

// Sistemos kalba ateina iš išorės (`navigator.language` naršyklėje,
// `app.getLocale()` Electron'e), nes `core` nežino, kur yra paleistas.
export function resolveLocale(setting: LocaleSetting, systemLocale: string | undefined): Locale {
  if (setting !== 'system') return setting;
  if (systemLocale === undefined) return 'en';
  const zyme = systemLocale.toLowerCase();
  return zyme === 'lt' || zyme.startsWith('lt-') ? 'lt' : 'en';
}
