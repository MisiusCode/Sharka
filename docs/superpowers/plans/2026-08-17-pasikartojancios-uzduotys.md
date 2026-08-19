# Pasikartojančios užduotys — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leisti užduočiai kartotis kas savaitę nurodytą dieną arba kas mėnesį nurodytą dieną — pažymėta atlikta ji ne užsidaro, o peršoka į kitą kartą.

**Architecture:** Datų matematika gyvena grynoje `core/repeat.ts`, importuojamoje ir naršyklės. Persistūmimas įgyvendinamas `core/tasks.ts` `update()` viduje, tad visi keturi langai gauna teisingą elgseną nemokamai. Schema pakyla iki versijos 2 — pirmas tikras migracijos atvejis projekte.

**Tech Stack:** ta pati — TypeScript strict, better-sqlite3, Vitest, React.

**Specifikacija:** `docs/superpowers/specs/2026-08-17-pasikartojancios-uzduotys-design.md`

**Prieš tai turi būti įgyvendinta:** `docs/superpowers/plans/2026-08-17-atsargines-kopijos.md` — ši migracija yra pirmas atsarginių kopijų bandymas.

## Global Constraints

- **Node 22+**, TypeScript `strict: true`. Jokio `any` viešose signatūrose. `npm run typecheck` — realūs vartai.
- **Reliatyvūs importai su `.js` galūne**, nors failai `.ts`/`.tsx`.
- **`src/core/repeat.ts` importuoja tik `./datetime.js`.** Jį naudoja naršyklės paketas — jokių Node modulių, jokio `better-sqlite3`.
- **`new Date(y, m, d)` kalendorinei aritmetikai yra leidžiama** ir nėra „laiko skaitymas". Draudimas liečia dabarties laiką (`Date.now()`, `new Date()` be argumentų), kuris ateina tik per `Clock`. `datetime.ts` `addDays` daro lygiai tą patį.
- **Kitas kartas skaičiuojamas nuo šiandien, ne nuo saugomo termino.** Kitaip pradelsta užduotis po pažymėjimo vėl atsidurtų praeityje.
- **Praleisti kartai lieka pradelsti** — jokio automatinio peršokimo.
- **Kortelėje — `↻` ženklas, ne spalva ir ne tekstas.** Spalva lentoje jau reiškia prioritetą.
- Vartotojui matomi tekstai — lietuviški.

---

## Failų struktūra

```
src/core/repeat.ts                 nextOccurrence, isValidRepeat, repeatLabel
src/core/types.ts                  (+repeat laukas)
src/core/db.ts                     (SCHEMA_VERSION 2 + migracija)
src/core/tasks.ts                  (+persistūmimas update() viduje)
src/server/routes/tasks.ts         (+repeat validacija)
src/ui/components/DueEditor.tsx    (+kartojimo pasirinkimas)
src/ui/components/TaskCard.tsx     (+↻ ženklas)
tests/core/repeat.test.ts
```

---

### Task 1: Datų matematika

Visa funkcijos esmė čia. Gryna, be disko, be laikrodžio.

**Files:**
- Create: `src/core/repeat.ts`
- Test: `tests/core/repeat.test.ts`

**Interfaces:**
- Consumes: `addDays` iš `./datetime.js`
- Produces: `isValidRepeat(value: unknown): boolean`, `repeatLabel(repeat: string): string`, `nextOccurrence(repeat: string, fromDate: string): string`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/repeat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidRepeat, nextOccurrence, repeatLabel } from '../../src/core/repeat.js';

describe('isValidRepeat', () => {
  it('priima savaitės ir mėnesio dienas ribose', () => {
    for (const ok of ['w:1', 'w:7', 'm:1', 'm:15', 'm:31']) {
      expect(isValidRepeat(ok)).toBe(true);
    }
  });

  it('atmeta reikšmes už ribų ir sugadintas', () => {
    for (const bad of ['w:0', 'w:8', 'm:0', 'm:32', 'd:3', 'w:', 'w', '', 'w:1:2', 'W:1', 7, null]) {
      expect(isValidRepeat(bad)).toBe(false);
    }
  });
});

