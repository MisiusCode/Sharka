# Parduotuvės versija, 2b dalis: lenta kalba pasirinkta kalba — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lenta — kolonos, filtrai, greitas įvedimas ir kortelės — pradeda kalbėti ta kalba, kurią parodo nustatymas, o angliškas laikas rodomas ir įvedamas AM/PM pavidalu.

**Architecture:** Kalbą išsprendžia serveris (jis vienintelis gyvena tame pačiame procese, kur veikia tikras sistemos kalbos šaltinis) ir grąžina ją kaip `resolved_locale` kartu su nustatymais; sąsaja jos nebeskaičiuoja. Kiekvienas ekranas paima kalbą iš jau parsisiųstų nustatymų ir perduoda ją `core` etiketėms. Kiekvienas išverstas ekranas ištrina savo `LAIKINA` apvalkalą.

**Tech Stack:** TypeScript (ESM), Express 5, better-sqlite3, React 19, Vitest + jsdom, Playwright, Electron 43.

**Spec:** `docs/superpowers/specs/2026-09-01-parduotuves-versija-design.md` — 5 skyrius, ypač 5.6 poskyris (2a dalies peržiūros radiniai).

## Global Constraints

- **Kodo komentarai ir commit'ai lietuviškai.** Verčiami tik naudotojui matomi tekstai.
- **ESM:** reliatyvūs importai su `.js` galūne net iš `.ts`/`.tsx` failų.
- **`core` moduliai, kuriuos importuoja `ui`, negali turėti Node builtinų.** `core/i18n.ts` importuoja tik tipus.
- **Kalba imama iš `resolved_locale`, niekada iš `navigator.language`.** Electron lange `navigator.language` seka mūsų pačių `--lang` jungiklį (spec §5.6), tad naršyklės kalbos ten paklausti neįmanoma.
- **Laikas saugomas 24 val. formatu visada.** AM/PM yra tik rodymo ir įvedimo dalykas; `due_at`, `remind_at` ir bazė nesikeičia nė per raidę.
- **Lietuviškas rodinys neturi pasikeisti niekaip.** Kiekvienas lietuviškas tekstas lieka toks pat; jei koks nors testas dėl to nukrenta — pasikeitė elgsena, taisyk kodą.
- **Bazė:** 461 vienetinis, 18 e2e, `npm run typecheck` švarus. Visi privalo likti žali.
- **E2E aplinka PRIVALO aiškiai pasirinkti lietuvių kalbą — nuo 3 užduoties.** `npm run start:test` paleidžia serverį per `tsx`, be Electron, tad `startServer` negauna sistemos kalbos; `resolveLocale('system', undefined)` grąžina **anglų**. Vos tik sąsaja pradės paisyti kalbos, visi lietuviški e2e selektoriai nustos veikti. Todėl 3 užduotis prideda `locale: 'lt'` nustatymą e2e paruošime, ir tik po to verčia pirmą ekraną.
- TDD: krentantis testas pirma, tada minimalus kodas.
- Naujų priklausomybių nėra.

---

### Task 1: Kolonų `data-testid` atsiejamas nuo kalbos

**Files:**
- Modify: `src/ui/components/Column.tsx`
- Modify: `tests/e2e/board.spec.ts`, `tests/ui/Board.test.tsx`

**Interfaces:**
- Consumes: nieko.
- Produces: `data-testid="kolona-<id>"`, kur `<id>` yra stabilus raktas (`today`, `tomorrow`, `week`, `later`, `todo`, `doing`, `done`, `yesterday`, `earlier`). Visos vėlesnės užduotys remiasi šiais selektoriais.

Ši užduotis pirma neatsitiktinai: `Column.tsx:21` dabar lipdo testo identifikatorių iš IŠVERSTO pavadinimo (``kolona-${label}``), tad vos tik lenta prabils angliškai, visi 40 selektorių nustos veikti. Pats `id` (stabilus raktas) jau yra to komponento props'e.

