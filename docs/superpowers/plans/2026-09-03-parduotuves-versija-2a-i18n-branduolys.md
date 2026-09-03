# Parduotuvės versija, 2a dalis: kalbų branduolys — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `core` sluoksnis pradeda kalbėti dviem kalbomis — žinučių lentelė, kalbos nustatymas ir visos etiketės (kolonos, būsenos, prioritetai, datos, kartojimas, CSV) turi lietuvišką ir anglišką variantą.

**Architecture:** Vienas `core/i18n.ts` su dviem žinučių lentelėmis ir `t(locale, key, params?)`. Raktų aibė imama iš lietuviškos lentelės, tad TypeScript pats neleidžia angliškoje pamiršti rakto. Kiekviena esama etikečių konstanta ar funkcija gauna kalbą priimantį atitikmenį, o senasis pavadinimas lieka plonu lietuvišku apvalkalu — todėl visi 430 testų ir visa sąsaja veikia nepakeisti. Apvalkalus ištrina 2b dalis, kai sąsaja pradės perduoti tikrą kalbą.

**Tech Stack:** TypeScript (ESM), better-sqlite3, Vitest + jsdom, React 19 (šioje dalyje beveik neliečiamas), Electron 43.

**Spec:** `docs/superpowers/specs/2026-09-01-parduotuves-versija-design.md` — 5 skyrius yra šios dalies autoritetas.

## Global Constraints

- **Komentarai ir commit'ai lietuviškai.** Verčiami tik naudotojui matomi tekstai, ne kodo komentarai.
- **`core/i18n.ts` PRIVALO likti be Node builtinų** — jį importuos `src/ui/`. Tas pats galioja visiems `core` moduliams, kuriuos naudoja `ui` (`buckets`, `completed`, `datetime`, `calendar`, `repeat`, `types`, `settings`).
- **ESM:** reliatyvūs importai su `.js` galūne net iš `.ts` failų.
- **Nė vienas esamas testas nekeičiamas.** Jei kuris nors lūžta, lūžo elgsena — taisyk kodą, ne testą. Bazė: 430 vienetinių, 18 e2e, `npm run typecheck` švarus.
- **Sąsaja šioje dalyje lieka lietuviška.** Naujos funkcijos priima kalbą, seni pavadinimai lieka lietuviški apvalkalai. Perjungimas sąsajoje — 2b dalis.
- **Savaitė abiejose kalbose prasideda pirmadieniu** (spec §5.4). `monthGrid` poslinkis nekeičiamas.
- **Kalbos nustatymas kartoja `theme` formą:** `lt | en | system`, numatytoji `system`. Schemos migracijos nereikia — `settings` lentelė yra raktas–reikšmė.
- **Nauji eksportai gauna kalbą PIRMU argumentu** (`t(locale, ...)`, `bucketLabel(locale, ...)`), kad kvietimai atrodytų vienodai visame projekte.
- TDD: krentantis testas pirma, tada minimalus kodas.

---

### Task 1: `core/i18n.ts` — žinučių lentelė ir `t()`

**Files:**
- Create: `src/core/i18n.ts`
- Test: `tests/core/i18n.test.ts`

**Interfaces:**
- Consumes: `Status`, `Priority` iš `core/types.ts` (tik tipai).
- Produces: `Locale = 'lt' | 'en'`, `LocaleSetting = Locale | 'system'`, `LOCALES`, `MessageKey`, `MESSAGES`, `t(locale, key, params?)`, `statusLabel(locale, status)`, `priorityLabel(locale, priority)`. Naudos 2–6 užduotys ir visa 2b dalis.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LOCALES, MESSAGES, priorityLabel, statusLabel, t } from '../../src/core/i18n.js';

describe('žinučių lentelės', () => {
  // TypeScript raktų sutapimą užtikrina jau kompiliuojant (angliška lentelė
  // aprašyta kaip `Record<MessageKey, string>`), bet testas lieka: jis pagauna
  // atvejį, kai tipas kada nors būtų praplėstas iki `string`.
  it('abiejų kalbų raktų aibės sutampa', () => {
    const lt = Object.keys(MESSAGES.lt).sort();
    const en = Object.keys(MESSAGES.en).sort();
    expect(en).toEqual(lt);
  });

  it('nė viena reikšmė nėra tuščia', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value, `${locale}/${key}`).not.toBe('');
      }
    }
  });
});