describe('repeatLabel', () => {
  it('rašo lietuviškai', () => {
    expect(repeatLabel('w:2')).toBe('kas antradienį');
    expect(repeatLabel('w:7')).toBe('kas sekmadienį');
    expect(repeatLabel('m:15')).toBe('kas 15 dieną');
  });
});

describe('nextOccurrence — savaitės diena', () => {
  // 2026-08-17 yra pirmadienis.
  it('kai šiandien ta pati diena, grąžina po septynių dienų', () => {
    expect(nextOccurrence('w:1', '2026-08-17')).toBe('2026-08-24');
  });

  it('kai diena dar bus šią savaitę', () => {
    expect(nextOccurrence('w:2', '2026-08-17')).toBe('2026-08-18');
    expect(nextOccurrence('w:7', '2026-08-17')).toBe('2026-08-23');
  });

  it('kai diena jau praėjo, imama kitos savaitės', () => {
    // 2026-08-19 yra trečiadienis; antradienis jau praėjo.
    expect(nextOccurrence('w:2', '2026-08-19')).toBe('2026-08-25');
  });

  it('peršoka per metų ribą', () => {
    // 2026-12-28 yra pirmadienis.
    expect(nextOccurrence('w:5', '2026-12-28')).toBe('2027-01-01');
  });
});