- [ ] **Step 1: Pakeisti identifikatoriaus šaltinį**

`src/ui/components/Column.tsx:21`:

```tsx
      // Identifikatorius lipdomas iš STABILAUS rakto, ne iš matomo pavadinimo:
      // pavadinimas nuo šiol priklauso nuo kalbos, o testo selektorius negali.
      data-testid={`kolona-${id}`}
```

- [ ] **Step 2: Paleisti ir pamatyti, kiek testų nukrenta**

Run: `npm test`
Expected: FAIL — apie 27 nesėkmės `tests/ui/Board.test.tsx`, visos dėl nerasto `kolona-Šiandien` pavidalo selektoriaus. Tai ir yra sąrašas, kurį reikia perrašyti.

- [ ] **Step 3: Perrašyti selektorius abiejuose testų failuose**

Pakeitimų lentelė (kitų `getByTestId` argumentų faile nėra):

| Buvo | Tampa |
|---|---|
| `kolona-Šiandien` | `kolona-today` |
| `kolona-Rytoj` | `kolona-tomorrow` |
| `kolona-Per savaitę` | `kolona-week` |
| `kolona-Vėliau` | `kolona-later` |
| `kolona-Reikia padaryti` | `kolona-todo` |
| `kolona-Vykdoma` | `kolona-doing` |
| `kolona-Atlikta` | `kolona-done` |
| `kolona-Vakar` | `kolona-yesterday` |
| `kolona-Šią savaitę` | `kolona-week` |
| `kolona-Anksčiau` | `kolona-earlier` |

Dėmesio: `kolona-Šiandien` datų rodinyje ir „Padaryta" rodinyje virsta tuo pačiu `kolona-today`, o `Per savaitę`/`Šią savaitę` — tuo pačiu `kolona-week`. Taip ir turi būti: `id` abiem atvejais tas pats, o rodinius testai skiria kontekstu.

**Keisk TIK selektoriaus eilutę.** Jokio laukiamo teksto, jokio `getByText` argumento — jie tikrina matomą lietuvišką tekstą ir šioje užduotyje privalo likti nepaliesti.

- [ ] **Step 4: Paleisti viską**

Run: `npm test && npx playwright test && npm run typecheck`
Expected: 461/461, 18/18, tipai švarūs.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/Column.tsx tests/
git commit -m "Kolonų testų identifikatoriai atsiejami nuo kalbos"
```

---

### Task 2: Kalbą išsprendžia serveris

**Files:**
- Modify: `src/core/settings.ts`, `src/server/routes/settings.ts`, `src/server/app.ts`, `src/server/index.ts`, `src/desktop/main.ts`
- Create: `src/ui/useLocale.ts`
- Test: `tests/server/api.test.ts`, `tests/ui/useLocale.test.ts`

**Interfaces:**
- Consumes: `resolveLocale` iš `core/i18n.ts`.
- Produces: `PublicSettings` papildomas `resolved_locale: Locale`; `AppDeps` papildomas `systemLocale?: string`; `localeOf(settings: PublicSettings | null): Locale` iš `ui/useLocale.ts`. Naudos 3–7 užduotys.

Kodėl serveris, o ne naršyklė: Electron lange `navigator.language` seka mūsų pačių `--lang lt` jungiklį, tad ten sistemos kalbos paklausti neįmanoma (spec §5.6). Serveris sukasi tame pačiame procese, kur veikia `app.getPreferredSystemLanguages()`, tad jis vienintelis turi teisingą atsakymą — ir tas pats atsakymas keliauja į planšetę, kad abu įrenginiai rodytų tą pačią kalbą, kaip ir temą.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/server/api.test.ts` gale (faile jau yra `createApp` pagalbinė aplinka — naudok tą pačią):