describe('t', () => {
  it('grąžina reikšmę pagal kalbą', () => {
    expect(t('lt', 'bucket.today')).toBe('Šiandien');
    expect(t('en', 'bucket.today')).toBe('Today');
  });

  it('įstato parametrus', () => {
    expect(t('lt', 'repeat.monthday', { day: 15 })).toBe('kas 15 dieną');
    expect(t('en', 'repeat.monthday', { day: 15 })).toBe('on day 15 of each month');
  });

  // Neatpažintas vietaženklis paliekamas kaip yra, o ne verčiamas į
  // „undefined": tekste likęs `{day}` iš karto matomas kaip klaida, o
  // „undefined" atrodo kaip tikras žodis.
  it('nepaduotą parametrą palieka nepakeistą', () => {
    expect(t('lt', 'repeat.monthday', {})).toBe('kas {day} dieną');
  });
});

describe('statusLabel ir priorityLabel', () => {
  it('grąžina abiejų kalbų pavadinimus', () => {
    expect(statusLabel('lt', 'todo')).toBe('Reikia padaryti');
    expect(statusLabel('en', 'todo')).toBe('To do');
    expect(priorityLabel('lt', 1)).toBe('Aukštas');
    expect(priorityLabel('en', 3)).toBe('Low');
  });
});
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/i18n.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/i18n.js"`.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/i18n.ts`:

```ts
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
  'bucket.week': 'Within a week',
  'bucket.later': 'Later',

  'done.today': 'Today',
  'done.yesterday': 'Yesterday',
  'done.week': 'This week',
  'done.earlier': 'Earlier',

  'status.todo': 'To do',
  'status.doing': 'In progress',
  'status.done': 'Done',

  'priority.1': 'High',
  'priority.2': 'Medium',
  'priority.3': 'Low',

  'repeat.weekday': 'every {day}',
  // Be kelintinių skaitvardžių: „15th" reikalautų galūnių lentelės, o
  // vienintelė nauda būtų grožis.
  'repeat.monthday': 'on day {day} of each month',
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
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npx vitest run tests/core/i18n.test.ts && npm run typecheck`
Expected: PASS, tipai švarūs.

- [ ] **Step 5: Commit**

```bash
git add src/core/i18n.ts tests/core/i18n.test.ts
git commit -m "core/i18n.ts: dvi žinučių lentelės ir t()"
```

---

### Task 2: Kalbos nustatymas ir `resolveLocale`

**Files:**
- Modify: `src/core/i18n.ts`, `src/core/settings.ts`
- Test: `tests/core/i18n.test.ts`, `tests/core/settings.test.ts` (papildomi)

**Interfaces:**
- Consumes: 1 užduoties `Locale`, `LocaleSetting`.
- Produces: `resolveLocale(setting: LocaleSetting, systemLocale: string | undefined): Locale`; `SettingsMap` papildomas `locale: LocaleSetting` (numatytoji `'system'`). Naudos 6 užduotis ir visa 2b dalis.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/i18n.test.ts` gale:

```ts
import { resolveLocale } from '../../src/core/i18n.js';