describe('nextOccurrence — mėnesio diena', () => {
  it('kai diena dar bus šį mėnesį', () => {
    expect(nextOccurrence('m:15', '2026-08-10')).toBe('2026-08-15');
  });

  it('kai diena jau praėjo, imamas kitas mėnuo', () => {
    expect(nextOccurrence('m:15', '2026-08-20')).toBe('2026-09-15');
  });

  it('kai šiandien ta pati diena, imamas kitas mėnuo', () => {
    expect(nextOccurrence('m:15', '2026-08-15')).toBe('2026-09-15');
  });

  it('31 dieną trumpesniuose mėnesiuose apkerpa iki paskutinės', () => {
    expect(nextOccurrence('m:31', '2026-04-05')).toBe('2026-04-30');
    expect(nextOccurrence('m:31', '2026-02-05')).toBe('2026-02-28');
    expect(nextOccurrence('m:31', '2028-02-05')).toBe('2028-02-29');
  });

  it('peršoka per metų ribą', () => {
    expect(nextOccurrence('m:5', '2026-12-10')).toBe('2027-01-05');
  });

  it('paskutinę mėnesio dieną su apkirpimu keliauja į kitą mėnesį', () => {
    // Balandžio 30 yra ir „31-a apkirpta" — tad kitas kartas gegužę.
    expect(nextOccurrence('m:31', '2026-04-30')).toBe('2026-05-31');
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/repeat.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/repeat.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/core/repeat.ts`:

```ts
import { addDays } from './datetime.js';

const WEEKDAYS = [
  'pirmadienį', 'antradienį', 'trečiadienį', 'ketvirtadienį',
  'penktadienį', 'šeštadienį', 'sekmadienį',
];

const REPEAT_RE = /^([wm]):(\d{1,2})$/;

const pad = (n: number): string => String(n).padStart(2, '0');

export function isValidRepeat(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = REPEAT_RE.exec(value);
  if (match === null) return false;
  const n = Number(match[2]);
  return match[1] === 'w' ? n >= 1 && n <= 7 : n >= 1 && n <= 31;
}

export function repeatLabel(repeat: string): string {
  const [kind, raw] = repeat.split(':');
  const n = Number(raw);
  return kind === 'w' ? `kas ${WEEKDAYS[n - 1]}` : `kas ${n} dieną`;
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
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/repeat.test.ts`
Expected: PASS, 12 testų

- [ ] **Step 5: Commit**

```bash
git add src/core/repeat.ts tests/core/repeat.test.ts
git commit -m "feat: kartojimo šablonai ir kito karto skaičiavimas"
```

---

### Task 2: Schemos versija 2

Pirmas tikras migracijos atvejis projekte. Kartu tai atsarginių kopijų bandymas.

**Files:**
- Modify: `src/core/db.ts`, `src/core/types.ts`
- Test: `tests/core/db.test.ts`

**Interfaces:**
- Produces: `Task.repeat: string | null`; `TaskInput.repeat?: string | null`; `TaskPatch` papildomas `repeat`; `SCHEMA_VERSION = 2`

- [ ] **Step 1: Parašyti krentantį testą**

Pridėti į `tests/core/db.test.ts`:

```ts
it('migruoja v1 bazę į v2 pridėdama repeat stulpelį ir nepraranda užduočių', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taskerpro-migr-'));
  const path = join(dir, 'tasks.db');

  // Rankomis sukuriam v1 bazę — be `repeat`, su schema_version = 1.
  const senas = new Database(path);
  senas.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'todo',
      priority INTEGER NOT NULL DEFAULT 2, due_at TEXT, due_has_time INTEGER NOT NULL DEFAULT 0,
      remind_at TEXT, reminded_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO settings (key, value) VALUES ('schema_version', '1');
    INSERT INTO tasks (id, title, created_at, updated_at)
      VALUES ('a', 'Sena užduotis', '2026-08-01T10:00:00Z', '2026-08-01T10:00:00Z');
  `);
  senas.close();

  const db = openDb(path);

  const stulpeliai = (db.pragma('table_info(tasks)') as { name: string }[]).map((c) => c.name);
  expect(stulpeliai).toContain('repeat');
  expect(db.prepare("SELECT title FROM tasks WHERE id = 'a'").get()).toEqual({ title: 'Sena užduotis' });
  expect(db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get())
    .toEqual({ value: '2' });

  // Migruojant privalo atsirasti atsarginė kopija — tai pirmas kartas, kai
  // `backupBeforeMigrate` apskritai suveikia.
  expect(existsSync(`${path}.bak`)).toBe(true);

  db.close();
  rmSync(dir, { recursive: true, force: true });
});
```

Failo viršuje reikia `import Database from 'better-sqlite3';`, jei jo dar nėra.

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/db.test.ts`
Expected: FAIL — `expected [...] to contain 'repeat'`

- [ ] **Step 3: Pakelti schemos versiją**

`src/core/db.ts` — `SCHEMA_VERSION` į `2`, o į `MIGRATIONS` masyvo galą pridėti antrą įrašą:

```ts
  `
  ALTER TABLE tasks ADD COLUMN repeat TEXT;
  `,
```

Migracijų masyvas indeksuojamas nuo nulio: `MIGRATIONS[0]` yra pradinė schema, `MIGRATIONS[1]` — šis pakeitimas. Ciklas `for (let v = from; v < SCHEMA_VERSION; v++)` jį pritaikys tik tada, kai `from` yra 1.

- [ ] **Step 4: Papildyti tipus**

`src/core/types.ts` — į `Task` po `completed_at`:

```ts
  repeat: string | null;
```

Į `TaskInput`:

```ts
  repeat?: string | null;
```

Į `TaskPatch` `Pick` sąrašą pridėti `'repeat'`.

- [ ] **Step 5: Paleisti visus testus**

Run: `npm test`
Expected: PASS. Jei `tasks.ts` neužsikompiliuoja dėl trūkstamo `repeat` lauko `create` viduje — pridėk `repeat: input.repeat ?? null` prie kuriamo objekto ir į `INSERT` stulpelių sąrašą bei `VALUES`.

Run: `npm run typecheck`
Expected: švaru

- [ ] **Step 6: Commit**

```bash
git add src/core/db.ts src/core/types.ts src/core/tasks.ts tests/core/db.test.ts
git commit -m "feat: schemos versija 2 su repeat stulpeliu"
```

---

### Task 3: Persistūmimas ir API validacija

**Files:**
- Modify: `src/core/tasks.ts`, `src/server/routes/tasks.ts`
- Test: `tests/core/tasks.test.ts`, `tests/server/api.test.ts`

**Interfaces:**
- Consumes: `nextOccurrence`, `isValidRepeat` iš `../core/repeat.js`; `formatLocalDate`, `timeOf` iš `./datetime.js`
- Produces: `update()` elgsena — pasikartojanti užduotis nepažymima atlikta; API kodas `invalid_repeat`

- [ ] **Step 1: Parašyti krentančius testus**

Pridėti į `tests/core/tasks.test.ts`:

```ts
describe('pasikartojančios užduotys', () => {
  it('pažymėta atlikta lieka todo, o terminas peršoka', () => {
    // fixedClock nustatytas ties 2026-08-14 (penktadienis).
    const t = store.create({ title: 'Išnešti šiukšles', due_at: '2026-08-11', repeat: 'w:2' });

    const po = store.update(t.id, { status: 'done' })!;

    expect(po.status).toBe('todo');
    expect(po.completed_at).toBeNull();
    expect(po.due_at).toBe('2026-08-18');
  });

  it('laikas ir žadintuvas išsaugomi, reminded_at nuvalomas', () => {
    const t = store.create({
      title: 'Vaistai', due_at: '2026-08-11T18:00', due_has_time: true,
      remind_at: '2026-08-11T18:00', repeat: 'w:2',
    });
    store.markReminded(t.id);

    const po = store.update(t.id, { status: 'done' })!;

    expect(po.due_at).toBe('2026-08-18T18:00');
    expect(po.remind_at).toBe('2026-08-18T18:00');
    expect(po.reminded_at).toBeNull();
  });

  it('tris savaites pradelsta po pažymėjimo atsiduria ATEITYJE', () => {
    // Skaičiuojama nuo šiandien, ne nuo seno termino — kitaip liktų raudona.
    const t = store.create({ title: 'X', due_at: '2026-07-21', repeat: 'w:2' });

    const po = store.update(t.id, { status: 'done' })!;

    expect(po.due_at! > '2026-08-14').toBe(true);
  });

  it('nepasikartojanti elgiasi kaip anksčiau', () => {
    const t = store.create({ title: 'Vienkartinė' });

    const po = store.update(t.id, { status: 'done' })!;

    expect(po.status).toBe('done');
    expect(po.completed_at).not.toBeNull();
  });
});
```

Pridėti į `tests/server/api.test.ts`:

```ts
  it('atmeta netinkamą kartojimą su 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'X', repeat: 'd:3' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_repeat');
  });

  it('priima teisingą kartojimą', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'X', repeat: 'w:2' });
    expect(res.status).toBe(201);
    expect(res.body.repeat).toBe('w:2');
  });
```

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/tasks.test.ts tests/server/api.test.ts`
Expected: FAIL — `expected 'done' to be 'todo'`

- [ ] **Step 3: Įgyvendinti persistūmimą**

`src/core/tasks.ts` — importai:

```ts
import { formatLocalDate, formatLocalDateTime, timeOf } from './datetime.js';
import { nextOccurrence } from './repeat.js';
```

`update()` viduje, **iškart po** `if (before === null) return null;` ir **prieš** visą kitą laukų apdorojimą:

```ts
      // Pasikartojanti užduotis neužsidaro — ji peršoka į kitą kartą. Ši
      // taisyklė gyvena čia, o ne sąsajoje, todėl lenta, tray langelis,
      // dienos apžvalga ir žadintuvas visi gauna ją nemokamai.
      if (patch.status === 'done' && before.repeat !== null) {
        const nextDate = nextOccurrence(before.repeat, formatLocalDate(clock.now()));
        const time = before.due_at !== null && before.due_has_time ? timeOf(before.due_at) : null;
        const due = time === null ? nextDate : `${nextDate}T${time}`;

        return writeFields(id, {
          status: 'todo',
          due_at: due,
          remind_at: time === null ? null : due,
          reminded_at: null,
          completed_at: null,
          updated_at: now,
        });
      }
```

`now` čia yra jau apskaičiuotas `clock.now().toISOString()` — jei jis deklaruojamas žemiau, perkelk deklaraciją aukščiau šio bloko.

- [ ] **Step 4: Pridėti API validaciją**

`src/server/routes/tasks.ts` — importas:

```ts
import { isValidRepeat } from '../../core/repeat.js';
```

Į `validatePatch`, prie kitų laukų:

```ts
  if (body.repeat !== undefined) {
    if (body.repeat !== null && !isValidRepeat(body.repeat)) {
      throw new ApiError(400, 'invalid_repeat', 'Netinkamas kartojimo šablonas');
    }
    patch.repeat = body.repeat as string | null;
  }
```

Ir į `POST /` kuriamos užduoties objektą pridėti `repeat: patch.repeat`.

- [ ] **Step 5: Paleisti testus**

Run: `npm test`
Expected: PASS

Run: `npm run typecheck`
Expected: švaru

- [ ] **Step 6: Commit**

```bash
git add src/core/tasks.ts src/server/routes/tasks.ts tests/core/tasks.test.ts tests/server/api.test.ts
git commit -m "feat: pasikartojanti užduotis peršoka į kitą kartą"
```

---

### Task 4: Sąsaja

**Files:**
- Modify: `src/ui/components/DueEditor.tsx`, `src/ui/components/TaskCard.tsx`, `src/ui/theme.css`
- Test: `tests/ui/DueEditor.test.tsx`, `tests/ui/TaskCard.test.tsx`

**Interfaces:**
- Consumes: `repeatLabel`, `nextOccurrence` iš `../../core/repeat.js`
- Produces: `DueValue` papildomas `repeat: string | null`

- [ ] **Step 1: Parašyti krentančius testus**

Pridėti į `tests/ui/TaskCard.test.tsx`:

```ts
  it('pasikartojančią užduotį žymi ženklu, ne tekstu', () => {
    renderCard({ due_at: '2026-08-18', repeat: 'w:2' });
    const zenklas = screen.getByTitle('kas antradienį');
    expect(zenklas.textContent).toBe('↻');
    expect(screen.queryByText('kas antradienį')).toBeNull();
  });

  it('nepasikartojanti ženklo neturi', () => {
    renderCard({ due_at: '2026-08-18' });
    expect(screen.queryByTitle(/^kas /)).toBeNull();
  });
```

`task()` pagalbinėje funkcijoje pridėk `repeat: null` prie numatytųjų laukų.

Pridėti į `tests/ui/DueEditor.test.tsx`:

```ts
  it('pasirinkus savaitės dieną nustato kartojimą ir terminą iš karto', async () => {
    const onChange = renderEditor();
    await userEvent.selectOptions(screen.getByLabelText('Kartojimas'), 'w:2');

    const paskutinis = onChange.mock.lastCall![0];
    expect(paskutinis.repeat).toBe('w:2');
    // NOW yra 2026-08-14 (penktadienis) — artimiausias antradienis 08-18.
    expect(paskutinis.due_at).toBe('2026-08-18');
  });

  it('kartojimą nuėmus terminas nekeičiamas', async () => {
    const onChange = renderEditor({ ...EMPTY, due_at: '2026-08-20', repeat: 'w:2' });
    await userEvent.selectOptions(screen.getByLabelText('Kartojimas'), '');

    const paskutinis = onChange.mock.lastCall![0];
    expect(paskutinis.repeat).toBeNull();
    expect(paskutinis.due_at).toBe('2026-08-20');
  });
```

`EMPTY` konstantoje pridėk `repeat: null`.

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/TaskCard.test.tsx tests/ui/DueEditor.test.tsx`
Expected: FAIL — `Unable to find an element with the title: kas antradienį`

- [ ] **Step 3: Papildyti kortelę**

`src/ui/components/TaskCard.tsx` — importas:

```ts
import { repeatLabel } from '../../core/repeat.js';
```

Šalia datos žymės, prieš ištrynimo mygtuką:

```tsx
      {task.repeat !== null && (
        <span className="kartojimo-zenklas" title={repeatLabel(task.repeat)} aria-label={repeatLabel(task.repeat)}>
          ↻
        </span>
      )}
```

`src/ui/theme.css`:

```css
/* Be spalvos sąmoningai: lentoje spalva reiškia prioritetą, ir antra prasmė
   padarytų abi sunkiau skaitomas. */
.kartojimo-zenklas {
  color: var(--tekstas-blankus);
  font-size: 13px;
  cursor: default;
}
```

- [ ] **Step 4: Papildyti termino redaktorių**

`src/ui/components/DueEditor.tsx` — importai:

```ts
import { nextOccurrence } from '../../core/repeat.js';
```

Į `DueValue` sąsają pridėti `repeat: string | null;`.

Po laiko laukelio įterpti:

```tsx
      <select
        aria-label="Kartojimas"
        value={value.repeat ?? ''}
        onChange={(e) => {
          const repeat = e.target.value === '' ? null : e.target.value;
          if (repeat === null) {
            onChange({ ...value, repeat: null });
            return;
          }
          // Pasirinkus šabloną terminas iškart perskaičiuojamas: pasikartojanti
          // užduotis visada turi datą, o be jos kartojimas neturėtų atramos.
          const date = nextOccurrence(repeat, formatLocalDate(now));
          const time = value.due_has_time && value.due_at !== null ? timeOf(value.due_at) : null;
          const due = time === null ? date : `${date}T${time}`;
          onChange({
            ...value,
            repeat,
            due_at: due,
            due_has_time: time !== null,
            remind_at: time === null ? null : due,
          });
        }}
      >
        <option value="">Nesikartoja</option>
        <option value="w:1">Kas pirmadienį</option>
        <option value="w:2">Kas antradienį</option>
        <option value="w:3">Kas trečiadienį</option>
        <option value="w:4">Kas ketvirtadienį</option>
        <option value="w:5">Kas penktadienį</option>
        <option value="w:6">Kas šeštadienį</option>
        <option value="w:7">Kas sekmadienį</option>
        <option value="m:1">Kas 1 mėnesio dieną</option>
        <option value="m:5">Kas 5 mėnesio dieną</option>
        <option value="m:10">Kas 10 mėnesio dieną</option>
        <option value="m:15">Kas 15 mėnesio dieną</option>
        <option value="m:20">Kas 20 mėnesio dieną</option>
        <option value="m:25">Kas 25 mėnesio dieną</option>
        <option value="m:31">Paskutinę mėnesio dieną</option>
      </select>
```

Mėnesio dienos pateikiamos kaip fiksuotas sąrašas, ne kaip 31 punktas: sąskaitos ir nuoma praktiškai visada krenta ties apvaliomis datomis, o trisdešimt vienas punktas išilgai sąrašo paverstų pasirinkimą naršymu.

- [ ] **Step 5: Prijungti prie kūrimo ir redagavimo**

Visose vietose, kur sudaroma `DueValue`, pridėti `repeat`:

- `src/ui/components/QuickAdd.tsx` — `EMPTY_DUE` gauna `repeat: null`, o `onCreate` perduoda `repeat: due.repeat`
- `src/ui/components/TaskCard.tsx` — vieta, kur atveriamas `DueEditor`, perduoda `repeat: task.repeat`
- `src/ui/components/Board.tsx`, `src/ui/digest/main.tsx` — `onReschedule` jau perduoda visą `DueValue` į `patchTask`, tad `repeat` keliauja savaime

- [ ] **Step 6: Paleisti viską**

Run: `npm test`
Expected: PASS

Run: `npm run typecheck` ir `npm run build`
Expected: švaru

- [ ] **Step 7: Rankinė patikra**

Run: `npm run app`

1. Sukurk užduotį, atverk termino redaktorių, pasirink „Kas antradienį" — terminas iškart pasikeičia į artimiausią antradienį
2. Kortelėje atsiranda `↻`; užvedus pele rodoma „kas antradienį"
3. Pažymėk atlikta — užduotis dingsta iš šiandienos ir atsiranda kito antradienio kolonoje, vis dar neatlikta
4. Ta pati elgsena pažymėjus iš tray langelio ir iš dienos apžvalgos
5. Nepasikartojanti užduotis pažymėta atlikta elgiasi kaip anksčiau

- [ ] **Step 8: Commit**

```bash
git add src/ui tests/ui
git commit -m "feat: kartojimo pasirinkimas ir ženklas kortelėje"
```

---

## Pabaigos patikra

- Užduotis kartojasi savaitės arba mėnesio diena
- Pažymėta atlikta peršoka į ateitį, net jei buvo pradelsta savaites
- Laikas ir žadintuvas išsaugomi
- Praleisti kartai lieka pradelsti — automatinio peršokimo nėra
- Kortelėje `↻`, be spalvos ir be teksto
- Migracija iš v1 nepraranda duomenų ir **palieka `tasks.db.bak`** — pirmas atsarginių kopijų bandymas