```ts
  it('nustatymai grąžina išspręstą kalbą', async () => {
    const res = await request(app).get('/api/settings').expect(200);
    // Numatytoji `locale` yra `system`, o testinė aplinka sistemos kalbos
    // neperduoda, tad lieka anglų.
    expect(res.body.resolved_locale).toBe('en');
  });

  it('aiškiai pasirinkta kalba nugali sistemos kalbą', async () => {
    await request(app).patch('/api/settings').send({ locale: 'lt' }).expect(200);
    const res = await request(app).get('/api/settings').expect(200);
    expect(res.body.resolved_locale).toBe('lt');
  });
```

`tests/ui/useLocale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { localeOf } from '../../src/ui/useLocale.js';

describe('localeOf', () => {
  it('ima išspręstą kalbą iš nustatymų', () => {
    expect(localeOf({ resolved_locale: 'en' } as never)).toBe('en');
  });

  // Kol nustatymai dar neatkeliavo, rodom lietuvišką sąsają: tai kalba,
  // kuria programa kalbėjo iki šiol, tad blyksnis nepastebimas.
  it('be nustatymų grąžina lietuvių', () => {
    expect(localeOf(null)).toBe('lt');
  });
});
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/server/api.test.ts tests/ui/useLocale.test.ts`
Expected: FAIL — `resolved_locale` yra `undefined`, `useLocale.js` neegzistuoja.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/settings.ts` — viešo tipo papildymas:

```ts
export type PublicSettings = Omit<SettingsMap, 'pin_hash' | 'pin_salt'>
  & { has_pin: boolean; resolved_locale: Locale };
```

`src/server/routes/settings.ts` — `viesi()` gauna sistemos kalbą ir įskaičiuoja ją:

```ts
function viesi(all: SettingsMap, systemLocale: string | undefined): PublicSettings {
  const { pin_hash, pin_salt, ...likusi } = all;
  return {
    ...likusi,
    has_pin: hasPin(all),
    // Išsprendžiam čia, o ne kliente: Electron lange `navigator.language`
    // seka mūsų pačių `--lang` jungiklį (spec §5.6).
    resolved_locale: resolveLocale(all.locale, systemLocale),
  };
}
```

`settingsRouter(settings, systemLocale)` perduoda ją į abu atsakymus; `src/server/app.ts` paduoda `deps.systemLocale`; `AppDeps` gauna `systemLocale?: string`; `src/server/index.ts` `startServer(uiDir?, systemLocale?)` perduoda toliau; `src/desktop/main.ts` kviečia `startServer(join(app.getAppPath(), 'dist/ui'), app.getPreferredSystemLanguages()[0])`.

`src/ui/useLocale.ts`:

```ts
import type { Locale } from '../core/i18n.js';
import type { PublicSettings } from '../core/settings.js';

// Kalbos sąsaja neskaičiuoja — ją atsiunčia serveris. Ši funkcija tik parenka
// atsarginę reikšmę tam trumpam momentui, kol nustatymai dar kraunasi.
export function localeOf(settings: PublicSettings | null): Locale {
  return settings?.resolved_locale ?? 'lt';
}
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npm test && npm run typecheck`
Expected: PASS. Pilni `PublicSettings` literalai testuose gaus `resolved_locale: 'lt'` — tai leistinas mechaninis papildymas (tipas privertė), bet nė vienos laukiamos reikšmės keisti negalima.

- [ ] **Step 5: Commit**

```bash
git add src/core/settings.ts src/server/ src/desktop/main.ts src/ui/useLocale.ts tests/
git commit -m "Kalbą išsprendžia serveris ir grąžina kaip resolved_locale"
```

---

### Task 3: Filtrų juosta

**Files:**
- Modify: `src/core/i18n.ts`, `src/ui/components/FilterBar.tsx`, `src/ui/components/Board.tsx`
- Test: `tests/ui/FilterBar.test.tsx`

**Interfaces:**
- Consumes: 2 užduoties `localeOf`; `t`, `priorityLabel` iš `core/i18n.ts`.
- Produces: `FilterBarProps` papildomas `locale: Locale`.

`FilterBar.tsx:11-15` turi TREČIĄ prioritetų pavadinimų kopiją (spec §5.6). Ji dingsta — pavadinimai imami iš `priorityLabel`.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/FilterBar.test.tsx` gale (esamas `renderBar` pagalbinis papildomas `locale` parametru su numatytąja `'lt'`, kad seni testai liktų nepakeisti):