describe('resolveLocale', () => {
  it('aiškiai pasirinkta kalba nepriklauso nuo sistemos', () => {
    expect(resolveLocale('lt', 'en-US')).toBe('lt');
    expect(resolveLocale('en', 'lt-LT')).toBe('en');
  });

  it('„system" atpažįsta lietuvišką sistemą su bet kokia raidžių lytimi', () => {
    expect(resolveLocale('system', 'lt')).toBe('lt');
    expect(resolveLocale('system', 'lt-LT')).toBe('lt');
    expect(resolveLocale('system', 'LT-lt')).toBe('lt');
  });

  // Nežinoma sistema gauna anglų, ne lietuvių: programa keliauja į Store,
  // o lietuviška sąsaja teisinga tik lietuviškoje sistemoje.
  it('nežinoma ar nenurodyta sistemos kalba duoda anglų', () => {
    expect(resolveLocale('system', 'de-DE')).toBe('en');
    expect(resolveLocale('system', undefined)).toBe('en');
    expect(resolveLocale('system', '')).toBe('en');
  });

  // „lt" prefiksas tikrinamas su brūkšneliu, kad `ltz` (liuksemburgiečių)
  // netaptų lietuvių kalba.
  it('kitos kalbos, prasidedančios raidėmis lt, nelaikomos lietuvių', () => {
    expect(resolveLocale('system', 'ltg-LV')).toBe('en');
  });
});
```

`tests/core/settings.test.ts` gale:

```ts
  it('kalbos nustatymas numatytai yra system', () => {
    const store = createSettingsStore(db);
    expect(store.getAll().locale).toBe('system');
  });

  it('priimamos tik trys kalbos reikšmės', () => {
    const store = createSettingsStore(db);
    expect(store.patch({ locale: 'en' }).locale).toBe('en');
    expect(store.patch({ locale: 'lt' }).locale).toBe('lt');
    expect(() => store.patch({ locale: 'de' } as never)).toThrow(/kalb|locale/i);
  });
```

Jei failo `describe` bloke `db` neprieinamas, naudok tą patį pagalbinį `store`, kurį naudoja gretimi testai (žr. failo viršuje esantį `beforeEach`).

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/i18n.test.ts tests/core/settings.test.ts`
Expected: FAIL — `resolveLocale` neeksportuojamas, `locale` yra `undefined`.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/i18n.ts` gale:

```ts
// Sistemos kalba ateina iš išorės (`navigator.language` naršyklėje,
// `app.getLocale()` Electron'e), nes `core` nežino, kur yra paleistas.
export function resolveLocale(setting: LocaleSetting, systemLocale: string | undefined): Locale {
  if (setting !== 'system') return setting;
  if (systemLocale === undefined) return 'en';
  const zyme = systemLocale.toLowerCase();
  return zyme === 'lt' || zyme.startsWith('lt-') ? 'lt' : 'en';
}
```

`src/core/settings.ts`:

```ts
import type { LocaleSetting } from './i18n.js';
```

į `SettingsMap` — `locale: LocaleSetting;`
į `SETTING_DEFAULTS` — `locale: 'system',` su komentaru, kad tai `theme` atitikmuo;
į `VALIDATORS` — `locale: (v) => v === 'lt' || v === 'en' || v === 'system',`.

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npm test && npm run typecheck`
Expected: PASS. Jei kuris nors pilnas `SettingsMap` literalas testuose nebeatitinka tipo, pridėk jam `locale: 'system'` — tokių literalų yra `tests/ui/Board.test.tsx`, `tests/ui/SettingsView.test.tsx` ir `tests/ui/QuickAddScreen.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/core/i18n.ts src/core/settings.ts tests/
git commit -m "Kalbos nustatymas: locale ir resolveLocale"
```

---

### Task 3: Kolonų, būsenų ir prioritetų etiketės

**Files:**
- Modify: `src/core/buckets.ts`, `src/core/completed.ts`, `src/core/backup.ts`, `src/ui/components/Board.tsx`
- Test: `tests/core/buckets.test.ts`, `tests/core/completed.test.ts` (papildomi)

**Interfaces:**
- Consumes: 1 užduoties `t`, `Locale`, `MessageKey`, `statusLabel`, `priorityLabel`.
- Produces: `bucketLabel(locale, bucket)` (`core/buckets.ts`), `completedLabel(locale, bucket)` (`core/completed.ts`). `BUCKET_LABELS` ir `COMPLETED_LABELS` lieka, bet tampa lietuviškais vaizdais — 2b dalis juos ištrins.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/buckets.test.ts` gale:

```ts
  it('kolonų pavadinimai yra abiem kalbomis', () => {
    expect(bucketLabel('lt', 'week')).toBe('Per savaitę');
    expect(bucketLabel('en', 'week')).toBe('Within a week');
  });

  // Senasis eksportas privalo likti tapatus, kol jį naudoja sąsaja.
  it('BUCKET_LABELS sutampa su lietuviškais bucketLabel rezultatais', () => {
    for (const bucket of DATE_BUCKETS) {
      expect(BUCKET_LABELS[bucket]).toBe(bucketLabel('lt', bucket));
    }
  });
