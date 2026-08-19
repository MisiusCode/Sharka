# „Ką padariau" rodinys — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parodyti atliktas užduotis, sugrupuotas pagal atlikimo laiką, kaip trečią lentos rodinį — be naujo lango, be naujo API ir be schemos pakeitimų.

**Architecture:** Grupavimo perjungiklis įgyja trečią reikšmę `completed`. Kolonų priskyrimas gyvena grynoje `core/completed.ts` šalia esamo `buckets.ts`. Tempimas šiame rodinyje išjungiamas, o tray langelis ir dienos apžvalga jį ignoruoja.

**Tech Stack:** ta pati — TypeScript strict, React, Vitest.

**Specifikacija:** `docs/superpowers/specs/2026-08-17-ka-padariau-design.md`

**Prieš tai turi būti įgyvendinta:** atsarginės kopijos ir pasikartojančios užduotys — ne dėl techninės priklausomybės, o dėl to, kad šis rodinys nerodys pasikartojančių užduočių, ir tą apribojimą reikia aprašyti kartu su jomis.

## Global Constraints

- **Node 22+**, TypeScript `strict: true`. Jokio `any` viešose signatūrose. `npm run typecheck` — realūs vartai.
- **Reliatyvūs importai su `.js` galūne**, nors failai `.ts`/`.tsx`.
- **`src/core/completed.ts` importuoja tik `./datetime.js` ir `./types.js`** — jį naudoja naršyklės paketas.
- **Jokių schemos ir API pakeitimų.** `completed_at` jau saugomas, `GET /api/tasks` jau grąžina viską, filtruojama kliente.
- **Spalva lentoje reiškia tik prioritetą.** Suvestinė ir kolonų antraštės — pilkos.
- **Tempimas šiame rodinyje išjungtas** — atlikimo data pasakoja, kada iš tikrųjų padarei.
- Vartotojui matomi tekstai — lietuviški.

---

## Failų struktūra

```
src/core/completed.ts                completedBucketOf, sortByCompleted, doneLastWeek
src/core/settings.ts                 (grouping įgyja 'completed')
src/ui/components/FilterBar.tsx      (trečias perjungiklio mygtukas)
src/ui/components/Board.tsx          (trečias režimas, suvestinė, tempimas išjungtas)
src/ui/quick-add/QuickAddScreen.tsx  (ignoruoja 'completed')
src/ui/digest/main.tsx               (ignoruoja 'completed')
tests/core/completed.test.ts
```

---

### Task 1: Kolonų priskyrimas ir suvestinė

**Files:**
- Create: `src/core/completed.ts`
- Test: `tests/core/completed.test.ts`

**Interfaces:**
- Consumes: `addDays`, `dateOf` iš `./datetime.js`; `Task` iš `./types.js`
- Produces: `CompletedBucket = 'today' | 'yesterday' | 'week' | 'earlier'`, `COMPLETED_BUCKETS`, `COMPLETED_LABELS`, `completedBucketOf(task, today): CompletedBucket | null`, `sortByCompleted(tasks): Task[]`, `doneLastWeek(tasks, today): number`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/completed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/core/types.js';
import { completedBucketOf, doneLastWeek, sortByCompleted } from '../../src/core/completed.js';

const TODAY = '2026-08-17';

function done(id: string, completedAt: string | null, status: Task['status'] = 'done'): Task {
  return {
    id, title: id, status, priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    repeat: null, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
    completed_at: completedAt,
  };
}

describe('completedBucketOf', () => {
  it('skirsto pagal atlikimo datą', () => {
    expect(completedBucketOf(done('a', '2026-08-17T09:00:00.000Z'), TODAY)).toBe('today');
    expect(completedBucketOf(done('b', '2026-08-16T09:00:00.000Z'), TODAY)).toBe('yesterday');
    expect(completedBucketOf(done('c', '2026-08-14T09:00:00.000Z'), TODAY)).toBe('week');
    expect(completedBucketOf(done('d', '2026-07-01T09:00:00.000Z'), TODAY)).toBe('earlier');
  });

  it('riba: prieš 7 dienas dar „šią savaitę", prieš 8 jau „anksčiau"', () => {
    expect(completedBucketOf(done('a', '2026-08-10T09:00:00.000Z'), TODAY)).toBe('week');
    expect(completedBucketOf(done('b', '2026-08-09T09:00:00.000Z'), TODAY)).toBe('earlier');
  });

  it('neatlikta užduotis nepatenka niekur', () => {
    expect(completedBucketOf(done('a', null, 'todo'), TODAY)).toBeNull();
    // Apsauga nuo nenuoseklių duomenų: būsena todo, bet completed_at užpildytas.
    expect(completedBucketOf(done('b', '2026-08-17T09:00:00.000Z', 'todo'), TODAY)).toBeNull();
  });
});