```tsx
  it('angliškai rodo išverstus grupavimo ir prioriteto pavadinimus', () => {
    renderBar({ locale: 'en' });
    expect(screen.getByRole('button', { name: 'Dates' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Progress' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'High' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Show completed' })).toBeDefined();
  });

  it('lietuviškai viskas lieka kaip buvo', () => {
    renderBar({ locale: 'lt' });
    expect(screen.getByRole('button', { name: 'Datos' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Rodyti atliktas' })).toBeDefined();
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/FilterBar.test.tsx`
Expected: FAIL — `locale` props nėra, angliškų pavadinimų nėra.

- [ ] **Step 3: Parašyti minimalų kodą**

Nauji raktai `src/core/i18n.ts` (abiejose lentelėse):

```
  'filter.date':      'Datos'            / 'Dates'
  'filter.status':    'Progresas'        / 'Progress'
  'filter.completed': 'Padaryta'         / 'Done'
  'filter.showDone':  'Rodyti atliktas'  / 'Show completed'
```

`FilterBar.tsx`: `PRIORITY_CHIPS` konstanta pašalinama; grupavimo pavadinimas imamas `t(locale, mode === 'date' ? 'filter.date' : mode === 'status' ? 'filter.status' : 'filter.completed')`; prioritetai — `([1,2,3] as Priority[]).map((p) => priorityLabel(locale, p))`; varnelė — `t(locale, 'filter.showDone')`. `Board.tsx` paduoda `locale={localeOf(settings)}`.

- [ ] **Step 4: Pririšti e2e aplinką prie lietuvių kalbos**

Tai NE atsarginis variantas, o būtinas žingsnis: e2e serveris pakeliamas per `tsx` be Electron, tad sistemos kalbos jis neturi ir `resolved_locale` yra `en`. Be šito visi lietuviški selektoriai nukristų.

`tests/e2e/board.spec.ts`: esamame `afterEach` greta `grouping: 'date'` pridėk `locale: 'lt'`, ir pridėk `beforeEach`, kuris tą patį nustato PRIEŠ kiekvieną testą (pirmasis testas kitaip pasileistų su numatytąja `system` reikšme):

```ts
test.beforeEach(async ({ request }) => {
  // E2E serveris sukasi be Electron, tad sistemos kalbos jis nežino ir
  // `system` išsisprendžia į anglų. Testai tikrina lietuvišką sąsają, tad
  // kalbą pasirenkam aiškiai.
  await request.patch('/api/settings', { data: { locale: 'lt' } });
});
```

Tai aplinkos paruošimas, ne laukiamos reikšmės keitimas — nė vienas `expect` neliečiamas.

- [ ] **Step 5: Paleisti**

Run: `npm test && npm run typecheck && npx playwright test`
Expected: 461+/461+, 18/18, tipai švarūs.

- [ ] **Step 6: Commit**

```bash
git add src/core/i18n.ts src/ui/components/FilterBar.tsx src/ui/components/Board.tsx tests/ui/FilterBar.test.tsx tests/e2e/
git commit -m "Filtrų juosta kalba pasirinkta kalba"
```

---

### Task 4: Lenta

**Files:**
- Modify: `src/core/i18n.ts`, `src/core/buckets.ts`, `src/core/completed.ts`, `src/ui/components/Board.tsx`
- Test: `tests/ui/Board.test.tsx`