```

`tests/core/completed.test.ts` gale:

```ts
  it('„Padaryta" kolonų pavadinimai yra abiem kalbomis', () => {
    expect(completedLabel('lt', 'yesterday')).toBe('Vakar');
    expect(completedLabel('en', 'yesterday')).toBe('Yesterday');
  });

  it('COMPLETED_LABELS sutampa su lietuviškais completedLabel rezultatais', () => {
    for (const bucket of COMPLETED_BUCKETS) {
      expect(COMPLETED_LABELS[bucket]).toBe(completedLabel('lt', bucket));
    }
  });
```

Importus (`bucketLabel`, `completedLabel`) pridėk prie esamų tų failų importų.

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/buckets.test.ts tests/core/completed.test.ts`
Expected: FAIL — `bucketLabel` ir `completedLabel` neegzistuoja.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/buckets.ts` — vietoj tiesiogiai surašytų reikšmių:

```ts
import { t, type Locale, type MessageKey } from './i18n.js';

const BUCKET_KEYS: Record<DateBucket, MessageKey> = {
  today: 'bucket.today',
  tomorrow: 'bucket.tomorrow',
  week: 'bucket.week',
  later: 'bucket.later',
};

export function bucketLabel(locale: Locale, bucket: DateBucket): string {
  return t(locale, BUCKET_KEYS[bucket]);
}

// LAIKINA. Lietuviškas vaizdas, kad sąsaja ir jos testai veiktų nepakeisti,
// kol 2b dalis perduos tikrą kalbą. Reikšmės skaičiuojamos iš tos pačios
// lentelės, tad nutolti nuo `bucketLabel` jos negali. 2b dalis šitą ištrina.
export const BUCKET_LABELS: Record<DateBucket, string> = {
  today: bucketLabel('lt', 'today'),
  tomorrow: bucketLabel('lt', 'tomorrow'),
  week: bucketLabel('lt', 'week'),
  later: bucketLabel('lt', 'later'),
};
```

`src/core/completed.ts` — tas pats su `COMPLETED_KEYS` / `completedLabel` / `COMPLETED_LABELS` (raktai `done.today`, `done.yesterday`, `done.week`, `done.earlier`).

`src/core/backup.ts` — vietinius `STATUS_LABELS` ir `PRIORITY_LABELS` pakeisk `statusLabel('lt', …)` ir `priorityLabel('lt', …)` kvietimais iš `core/i18n.js` (kalba tampa parametru 6 užduotyje).

`src/ui/components/Board.tsx` — ištrink vietinį `STATUS_LABELS` objektą (jis dubliuoja `backup.ts` turėtąjį) ir imk pavadinimus per `statusLabel('lt', status)` iš `core/i18n.js`.

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npm test && npm run typecheck`
Expected: PASS — visi 430+ testų, įskaitant esamus, kurie tikrina lietuviškus pavadinimus.

- [ ] **Step 5: Commit**

```bash
git add src/core/ src/ui/components/Board.tsx tests/core/
git commit -m "Kolonų, būsenų ir prioritetų etiketės — per žinučių lentelę"
```

---

### Task 4: Datos abiem kalbomis

**Files:**
- Modify: `src/core/calendar.ts`, `src/core/datetime.ts`
- Test: `tests/core/calendar.test.ts`, `tests/core/datetime.test.ts` (papildomi)