describe('sortByCompleted', () => {
  it('naujausias atlikimas viršuje', () => {
    const surikiuota = sortByCompleted([
      done('senas', '2026-08-10T09:00:00.000Z'),
      done('naujas', '2026-08-17T09:00:00.000Z'),
      done('vidurinis', '2026-08-14T09:00:00.000Z'),
    ]);
    expect(surikiuota.map((t) => t.id)).toEqual(['naujas', 'vidurinis', 'senas']);
  });

  it('nekeičia paduoto masyvo', () => {
    const originalus = [done('a', '2026-08-10T09:00:00.000Z'), done('b', '2026-08-17T09:00:00.000Z')];
    sortByCompleted(originalus);
    expect(originalus.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('doneLastWeek', () => {
  it('skaičiuoja tik paskutines septynias dienas', () => {
    const tasks = [
      done('a', '2026-08-17T09:00:00.000Z'),
      done('b', '2026-08-11T09:00:00.000Z'),
      done('c', '2026-08-09T09:00:00.000Z'),
      done('d', null, 'todo'),
    ];
    expect(doneLastWeek(tasks, TODAY)).toBe(2);
  });

  it('nulis grąžinamas kaip nulis', () => {
    expect(doneLastWeek([], TODAY)).toBe(0);
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/completed.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/completed.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/core/completed.ts`:

```ts
import { addDays } from './datetime.js';
import type { Task } from './types.js';

export type CompletedBucket = 'today' | 'yesterday' | 'week' | 'earlier';

export const COMPLETED_BUCKETS: CompletedBucket[] = ['today', 'yesterday', 'week', 'earlier'];

export const COMPLETED_LABELS: Record<CompletedBucket, string> = {
  today: 'Šiandien',
  yesterday: 'Vakar',
  week: 'Šią savaitę',
  earlier: 'Anksčiau',
};

/** `completed_at` yra pilnas ISO momentas su Z; kolonoms reikia tik datos. */
function completedDate(task: Task): string | null {
  if (task.status !== 'done' || task.completed_at === null) return null;
  return task.completed_at.slice(0, 10);
}

export function completedBucketOf(task: Task, today: string): CompletedBucket | null {
  const date = completedDate(task);
  if (date === null) return null;

  if (date >= today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  if (date >= addDays(today, -7)) return 'week';
  return 'earlier';
}

export function sortByCompleted(tasks: Task[]): Task[] {
  // Lyginimas grąžina ir nulį: komparatorius, niekada negrąžinantis nulio,
  // vienodoms reikšmėms nėra simetriškas, o `Array.sort` to tikisi.
  return [...tasks].sort((a, b) => {
    const x = a.completed_at ?? '';
    const y = b.completed_at ?? '';
    return x === y ? 0 : x > y ? -1 : 1;
  });
}

export function doneLastWeek(tasks: Task[], today: string): number {
  const riba = addDays(today, -7);
  return tasks.filter((t) => {
    const date = completedDate(t);
    return date !== null && date >= riba;
  }).length;
}
```

Pastaba dėl `completed_at.slice(0, 10)`: momentas saugomas UTC, o kolonos skaičiuojamos vietine data. Lietuva yra UTC+2 žiemą ir UTC+3 vasarą, tad UTC = vietinis − poslinkis: UTC data gali tik atsilikti nuo vietinės, niekada jos nepralenkti. Skirtumas iškyla tik užduotims, atliktoms vietiniu laiku poslinkio valandomis iškart po vidurnakčio — 00:00–02:00 žiemą, 00:00–03:00 vasarą; vakare (21:00–23:59) atliktos užduotys UTC ribos nekerta niekada. Priimta sąmoningai: taisymas reikštų laiko juostų konvertavimą, o klaida yra vienos dienos poslinkis retame krašte istoriniame rodinyje.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/completed.test.ts`
Expected: PASS, 7 testų

- [ ] **Step 5: Commit**

```bash
git add src/core/completed.ts tests/core/completed.test.ts
git commit -m "feat: atliktų užduočių kolonos ir savaitės suvestinė"
```

---

### Task 2: Trečia grupavimo reikšmė

**Files:**
- Modify: `src/core/settings.ts`, `src/ui/quick-add/QuickAddScreen.tsx`, `src/ui/digest/main.tsx`
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Produces: `SettingsMap['grouping']` įgyja `'completed'`

- [ ] **Step 1: Parašyti krentantį testą**

Pridėti į `tests/core/settings.test.ts`:

```ts
it('grupavimas priima trečią reikšmę', () => {
  expect(() => store.patch({ grouping: 'completed' })).not.toThrow();
  expect(store.getAll().grouping).toBe('completed');
});

it('grupavimas vis dar atmeta nesąmones', () => {
  expect(() => store.patch({ grouping: 'nesamone' as never })).toThrow();
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL — `Netinkama nustatymo reikšmė: grouping`

- [ ] **Step 3: Papildyti nustatymus**

`src/core/settings.ts` — `SettingsMap` tipe:

```ts
  grouping: 'date' | 'status' | 'completed';
```

Validatoriuje:

```ts
  grouping: (v) => v === 'date' || v === 'status' || v === 'completed',
```

- [ ] **Step 4: Priversti kitus langus ignoruoti naują reikšmę**

Tray langelis ir dienos apžvalga egzistuoja tam, kas dar **nepadaryta**. Parodyti juose atliktų sąrašą būtų klaida, net jei lenta palikta apžvalgos režime.

`src/ui/quick-add/QuickAddScreen.tsx` — ten, kur `grouping` perduodamas `GroupedList`:

```tsx
          grouping={settings?.grouping === 'status' ? 'status' : 'date'}
```

`src/ui/digest/main.tsx` — apžvalga rodo tik šios dienos neatliktas užduotis ir grupavimo apskritai nenaudoja; patikrink, ar `grouping` niekur nepatenka į `GroupedList` ar `dateBucketOf` kvietimą. Jei ne — nieko keisti nereikia, tik įrašyk tai į ataskaitą.

Pastaba: `GroupedList` prop'as lieka `'date' | 'status'` — trečia reikšmė iki jo nekeliauja, tad jo tipo keisti nereikia.

- [ ] **Step 5: Paleisti testus**

Run: `npm test` ir `npm run typecheck`
Expected: PASS ir švaru

- [ ] **Step 6: Commit**

```bash
git add src/core/settings.ts src/ui/quick-add/QuickAddScreen.tsx tests/core/settings.test.ts
git commit -m "feat: grupavimas įgyja trečią reikšmę completed"
```

---

### Task 3: Lentos rodinys

**Files:**
- Modify: `src/ui/components/FilterBar.tsx`, `src/ui/components/Board.tsx`, `src/ui/theme.css`, `README.md`
- Test: `tests/ui/FilterBar.test.tsx`, `tests/ui/Board.test.tsx`

**Interfaces:**
- Consumes: `COMPLETED_BUCKETS`, `COMPLETED_LABELS`, `completedBucketOf`, `sortByCompleted`, `doneLastWeek` iš `../../core/completed.js`

- [ ] **Step 1: Parašyti krentančius testus**

Pridėti į `tests/ui/FilterBar.test.tsx`:

```tsx
  it('turi trečią perjungiklio mygtuką', async () => {
    const { onGroupingChange } = renderBar('date');
    await userEvent.click(screen.getByRole('button', { name: 'Padaryta' }));
    expect(onGroupingChange).toHaveBeenCalledWith('completed');
  });
```

Pridėti į `tests/ui/Board.test.tsx`:

```tsx
describe('Board — padaryta', () => {
  it('rodo tik atliktas, sugrupuotas pagal atlikimo laiką', async () => {
    setup([
      task({ id: 'a', title: 'Padaryta šiandien', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' }),
      task({ id: 'b', title: 'Dar nepadaryta' }),
    ], 'completed');

    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    expect(within(screen.getByTestId('kolona-Šiandien')).getByText('Padaryta šiandien')).toBeDefined();
    expect(screen.queryByText('Dar nepadaryta')).toBeNull();
  });

  it('rodo savaitės suvestinę', async () => {
    setup([
      task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' }),
      task({ id: 'b', status: 'done', completed_at: '2026-08-13T09:00:00.000Z' }),
    ], 'completed');

    await waitFor(() => expect(screen.getByText('Per savaitę padaryta 2')).toBeDefined());
  });

  it('varnelės nuėmimas grąžina užduotį atgal', async () => {
    setup([task({ id: 'a', title: 'A', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    vi.mocked(api.patchTask).mockResolvedValue(task({ id: 'a', status: 'todo' }));

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));

    expect(api.patchTask).toHaveBeenCalledWith('a', { status: 'todo' });
  });

  it('tempimo šiame rodinyje nėra', async () => {
    setup([task({ id: 'a', title: 'A', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    // Tempiamas apvalkalas turi savo prieinamą vardą; apžvalgos režime jo nėra.
    expect(screen.queryByLabelText('Užduoties kortelė, tempiama')).toBeNull();
  });
});
```

`setup` pagalbinė funkcija jau priima grupavimą antru argumentu; `task()` numatytuosiuose laukuose pridėk `repeat: null`, jei jo dar nėra.

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/FilterBar.test.tsx tests/ui/Board.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Padaryta"`

- [ ] **Step 3: Papildyti filtrų juostą**

`src/ui/components/FilterBar.tsx` — perjungiklio masyvą ir tipą praplėsti trečia reikšme:

```tsx
        {(['date', 'status', 'completed'] as const).map((mode) => {
          const label = mode === 'date' ? 'Datos' : mode === 'status' ? 'Progresas' : 'Padaryta';
          return (
            <button
              key={mode}
              type="button"
              aria-label={label}
              data-pazymeta={grouping === mode}
              onClick={() => onGroupingChange(mode)}
            >
              {label}
            </button>
          );
        })}
```

`FilterBarProps` tipuose `grouping` ir `onGroupingChange` reikšmė tampa `'date' | 'status' | 'completed'`.

- [ ] **Step 4: Papildyti lentą**

`src/ui/components/Board.tsx` — importas:

```ts
import {
  COMPLETED_BUCKETS, COMPLETED_LABELS, completedBucketOf, doneLastWeek, sortByCompleted,
} from '../../core/completed.js';
```

Kolonų sudarymo vietoje pridėti trečią šaką **prieš** esamas dvi. Esamas `status` ir `date` šakas palik tiksliai tokias, kokios yra faile — keičiasi tik tai, kad prieš jas atsiranda dar viena sąlyga:

```tsx
  const completedView = settings?.grouping === 'completed';

  const columns = completedView
    ? COMPLETED_BUCKETS.map((b) => ({
        id: b,
        label: COMPLETED_LABELS[b],
        tasks: sortByCompleted(visible.filter((t) => completedBucketOf(t, today) === b)),
      }))
    : settings?.grouping === 'status'
      ? STATUSES.map((s) => ({
          id: s,
          label: STATUS_LABELS[s],
          tasks: visible.filter((t) => t.status === s),
        }))
      : DATE_BUCKETS.map((b) => ({
          id: b,
          label: BUCKET_LABELS[b],
          tasks: visible.filter((t) => dateBucketOf(t, today) === b),
        }));
```

Filtre `visible` atliktų slėpimo taisyklė šiame režime netaikoma — priešingu atveju rodinys būtų tuščias:

```tsx
      if (!prefs.showDone && t.status === 'done' && settings?.grouping === 'date') return false;
```

(anksčiau sąlyga buvo `settings?.grouping !== 'status'`).

Suvestinė virš kolonų:

```tsx
      {completedView && (
        <p className="suvestine">Per savaitę padaryta {doneLastWeek(visible, today)}</p>
      )}
```

Tempimas išjungiamas — `DraggableCard` apvalkalas praleidžiamas:

```tsx
              {completedView ? (
                <TaskCard {...kortelesProps} />
              ) : (
                <DraggableCard key={task.id} id={task.id}>
                  <TaskCard {...kortelesProps} />
                </DraggableCard>
              )}
```

Atlikimo data pasakoja, kada iš tikrųjų padarei; tempti kortelę iš „Vakar" į „Šiandien" reikštų perrašyti istoriją.

`src/ui/theme.css`:

```css
.suvestine {
  margin: 0 0 8px;
  color: var(--tekstas-blankus);
  font-size: 13px;
}
```

- [ ] **Step 5: Papildyti README**

Į „Žinomi apribojimai" pridėti:

```markdown
- **„Padaryta" rodinys nerodo pasikartojančių užduočių.** Jos niekada nelieka
  atliktos — pažymėtos jos peršoka į kitą kartą, tad atlikimo laikas joms
  nefiksuojamas. Tai reiškia, kad reguliariausiai daromi darbai savaitės
  suvestinėje nesimatys.
```

- [ ] **Step 6: Paleisti viską**

Run: `npm test`, `npm run typecheck`, `npm run build`
Expected: PASS ir švaru

- [ ] **Step 7: Rankinė patikra**

Run: `npm run app`

1. Perjungus į „Padaryta" rodomos tik atliktos, sugrupuotos pagal atlikimo laiką
2. Virš kolonų — „Per savaitę padaryta N"
3. Nuėmus varnelę užduotis dingsta iš šio rodinio ir grįžta į darbinę lentą
4. Kortelės netempiamos
5. Palikus lentą šiame režime ir atidarius tray langelį, jis rodo datų grupavimą, ne atliktas

- [ ] **Step 8: Commit**

```bash
git add src/ui tests/ui README.md
git commit -m "feat: „Padaryta" rodinys su savaitės suvestine"
```

---

## Pabaigos patikra

- Trečias perjungiklio režimas rodo atliktas pagal atlikimo laiką
- Savaitės suvestinė rodo vieną skaičių, be grafikų
- Varnelės nuėmimas grąžina užduotį; tempimas išjungtas
- Tray langelis ir dienos apžvalga naujos reikšmės nepaiso
- Apribojimas dėl pasikartojančių užduočių aprašytas README