**Interfaces:**
- Consumes: 2 užduoties `localeOf`; `bucketLabel`, `completedLabel`, `statusLabel`, `t`.
- Produces: `BUCKET_LABELS` ir `COMPLETED_LABELS` **ištrinami** — 2a dalies `LAIKINA` apvalkalai.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/Board.test.tsx` gale:

```tsx
  it('angliškai kolonų antraštės ir juostos išverstos', async () => {
    // `setup` pagalbinė jau grąžina nustatymus; papildom išspręsta kalba.
    setup({ resolved_locale: 'en' });
    render(<Board now={new Date('2026-09-14T10:00:00')} />);

    expect(await screen.findByText('Today')).toBeDefined();
    expect(screen.getByText('Within a week')).toBeDefined();
  });
```

Failo `setup` pagalbinė funkcija dabar perrašymų nepriima — pirma pridėk jai `over: Partial<PublicSettings> = {}` parametrą ir įliek jį į grąžinamus nustatymus. Tai pagalbinės funkcijos praplėtimas, ne testo susilpninimas: nė vienas esamas `expect` nesikeičia.

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/Board.test.tsx`
Expected: FAIL — antraštės vis dar lietuviškos.

- [ ] **Step 3: Parašyti minimalų kodą**

Nauji raktai (abiejose lentelėse):

```
  'board.loading':      'Kraunama…'                          / 'Loading…'
  'board.offline':      'Nėra ryšio su serveriu'             / 'No connection to the server'
  'board.from':         'Nuo'                                / 'From'
  'board.to':           'Iki'                                / 'To'
  'board.review':       'Peržiūrėti'                         / 'Show'
  'board.rangeInvalid': 'Pradžios data vėlesnė už pabaigos.' / 'The start date is after the end date.'
  'board.doneCount':    'Padaryta: {count}'                  / 'Completed: {count}'
  'board.back':         'Grįžti'                             / 'Back'
  'board.doneWeek':     'Per savaitę padaryta {count}'       / 'Completed this week: {count}'
  'board.rangeEmpty':   'Per šį laikotarpį nieko nepadaryta.'/ 'Nothing was completed in this period.'
  'board.dragHandle':   'Užduoties kortelė, tempiama'        / 'Task card, draggable'
```

`Board.tsx`: `const locale = localeOf(settings);` viršuje; kolonų pavadinimai — `bucketLabel(locale, b)`, `completedLabel(locale, b)`, `statusLabel(locale, s)`; visi vienuolika tekstų — per `t(locale, …)`. `BUCKET_LABELS` ir `COMPLETED_LABELS` importai dingsta.

`src/core/buckets.ts` ir `src/core/completed.ts`: ištrink `BUCKET_LABELS` ir `COMPLETED_LABELS` kartu su jų `LAIKINA` komentarais. Ištrink ir juos tikrinančius 2a testus (jie tikrino būtent apvalkalo tapatumą, kurio nebeliko) — bet **palik** literalinius `bucketLabel('lt', …)` tikrinimus.

Dėmesio: `GroupedList.tsx` irgi importuoja `BUCKET_LABELS`. Jis tvarkomas 5 užduotyje, tad ten laikinai paduok `bucketLabel('lt', b)`, kad tipai liktų švarūs, ir 5 užduotis pakeis į tikrą kalbą.

- [ ] **Step 4: Paleisti**

Run: `npm test && npm run typecheck && npx playwright test`

- [ ] **Step 5: Commit**

```bash
git add src/core/ src/ui/components/ tests/
git commit -m "Lenta kalba pasirinkta kalba; LAIKINI kolonų apvalkalai ištrinti"
```

---

### Task 5: Kolonos tuštuma ir grupuotas sąrašas

**Files:**
- Modify: `src/core/i18n.ts`, `src/ui/components/GroupedList.tsx`
- Test: `tests/ui/GroupedList.test.tsx`

**Interfaces:**
- Consumes: `bucketLabel`, `statusLabel`, `t`, `localeOf`.
- Produces: `GroupedListProps` papildomas `locale: Locale`.