**Interfaces:**
- Consumes: 1 užduoties `Locale`.
- Produces: `MONTHS_NOMINATIVE`, `WEEKDAYS_SHORT` (abu `Record<Locale, string[]>`), `monthTitleIn(locale, year, month)`, `formatDate(locale, dateStr, today)`. `LITHUANIAN_MONTHS_NOMINATIVE`, `LITHUANIAN_WEEKDAYS_SHORT`, `monthTitle(year, month)` ir `formatLithuanianDate(dateStr, today)` lieka lietuviškais apvalkalais.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/calendar.test.ts` gale:

```ts
  it('mėnesio antraštė kiekvienoje kalboje savo tvarka', () => {
    // Lietuviškai metai eina pirma, angliškai — po mėnesio.
    expect(monthTitleIn('lt', 2026, 9)).toBe('2026 rugsėjis');
    expect(monthTitleIn('en', 2026, 9)).toBe('September 2026');
  });

  it('savaitės dienos yra abiem kalbomis ir abi prasideda pirmadieniu', () => {
    expect(WEEKDAYS_SHORT.lt[0]).toBe('Pr');
    expect(WEEKDAYS_SHORT.en[0]).toBe('Mon');
    expect(WEEKDAYS_SHORT.lt).toHaveLength(7);
    expect(WEEKDAYS_SHORT.en).toHaveLength(7);
  });

  it('senieji lietuviški eksportai nepasikeitė', () => {
    expect(LITHUANIAN_WEEKDAYS_SHORT).toEqual(WEEKDAYS_SHORT.lt);
    expect(monthTitle(2026, 9)).toBe(monthTitleIn('lt', 2026, 9));
  });
```

`tests/core/datetime.test.ts` gale:

```ts
  it('data angliškai rašoma be kilmininko ir su kableliu prieš metus', () => {
    expect(formatDate('en', '2026-09-14', '2026-09-01')).toBe('September 14');
    expect(formatDate('en', '2027-01-05', '2026-09-01')).toBe('January 5, 2027');
  });

  it('laikas prikabinamas abiem kalbomis', () => {
    expect(formatDate('lt', '2026-09-14T18:00', '2026-09-01')).toBe('rugsėjo 14, 18:00');
    expect(formatDate('en', '2026-09-14T18:00', '2026-09-01')).toBe('September 14, 18:00');
  });

  it('senasis lietuviškas eksportas nepasikeitė', () => {
    expect(formatLithuanianDate('2026-09-14', '2026-09-01'))
      .toBe(formatDate('lt', '2026-09-14', '2026-09-01'));
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/calendar.test.ts tests/core/datetime.test.ts`
Expected: FAIL — `monthTitleIn`, `WEEKDAYS_SHORT`, `formatDate` neegzistuoja.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/calendar.ts`:

```ts
import type { Locale } from './i18n.js';

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

export function monthTitleIn(locale: Locale, year: number, month: number): string {
  const menuo = MONTHS_NOMINATIVE[locale][month - 1];
  // Tvarka skiriasi, ne tik pavadinimas: „2026 rugsėjis" prieš „September 2026".
  return locale === 'lt' ? `${year} ${menuo}` : `${menuo} ${year}`;
}

// LAIKINI lietuviški apvalkalai — 2b dalis juos ištrina.
export const LITHUANIAN_MONTHS_NOMINATIVE = MONTHS_NOMINATIVE.lt;
export const LITHUANIAN_WEEKDAYS_SHORT = WEEKDAYS_SHORT.lt;
export function monthTitle(year: number, month: number): string {
  return monthTitleIn('lt', year, month);
}
```

`src/core/datetime.ts` — angliški mėnesiai ir bendra funkcija:

```ts
import type { Locale } from './i18n.js';

// Lietuviškai data skaitoma kilmininku („rugsėjo 14"), angliškai — vardininku
// („September 14"), tad tai atskira lentelė, ne `calendar.ts` kopija.
const MONTHS_FOR_DATE: Record<Locale, string[]> = {
  lt: LITHUANIAN_MONTHS_GENITIVE,
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

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
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npm test && npm run typecheck`
Expected: PASS — įskaitant esamus datų testus, kurie tikrina lietuvišką išvestį.

- [ ] **Step 5: Commit**

```bash
git add src/core/calendar.ts src/core/datetime.ts tests/core/
git commit -m "Datos ir mėnesių pavadinimai abiem kalbomis"
```

---

### Task 5: Kartojimo pavadinimai

**Files:**
- Modify: `src/core/repeat.ts`, `src/core/backup.ts`, `src/ui/components/TaskCard.tsx`
- Test: `tests/core/repeat.test.ts` (papildomas)

**Interfaces:**
- Consumes: 1 užduoties `t`, `Locale`.
- Produces: `repeatLabel(locale, repeat)` — **signatūra keičiasi**, kalba tampa pirmu argumentu. Visi kvietėjai atnaujinami šioje pačioje užduotyje.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/repeat.test.ts` gale:

```ts
  it('kartojimo pavadinimas yra abiem kalbomis', () => {
    expect(repeatLabel('lt', 'w:1')).toBe('kas pirmadienį');
    expect(repeatLabel('en', 'w:1')).toBe('every Monday');
    expect(repeatLabel('lt', 'm:15')).toBe('kas 15 dieną');
    expect(repeatLabel('en', 'm:15')).toBe('on day 15 of each month');
  });

  it('sekmadienis yra septintas abiejose kalbose', () => {
    expect(repeatLabel('lt', 'w:7')).toBe('kas sekmadienį');
    expect(repeatLabel('en', 'w:7')).toBe('every Sunday');
  });
```

Esamus `repeatLabel('w:1')` pavidalo kvietimus tame pačiame testų faile atnaujink į `repeatLabel('lt', 'w:1')` — jų reikšmės nesikeičia.

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/repeat.test.ts`
Expected: FAIL — funkcija priima vieną argumentą.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/repeat.ts`:

```ts
import { t, type Locale } from './i18n.js';

const WEEKDAY_NAMES: Record<Locale, string[]> = {
  // Galininkas: „kas pirmadienį", ne „kas pirmadienis".
  lt: ['pirmadienį', 'antradienį', 'trečiadienį', 'ketvirtadienį',
    'penktadienį', 'šeštadienį', 'sekmadienį'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
    'Friday', 'Saturday', 'Sunday'],
};

export function repeatLabel(locale: Locale, repeat: string): string {
  const [kind, raw] = repeat.split(':');
  const n = Number(raw);
  return kind === 'w'
    ? t(locale, 'repeat.weekday', { day: WEEKDAY_NAMES[locale][n - 1] })
    : t(locale, 'repeat.monthday', { day: n });
}
```

Atnaujink abu kvietėjus: `src/core/backup.ts` (CSV eilutė) ir `src/ui/components/TaskCard.tsx` (`title` ir `aria-label`) — abiem paduok `'lt'`, kol 2b dalis perduos tikrą kalbą.

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/repeat.ts src/core/backup.ts src/ui/components/TaskCard.tsx tests/core/repeat.test.ts
git commit -m "Kartojimo pavadinimai abiem kalbomis"
```

---

### Task 6: CSV eksportas pagal kalbą

**Files:**
- Modify: `src/core/i18n.ts`, `src/core/backup.ts`, `src/desktop/main.ts`
- Test: `tests/core/backup.test.ts` (papildomas)

**Interfaces:**
- Consumes: 1, 2 ir 5 užduočių eksportus.
- Produces: `tasksToCsv(locale, tasks)` — **signatūra keičiasi**; `BackupSchedulerDeps` papildomas `systemLocale: string`.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/backup.test.ts` gale:

```ts
  it('CSV antraštė ir reikšmės rašomos pasirinkta kalba', () => {
    const csv = tasksToCsv('en', [uzduotis({ title: 'Milk', status: 'doing', priority: 1 })]);
    const [antraste, eilute] = csv.replace(BOM, '').trim().split('\r\n');
    expect(antraste).toBe('Title;Status;Priority;Due;Reminder;Created;Completed;Repeat');
    expect(eilute).toContain('In progress');
    expect(eilute).toContain('High');
  });

  it('lietuviška antraštė nepasikeitė', () => {
    const csv = tasksToCsv('lt', []);
    expect(csv).toContain('Pavadinimas;Būsena;Prioritetas;Terminas;Priminimas;Sukurta;Atlikta;Kartojimas');
  });

  // BOM ir kabliataškis egzistuoja dėl Excel, ne dėl kalbos.
  it('BOM ir skirtukas nepriklauso nuo kalbos', () => {
    expect(tasksToCsv('en', []).startsWith(BOM)).toBe(true);
    expect(tasksToCsv('en', []).includes(';')).toBe(true);
  });
```

`uzduotis(...)` — tame faile jau esantis pagalbinis kūrėjas; jei jo nėra, naudok tą patį būdą, kuriuo užduotis kuria gretimi testai.

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/backup.test.ts`
Expected: FAIL — `tasksToCsv` priima vieną argumentą.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/i18n.ts` — nauji raktai abiejose lentelėse:

```
  'csv.title': 'Pavadinimas' / 'Title'
  'csv.status': 'Būsena' / 'Status'
  'csv.priority': 'Prioritetas' / 'Priority'
  'csv.due': 'Terminas' / 'Due'
  'csv.reminder': 'Priminimas' / 'Reminder'
  'csv.created': 'Sukurta' / 'Created'
  'csv.completed': 'Atlikta' / 'Completed'
  'csv.repeat': 'Kartojimas' / 'Repeat'
```

`src/core/backup.ts`:

Importai failo viršuje: `import { priorityLabel, statusLabel, t, resolveLocale, type Locale, type MessageKey } from './i18n.js';`. Senieji `STATUS_LABELS`, `PRIORITY_LABELS` ir `HEADER` iš šio failo dingsta.

```ts
const CSV_KEYS: MessageKey[] = [
  'csv.title', 'csv.status', 'csv.priority', 'csv.due',
  'csv.reminder', 'csv.created', 'csv.completed', 'csv.repeat',
];

function header(locale: Locale): string {
  return CSV_KEYS.map((key) => t(locale, key)).join(';');
}

export function tasksToCsv(locale: Locale, tasks: Task[]): string {
  // DĖMESIO: `map` parametras NEGALI vadintis `t` — taip jis vadinosi iki šio
  // pakeitimo, bet dabar `t` yra vertimo funkcija, ir parametras ją uždengtų.
  const rows = tasks.map((uzd) =>
    [
      cell(uzd.title),
      cell(statusLabel(locale, uzd.status)),
      cell(priorityLabel(locale, uzd.priority)),
      cell(uzd.due_at),
      cell(uzd.remind_at),
      cell(uzd.created_at),
      cell(uzd.completed_at),
      cell(uzd.repeat !== null ? repeatLabel(locale, uzd.repeat) : null),
    ].join(';'),
  );

  // BOM — be jo Excel iš „Nunešti baterijas" padaro „NuneÅ¡ti".
  // CRLF — Excel to tikisi; LF vienas kai kuriose versijose sulipdo eilutes.
  return `${BOM}${[header(locale), ...rows].join('\r\n')}\r\n`;
}
```

`createBackupScheduler` gauna `systemLocale: string` į `BackupSchedulerDeps` ir rašydamas kopiją skaičiuoja kalbą:

```ts
      // Kopijų planuoklis sukasi `main.ts` procese, tad „system" čia reiškia
      // kompiuterio, o ne planšetės kalbą (spec §5.1).
      const locale = resolveLocale(deps.settings.getAll().locale, deps.systemLocale);
      writeBackup(/* … */ tasksToCsv(locale, deps.tasks.list()));
```

`src/desktop/main.ts` — `createBackupScheduler({ …, systemLocale: app.getLocale() })`.

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Paleisti viską, įskaitant e2e**

Run: `npx playwright test`
Expected: 18/18 — sąsaja šioje dalyje nepasikeitė.

- [ ] **Step 6: Commit**

```bash
git add src/core/ src/desktop/main.ts tests/core/backup.test.ts
git commit -m "CSV eksportas rašomas pasirinkta kalba"
```

---

## Kas lieka 2b daliai

- Sąsajos tekstai (`src/ui/` — apie 139 eilutės) ir tray meniu bei dialogai (`src/desktop/`).
- Klaidų vertimas kliente pagal `error.code`; serverio `message` tampa angliška atsargine reikšme (spec §5.3).
- 465 lietuviškų literalų testuose perkėlimas prie `data-testid`.
- Kalbos perjungiklis nustatymų lange.
- Visų šiame plane palikti „LAIKINI" lietuviški apvalkalai: `BUCKET_LABELS`, `COMPLETED_LABELS`, `LITHUANIAN_MONTHS_NOMINATIVE`, `LITHUANIAN_WEEKDAYS_SHORT`, `monthTitle`, `formatLithuanianDate`.