`GroupedList.tsx` turi savo `STATUS_LABELS` kopiją (spec §5.6 — ketvirtoji) ir naudoja `BUCKET_LABELS`. Abu keliauja į `core/i18n.ts`.

- [ ] **Step 1: Parašyti krentantį testą**

```tsx
  it('angliškai sekcijų antraštės ir tuščia būsena išverstos', () => {
    renderList({ locale: 'en', tasks: [] });
    expect(screen.getByText('No tasks')).toBeDefined();
  });

  it('lietuviškai lieka kaip buvo', () => {
    renderList({ locale: 'lt', tasks: [] });
    expect(screen.getByText('Užduočių nėra')).toBeDefined();
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/GroupedList.test.tsx`

- [ ] **Step 3: Parašyti minimalų kodą**

Naujas raktas: `'list.empty': 'Užduočių nėra' / 'No tasks'`.

`GroupedList.tsx`: vietinis `STATUS_LABELS` pašalinamas; antraštės — `bucketLabel(locale, b)` ir `statusLabel(locale, s)`; tuščia būsena — `t(locale, 'list.empty')`. Kvietėjai (tray langelis, `QuickAddScreen`) paduoda `localeOf(settings)`.

- [ ] **Step 4: Paleisti**

Run: `npm test && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/core/i18n.ts src/ui/components/GroupedList.tsx src/ui/quick-add/ tests/ui/GroupedList.test.tsx
git commit -m "Grupuotas sąrašas kalba pasirinkta kalba"
```

---

### Task 6: Greitas įvedimas

**Files:**
- Modify: `src/core/i18n.ts`, `src/ui/components/QuickAdd.tsx`
- Test: `tests/ui/QuickAdd.test.tsx`

**Interfaces:**
- Consumes: `t`, `localeOf`.
- Produces: `QuickAddProps` papildomas `locale: Locale`.

- [ ] **Step 1: Parašyti krentantį testą**

```tsx
  it('angliškas įvedimo laukas', () => {
    render(<QuickAdd now={NOW} locale="en" onCreate={vi.fn()} />);
    expect(screen.getByLabelText('New task')).toBeDefined();
    expect(screen.getByPlaceholderText('New task…')).toBeDefined();
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/QuickAdd.test.tsx`

- [ ] **Step 3: Parašyti minimalų kodą**

Nauji raktai:

```
  'quickAdd.label':       'Nauja užduotis'  / 'New task'
  'quickAdd.placeholder': 'Nauja užduotis…' / 'New task…'
```

`QuickAdd.tsx` ima juos per `t(locale, …)`; `Board.tsx` ir tray langelis paduoda kalbą.

- [ ] **Step 4: Paleisti**

Run: `npm test && npm run typecheck && npx playwright test`
Dėmesio: e2e naudoja `getByLabel('Nauja užduotis')` daugelyje vietų — jie lieka žali tik todėl, kad testinė bazė kalba lietuviškai (žr. 3 užduoties 4 žingsnį).

- [ ] **Step 5: Commit**

```bash
git add src/core/i18n.ts src/ui/components/QuickAdd.tsx src/ui/ tests/ui/QuickAdd.test.tsx
git commit -m "Greitas įvedimas kalba pasirinkta kalba"
```

---

### Task 7: Kortelė

**Files:**
- Modify: `src/core/i18n.ts`, `src/ui/components/TaskCard.tsx`
- Test: `tests/ui/TaskCard.test.tsx`

**Interfaces:**
- Consumes: `t`, `formatDate`, `repeatLabel`, `localeOf`.
- Produces: `TaskCardProps` papildomas `locale: Locale`.

- [ ] **Step 1: Parašyti krentantį testą**

```tsx
  it('angliškai kortelės valdikliai ir data išversti', () => {
    renderCard({ locale: 'en', task: uzduotis({ due_at: '2026-09-14', due_has_time: false }) });
    expect(screen.getByRole('checkbox', { name: 'Mark done' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined();
    expect(screen.getByText('September 14')).toBeDefined();
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/TaskCard.test.tsx`

- [ ] **Step 3: Parašyti minimalų kodą**

Nauji raktai:

```
  'card.markDone': 'Pažymėti atlikta'      / 'Mark done'
  'card.title':    'Užduoties pavadinimas' / 'Task title'
  'card.due':      'Keisti terminą'        / 'Change due date'
  'card.delete':   'Ištrinti'              / 'Delete'
```

`TaskCard.tsx`: visi keturi `aria-label` per `t(locale, …)`; `formatLithuanianDate(...)` → `formatDate(locale, ...)`; `repeatLabel('lt', …)` → `repeatLabel(locale, …)`; `LAIKINA` komentaras pašalinamas.

- [ ] **Step 4: Paleisti**

Run: `npm test && npm run typecheck && npx playwright test`

- [ ] **Step 5: Commit**

```bash
git add src/core/i18n.ts src/ui/components/TaskCard.tsx tests/ui/TaskCard.test.tsx
git commit -m "Kortelė kalba pasirinkta kalba"
```

---

### Task 8: AM/PM laikrodis anglų kalbai

**Files:**
- Modify: `src/core/datetime.ts`, `src/core/timeinput.ts`
- Test: `tests/core/datetime.test.ts`, `tests/core/timeinput.test.ts`

**Interfaces:**
- Consumes: `Locale`.
- Produces: `formatDate` angliškai rodo `6:00 PM`; `parseTimeInput(raw, locale)` angliškai priima `6pm`, `6:30 PM`. Įvedimo lauko prijungimas `DueEditor`'e — 2c dalis.

**Saugoma reikšmė nesikeičia:** `parseTimeInput` ir toliau grąžina `HH:MM` 24 val. formatu, o `due_at`/`remind_at` bazėje lieka tokie patys. AM/PM egzistuoja tik ekrane ir įvedimo lauke.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/datetime.test.ts`:

```ts
  it('angliškai laikas rodomas AM/PM', () => {
    expect(formatDate('en', '2026-09-14T18:00', '2026-09-01')).toBe('September 14 at 6:00 PM');
    expect(formatDate('en', '2026-09-14T09:30', '2026-09-01')).toBe('September 14 at 9:30 AM');
    // Vidurnaktis ir vidurdienis — dvi vietos, kur 12 val. laikrodis klysta dažniausiai.
    expect(formatDate('en', '2026-09-14T00:15', '2026-09-01')).toBe('September 14 at 12:15 AM');
    expect(formatDate('en', '2026-09-14T12:00', '2026-09-01')).toBe('September 14 at 12:00 PM');
  });

  it('lietuviškai laikas lieka 24 valandų', () => {
    expect(formatDate('lt', '2026-09-14T18:00', '2026-09-01')).toBe('rugsėjo 14, 18:00');
    expect(formatDate('lt', '2026-09-14T00:15', '2026-09-01')).toBe('rugsėjo 14, 00:15');
  });
```

`tests/core/timeinput.test.ts`:

```ts
  it('angliškai priimamas AM/PM įvedimas', () => {
    expect(parseTimeInput('6pm', 'en')).toBe('18:00');
    expect(parseTimeInput('6:30 PM', 'en')).toBe('18:30');
    expect(parseTimeInput('12am', 'en')).toBe('00:00');
    expect(parseTimeInput('12pm', 'en')).toBe('12:00');
    // 24 val. įvedimas angliškai irgi lieka priimamas — niekas neatimama.
    expect(parseTimeInput('18:00', 'en')).toBe('18:00');
  });

  it('lietuviškai AM/PM neatpažįstamas, o 24 val. veikia kaip anksčiau', () => {
    expect(parseTimeInput('6pm', 'lt')).toBeNull();
    expect(parseTimeInput('1800', 'lt')).toBe('18:00');
    expect(parseTimeInput('18', 'lt')).toBe('18:00');
  });

  it('negalimos AM/PM valandos atmetamos', () => {
    expect(parseTimeInput('0pm', 'en')).toBeNull();
    expect(parseTimeInput('13pm', 'en')).toBeNull();
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/datetime.test.ts tests/core/timeinput.test.ts`
Expected: FAIL — `parseTimeInput` priima vieną argumentą, o angliškas laikas rodomas kaip `18:00`.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/datetime.ts` — laiko dalis formatuojama pagal kalbą:

```ts
// 12 valandų laikrodis turi dvi klasikines klaidas: 0 val. yra 12 AM, o
// 12 val. — 12 PM, ne 0 PM. Todėl `% 12` rezultatas 0 verčiamas į 12.
function timeForLocale(locale: Locale, time: string): string {
  if (locale === 'lt') return time;
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}
```

ir `formatDate` gale:

```ts
  if (time === null) return datePart;
  return locale === 'lt'
    ? `${datePart}, ${time}`
    : `${datePart} at ${timeForLocale('en', time)}`;
```

`src/core/timeinput.ts` — `parseTimeInput(raw: string, locale: Locale = 'lt')`; prieš esamas šakas įterpiama AM/PM atpažinimas, veikiantis tik kai `locale === 'en'`:

```ts
  // Tik anglų kalbai: „6pm", „6:30 PM", „12am". Lietuviškame įvedime `pm`
  // neturi prasmės, ir tylus jo priėmimas paslėptų rašybos klaidą.
  if (locale === 'en') {
    const ampm = /^(\d{1,2})(?::(\d{2}))?\s*([ap])m$/i.exec(s);
    if (ampm !== null) {
      const h = Number(ampm[1]);
      const m = ampm[2] === undefined ? 0 : Number(ampm[2]);
      if (h < 1 || h > 12 || m > 59) return null;
      const hours24 = ampm[3].toLowerCase() === 'a' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
      return `${String(hours24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
```

Numatytoji `'lt'` reikšmė palikta sąmoningai: `DueEditor` prijungiamas 2c dalyje, o iki tol visi esami kvietimai turi elgtis lygiai taip, kaip elgėsi.

- [ ] **Step 4: Paleisti**

Run: `npm test && npm run typecheck && npx playwright test`

- [ ] **Step 5: Papildyti dokumentus**

`docs/superpowers/specs/2026-09-01-parduotuves-versija-design.md` §5.4: įrašyk, kad anglų kalba naudoja 12 valandų laikrodį su AM/PM ir rodymui, ir įvedimui, o lietuvių — 24 valandų; saugoma reikšmė visada 24 val. `CLAUDE.md` dalykinių taisyklių sąraše — viena eilutė apie tą patį.

- [ ] **Step 6: Commit**

```bash
git add src/core/ tests/core/ docs/ CLAUDE.md
git commit -m "Angliškas laikas rodomas ir įvedamas AM/PM pavidalu"
```

---

## Kas lieka 2c daliai

- `DueEditor` ir `DateField` tekstai; AM/PM įvedimo prijungimas prie `DueEditor` laiko laukelio; `DueEditor` kartojimo `<select>` penkiolika variantų (penktoji etikečių kopija, spec §5.6).
- Žadintuvo, dienos apžvalgos ir nustatymų ekranai; kalbos perjungiklis nustatymuose.
- Tray meniu ir `dialog` pranešimai (`src/desktop/`).
- Klaidų vertimas kliente pagal `error.code`; serverio `message` tampa angliška atsargine reikšme (spec §5.3).
- Likę `LAIKINA` apvalkalai: `formatLithuanianDate`, `monthTitle`, `LITHUANIAN_WEEKDAYS_SHORT`.
- `--lang` jungiklio perkėlimas taip, kad Chromium meniu sektų pasirinktą kalbą (spec §5.6).
