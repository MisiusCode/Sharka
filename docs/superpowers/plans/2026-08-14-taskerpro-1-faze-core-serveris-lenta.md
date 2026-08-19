# TaskerPro 1 fazė: core + serveris + lenta — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pastatyti veikiančią užduočių sistemą — dalykinė logika, HTTP serveris ir kanban lenta naršyklėje, pasiekiama iš planšetės namų tinkle.

**Architecture:** Vienas Node procesas: `core/` laiko dalykinę logiką ir SQLite be jokių tinklo ar UI priklausomybių, `server/` yra plonas Express sluoksnis virš jo su SSE srautu, `ui/` — React aplikacija, kurią serveris atiduoda kaip statinius failus. Kolonų skaičiavimas gyvena `core/buckets.ts` ir yra grynos funkcijos be priklausomybių, todėl tą patį kodą naudoja ir testai, ir naršyklės paketas.

**Tech Stack:** TypeScript (strict), Node 22+, Express 5, better-sqlite3, React 18, Vite, @dnd-kit/core, Vitest, supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-14-taskerpro-design.md`

## Global Constraints

Šios taisyklės galioja kiekvienai užduočiai plane.

- **Node 22+**, TypeScript `strict: true`. Jokio `any` viešose signatūrose. (Riba pakelta nuo 20 vykdymo metu: `better-sqlite3` 13.x reikalauja `>=22`, o kūrimo mašinoje sukasi Node 24. Riba užrašoma ir `package.json` `engines` lauke.)
- **`strict: true` nereiškia `noUncheckedIndexedAccess` ar `exactOptionalPropertyTypes`.** Šie du yra atskiri jungikliai, kuriuos naujas `tsc --init` įjungia savaime; plano kodas rašytas be jų, tad jie lieka išjungti.
- **Laikas `core/` moduliuose imamas tik per įšvirkščiamą `Clock`.** `new Date()` ir `Date.now()` už `systemClock` ribų yra klaida.
- **Datos formatas duomenų bazėje — vietinis sieninis laikas be laiko juostos:** `due_at` yra `YYYY-MM-DD` (kai `due_has_time = 0`) arba `YYYY-MM-DDTHH:mm` (kai `= 1`). `remind_at` visada `YYYY-MM-DDTHH:mm`. Sistema veikia vienoje laiko juostoje, tad UTC konvertavimas tik kurtų klaidų. `created_at`, `updated_at`, `completed_at`, `reminded_at` yra momentai — pilnas ISO su `Z`.
- **`due_at IS NULL` reiškia „šiandien".** Data rašoma tik atidedant į ateitį.
- **Nėra rankinio rikiavimo kolonoje.** Rūšiavimas visada: `due_at` didėjimo tvarka (NULL gale), tada `priority` (1 pirmas), tada `created_at`.
- **Serveris klausosi `0.0.0.0`.** Autentikacijos nėra sąmoningai.
- **`src/core/buckets.ts`, `src/core/datetime.ts` ir `src/core/timeinput.ts` importuoja tik vienas kitą ir `./types`** — jokių Node įtaisytųjų modulių, jokio `better-sqlite3`, jokio Express. Juos importuoja naršyklės paketas, tad bet kokia serverio priklausomybė ten sulaužytų build'ą.
- **Reliatyvūs importai rašomi su `.js` galūne**, nors failai yra `.ts` ir `.tsx` (`import { openDb } from './db.js'`). Tai ESM konvencija; ir Vite, ir `tsx` ją perrašo į `.ts`. Netaisyk jų į beplėtinius — importai turi būti vienodi visame projekte.
- **Sąsajos tekstai — lietuviški**, tikslios eilutės nurodytos užduotyse.
- **Spalva lentoje naudojama tik prioritetui** (raudona / geltona / pilka) plius raudonas tekstas pradelstoms. Visa kita — pilkų atspalviai. **Išimtis: laikinos būsenos juostos** („Nėra ryšio su serveriu", klaidos) naudoja pilną raudoną foną. Taisyklė galioja kortelėms ir kolonoms — nuolat matomam turiniui; ryšio praradimo pranešimas, kurio nepastebi, yra blogesnis už spalvos discipliną.
- Kiekviena užduotis baigiasi commit'u.

---

## Failų struktūra

```
package.json              tsconfig.json           vite.config.ts
vitest.config.ts          playwright.config.ts

src/core/                 dalykinė logika, be tinklo ir be DOM
  types.ts                Task, TaskInput, TaskPatch, Status, Priority
  clock.ts                Clock sąsaja, systemClock, fixedClock
  datetime.ts             vietinio laiko formatavimas ir datų aritmetika
  buckets.ts              kolonų priskyrimas, tempimo taisyklės, rūšiavimas
  timeinput.ts            laiko įvesties atpažinimas, termino sudarymas
  db.ts                   ryšys, schema, migracijos
  tasks.ts                createTaskStore — CRUD ir šoniniai efektai
  settings.ts             createSettingsStore — numatytosios reikšmės

src/server/               plonas transporto sluoksnis
  events.ts               SSE centras
  routes/tasks.ts         /api/tasks
  routes/settings.ts      /api/settings
  app.ts                  createApp — Express surinkimas
  index.ts                paleidimas, porto atsarginis variantas

src/ui/                   React aplikacija
  index.html              main.tsx              api.ts
  theme.css               components/*.tsx

tests/core/  tests/server/  tests/e2e/
```

Kiekvienas `core/` failas turi vieną atsakomybę ir yra testuojamas be serverio. `server/` failuose dalykinių taisyklių nėra — tik validacija ir maršrutai.

---

### Task 1: Projekto karkasas, laikrodis ir datų pagalbinės funkcijos

Visas planas remiasi įšvirkščiamu laikrodžiu, tad jis statomas pirmas.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/core/types.ts`, `src/core/clock.ts`, `src/core/datetime.ts`
- Test: `tests/core/datetime.test.ts`

**Interfaces:**
- Consumes: nieko
- Produces: `Clock { now(): Date }`, `systemClock`, `fixedClock(iso) → Clock & { set(iso), advance(ms) }`, `formatLocalDate(d): string`, `formatLocalDateTime(d): string`, `addDays(dateStr, n): string`, `dateOf(dueAt): string`, `timeOf(dueAt): string | null`, tipai `Task`, `TaskInput`, `TaskPatch`, `Status`, `Priority`

- [ ] **Step 1: Sukurti projektą ir įdiegti priklausomybes**

```bash
npm init -y
npm i express better-sqlite3
npm i -D typescript @types/node @types/express @types/better-sqlite3 vitest supertest @types/supertest
npx tsc --init
```

Į `package.json` įrašyti `"type": "module"` ir skriptus:

```json
{
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json` privalomos reikšmės: `"strict": true`, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"target": "ES2022"`, `"verbatimModuleSyntax": true`.

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

`.gitignore` jau egzistuoja ir yra užcommitintas — jo **neperrašyk**. Patikrink, kad jame yra `node_modules/`, `dist/`, `*.db`, `*.db.bak`, `test-results/`, `playwright-report/`; jei ko trūksta, tik pridėk trūkstamas eilutes.

- [ ] **Step 2: Parašyti krentantį testą**

`tests/core/datetime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/core/clock.js';
import { addDays, dateOf, formatLocalDate, formatLocalDateTime, timeOf } from '../../src/core/datetime.js';

describe('fixedClock', () => {
  it('grąžina nustatytą laiką ir leidžia jį pastumti', () => {
    const clock = fixedClock('2026-08-14T10:00:00');
    expect(formatLocalDateTime(clock.now())).toBe('2026-08-14T10:00');
    clock.advance(90 * 60 * 1000);
    expect(formatLocalDateTime(clock.now())).toBe('2026-08-14T11:30');
  });
});

describe('datetime', () => {
  it('formatuoja vietinę datą su nuliais', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05');
    expect(formatLocalDateTime(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
  });

  it('prideda dienas per mėnesio ir metų ribą', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-28', 8)).toBe('2027-01-05');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('atskiria datos ir laiko dalis', () => {
    expect(dateOf('2026-08-14T18:00')).toBe('2026-08-14');
    expect(dateOf('2026-08-14')).toBe('2026-08-14');
    expect(timeOf('2026-08-14T18:00')).toBe('18:00');
    expect(timeOf('2026-08-14')).toBeNull();
  });
});
```

- [ ] **Step 3: Paleisti testą ir įsitikinti, kad krenta**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../../src/core/clock.js"`

- [ ] **Step 4: Parašyti tipus**

`src/core/types.ts`:

```ts
export type Status = 'todo' | 'doing' | 'done';
export type Priority = 1 | 2 | 3;

export interface Task {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  due_at: string | null;
  due_has_time: boolean;
  remind_at: string | null;
  reminded_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskInput {
  title: string;
  due_at?: string | null;
  due_has_time?: boolean;
  remind_at?: string | null;
  priority?: Priority;
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'status' | 'priority' | 'due_at' | 'due_has_time' | 'remind_at'>
>;
```

- [ ] **Step 5: Parašyti laikrodį**

`src/core/clock.ts`:

```ts
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface FixedClock extends Clock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function fixedClock(iso: string): FixedClock {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next: string) => { current = new Date(next); },
    advance: (ms: number) => { current = new Date(current.getTime() + ms); },
  };
}
```

- [ ] **Step 6: Parašyti datų funkcijas**

`src/core/datetime.ts`:

```ts
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
```

`addDays` sąmoningai sukonstruoja `Date` iš atskirų komponentų — `new Date('2026-01-31')` būtų perskaityta kaip UTC ir vietinėse juostose į rytus nuo Grinvičo duotų dieną anksčiau.

- [ ] **Step 7: Paleisti testus**

Run: `npm test`
Expected: PASS, 4 testai

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/core tests/core
git commit -m "feat: projekto karkasas, įšvirkščiamas laikrodis ir datų funkcijos"
```

---

### Task 2: Duomenų bazė ir migracijos

**Files:**
- Create: `src/core/db.ts`
- Test: `tests/core/db.test.ts`

**Interfaces:**
- Consumes: nieko iš ankstesnių užduočių
- Produces: `openDb(path: string): Database` (tipas iš `better-sqlite3`), `SCHEMA_VERSION: number`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/db.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, openDb } from '../../src/core/db.js';

describe('openDb', () => {
  it('sukuria lenteles tuščioje bazėje', () => {
    const db = openDb(':memory:');
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain('tasks');
    expect(names).toContain('settings');
  });

  it('įrašo schemos versiją', () => {
    const db = openDb(':memory:');
    const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
    expect((row as { value: string }).value).toBe(String(SCHEMA_VERSION));
  });

  it('pakartotinis atidarymas nieko nesulaužo', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('a', 'Testas', '2026-08-14T10:00:00Z', '2026-08-14T10:00:00Z')",
    ).run();
    const count = db.prepare('SELECT COUNT(*) AS n FROM tasks').get();
    expect((count as { n: number }).n).toBe(1);
  });

  it('įjungia svetimų raktų ir WAL režimą', () => {
    const db = openDb(':memory:');
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });

  it('naujai bazei ir pakartotinai ją atidarius kopijos nedaro', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskerpro-'));
    const path = join(dir, 'tasks.db');

    openDb(path).close();
    expect(existsSync(`${path}.bak`)).toBe(false);

    // Regresijos sargas: pakartotinis atidarymas migracijos nevykdo, tad ir
    // kopijos neturi būti — kitaip ji perrašytų priešmigracinę kopiją.
    openDb(path).close();
    expect(existsSync(`${path}.bak`)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it('backupBeforeMigrate duoda pilną kopiją su duomenimis', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskerpro-'));
    const path = join(dir, 'tasks.db');

    const db = openDb(path);
    db.prepare(
      'INSERT INTO tasks (id, title, created_at, updated_at) ' +
        "VALUES ('a', 'Nupirkti pieną', '2026-08-14T10:00:00Z', '2026-08-14T10:00:00Z')",
    ).run();
    backupBeforeMigrate(db, path);
    db.close();

    const copy = openDb(`${path}.bak`);
    const row = copy.prepare("SELECT title FROM tasks WHERE id = 'a'").get();
    expect((row as { title: string }).title).toBe('Nupirkti pieną');
    copy.close();

    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/db.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/db.js"`

- [ ] **Step 3: Parašyti minimalią realizaciją**

`src/core/db.ts`:

```ts
import Database from 'better-sqlite3';
import { copyFileSync, existsSync } from 'node:fs';

export const SCHEMA_VERSION = 1;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE tasks (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'todo',
    priority      INTEGER NOT NULL DEFAULT 2,
    due_at        TEXT,
    due_has_time  INTEGER NOT NULL DEFAULT 0,
    remind_at     TEXT,
    reminded_at   TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    completed_at  TEXT
  );
  CREATE INDEX idx_tasks_due ON tasks(due_at);
  CREATE INDEX idx_tasks_remind ON tasks(remind_at) WHERE remind_at IS NOT NULL;
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

function currentVersion(db: Database.Database): number {
  const hasSettings = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
    .get();
  if (!hasSettings) return 0;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
  return row ? Number((row as { value: string }).value) : 0;
}

export function backupBeforeMigrate(db: Database.Database, path: string): void {
  const backup = `${path}.bak`;
  rmSync(backup, { force: true }); // VACUUM INTO nepavyksta, jei failas jau yra
  db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const from = currentVersion(db);
  if (from < SCHEMA_VERSION) {
    // Kopija daroma tik migruojant jau turinčią duomenų bazę.
    if (from > 0 && path !== ':memory:') backupBeforeMigrate(db, path);

    for (let v = from; v < SCHEMA_VERSION; v++) {
      db.exec(MIGRATIONS[v]);
    }
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('schema_version', ?) " +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(String(SCHEMA_VERSION));
  }
  return db;
}
```

Atsarginė kopija daroma **tik tada, kai realiai vykdoma migracija jau versijuotai bazei**. Pirmoji redakcija kopijavo kiekvieną atidarymą — tai reiškė, kad po sėkmingos migracijos kitas programos paleidimas perrašo priešmigracinę kopiją jau sumigruota, ir iki tol, kol pastebi problemą, kopija bevertė. Naujai kuriamai bazei kopijos nėra: nėra ko saugoti.

Kopijavimui naudojamas `VACUUM INTO`, o ne `copyFileSync`: WAL režimu dalis įrašytų duomenų gali gulėti `-wal` šoniniame faile, kurio paprastas failo kopijavimas nepaimtų. `VACUUM INTO` duoda nuoseklią visos bazės kopiją.

Kopija imama po `new Database(path)`, bet **prieš** bet kurią migraciją — apsauga nuo pusiau įvykdytos migracijos išlieka, nes bazės atidarymas pats savaime schemos nekeičia.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/db.test.ts`
Expected: PASS, 5 testai

- [ ] **Step 5: Commit**

```bash
git add src/core/db.ts tests/core/db.test.ts
git commit -m "feat: SQLite schema, migracijos ir atsarginė kopija"
```

---

### Task 3: Kolonų priskyrimas, tempimo taisyklės ir rūšiavimas

Grynos funkcijos, kurias naudoja ir naršyklė, ir testai. Jokių importų, išskyrus tipus ir `datetime`.

**Files:**
- Create: `src/core/buckets.ts`
- Test: `tests/core/buckets.test.ts`

**Interfaces:**
- Consumes: `Task`, `Status` iš `types.ts`; `addDays`, `dateOf`, `timeOf` iš `datetime.ts`
- Produces: `DateBucket = 'today' | 'tomorrow' | 'week' | 'later'`, `DATE_BUCKETS: DateBucket[]`, `dateBucketOf(task, today): DateBucket`, `isOverdue(task, today): boolean`, `dueForBucket(task, bucket, today): { due_at, due_has_time, remind_at }`, `sortTasks(tasks): Task[]`, `BUCKET_LABELS: Record<DateBucket, string>`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/buckets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/core/types.js';
import { dateBucketOf, dueForBucket, isOverdue, sortTasks } from '../../src/core/buckets.js';

const TODAY = '2026-08-14';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'x', title: 'Užduotis', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, ...over,
  };
}

describe('dateBucketOf', () => {
  it('bedatę deda į šiandien', () => {
    expect(dateBucketOf(task(), TODAY)).toBe('today');
  });

  it('pradelstą deda į šiandien', () => {
    expect(dateBucketOf(task({ due_at: '2026-07-01' }), TODAY)).toBe('today');
  });

  it('šiandienos ir rytdienos datas skiria', () => {
    expect(dateBucketOf(task({ due_at: '2026-08-14T18:00', due_has_time: true }), TODAY)).toBe('today');
    expect(dateBucketOf(task({ due_at: '2026-08-15' }), TODAY)).toBe('tomorrow');
  });

  it('savaitę skaičiuoja slenkamai: +2 ir +7 patenka, +8 ne', () => {
    expect(dateBucketOf(task({ due_at: '2026-08-16' }), TODAY)).toBe('week');
    expect(dateBucketOf(task({ due_at: '2026-08-21' }), TODAY)).toBe('week');
    expect(dateBucketOf(task({ due_at: '2026-08-22' }), TODAY)).toBe('later');
  });

  it('veikia per mėnesio ribą', () => {
    expect(dateBucketOf(task({ due_at: '2026-09-01' }), '2026-08-31')).toBe('tomorrow');
    expect(dateBucketOf(task({ due_at: '2028-02-29' }), '2028-02-28')).toBe('tomorrow');
  });
});

describe('isOverdue', () => {
  it('bedatė niekada nėra pradelsta', () => {
    expect(isOverdue(task(), TODAY)).toBe(false);
  });

  it('praėjusi data yra pradelsta, šiandienos ne', () => {
    expect(isOverdue(task({ due_at: '2026-08-13' }), TODAY)).toBe(true);
    expect(isOverdue(task({ due_at: '2026-08-14' }), TODAY)).toBe(false);
  });

  it('atlikta užduotis nerodoma kaip pradelsta', () => {
    expect(isOverdue(task({ due_at: '2026-08-13', status: 'done' }), TODAY)).toBe(false);
  });
});

describe('dueForBucket', () => {
  it('į šiandien be laiko — datą nuvalo', () => {
    const t = task({ due_at: '2026-08-20' });
    expect(dueForBucket(t, 'today', TODAY)).toEqual({ due_at: null, due_has_time: false, remind_at: null });
  });

  it('į šiandien su laiku — palieka valandą šiai dienai ir perkelia priminimą', () => {
    const t = task({ due_at: '2026-08-20T18:00', due_has_time: true, remind_at: '2026-08-20T18:00' });
    expect(dueForBucket(t, 'today', TODAY)).toEqual({
      due_at: '2026-08-14T18:00', due_has_time: true, remind_at: '2026-08-14T18:00',
    });
  });

  it('į rytoj, savaitę ir vėliau priskiria +1, +7 ir +8', () => {
    const t = task();
    expect(dueForBucket(t, 'tomorrow', TODAY).due_at).toBe('2026-08-15');
    expect(dueForBucket(t, 'week', TODAY).due_at).toBe('2026-08-21');
    expect(dueForBucket(t, 'later', TODAY).due_at).toBe('2026-08-22');
  });

  it('perkeliant laikas išsaugomas', () => {
    const t = task({ due_at: '2026-08-14T07:30', due_has_time: true, remind_at: '2026-08-14T07:30' });
    expect(dueForBucket(t, 'week', TODAY)).toEqual({
      due_at: '2026-08-21T07:30', due_has_time: true, remind_at: '2026-08-21T07:30',
    });
  });
});

describe('sortTasks', () => {
  it('pradelstos viršuje, bedatės gale, tarp jų pagal prioritetą', () => {
    const sorted = sortTasks([
      task({ id: 'bedatė-žemas', priority: 3 }),
      task({ id: 'bedatė-aukštas', priority: 1 }),
      task({ id: 'šiandien', due_at: '2026-08-14' }),
      task({ id: 'pradelsta', due_at: '2026-08-10' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([
      'pradelsta', 'šiandien', 'bedatė-aukštas', 'bedatė-žemas',
    ]);
  });

  it('esant vienodam terminui ir prioritetui rikiuoja pagal sukūrimą', () => {
    const sorted = sortTasks([
      task({ id: 'antra', created_at: '2026-08-02T10:00:00Z' }),
      task({ id: 'pirma', created_at: '2026-08-01T10:00:00Z' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['pirma', 'antra']);
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/buckets.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/buckets.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/core/buckets.ts`:

```ts
import { addDays, dateOf, timeOf } from './datetime.js';
import type { Task } from './types.js';

export type DateBucket = 'today' | 'tomorrow' | 'week' | 'later';

export const DATE_BUCKETS: DateBucket[] = ['today', 'tomorrow', 'week', 'later'];

export const BUCKET_LABELS: Record<DateBucket, string> = {
  today: 'Šiandien',
  tomorrow: 'Rytoj',
  week: 'Per savaitę',
  later: 'Vėliau',
};

export function dateBucketOf(task: Task, today: string): DateBucket {
  if (task.due_at === null) return 'today';
  const date = dateOf(task.due_at);
  if (date <= today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  if (date <= addDays(today, 7)) return 'week';
  return 'later';
}

export function isOverdue(task: Task, today: string): boolean {
  if (task.due_at === null || task.status === 'done') return false;
  return dateOf(task.due_at) < today;
}

export function dueForBucket(
  task: Task,
  bucket: DateBucket,
  today: string,
): { due_at: string | null; due_has_time: boolean; remind_at: string | null } {
  const time = task.due_at !== null && task.due_has_time ? timeOf(task.due_at) : null;

  if (bucket === 'today' && time === null) {
    return { due_at: null, due_has_time: false, remind_at: null };
  }

  const offsets: Record<DateBucket, number> = { today: 0, tomorrow: 1, week: 7, later: 8 };
  const date = addDays(today, offsets[bucket]);

  if (time === null) {
    return { due_at: date, due_has_time: false, remind_at: null };
  }
  return { due_at: `${date}T${time}`, due_has_time: true, remind_at: `${date}T${time}` };
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.due_at === null && b.due_at !== null) return 1;
    if (a.due_at !== null && b.due_at === null) return -1;
    if (a.due_at !== null && b.due_at !== null && a.due_at !== b.due_at) {
      return a.due_at < b.due_at ? -1 : 1;
    }
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}
```

Palyginimai su datomis daromi eilučių lyginimu — `YYYY-MM-DD` formatas leksikografiškai sutampa su chronologine tvarka, tad `Date` objektų kurti nereikia.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/buckets.test.ts`
Expected: PASS, 13 testų

- [ ] **Step 5: Commit**

```bash
git add src/core/buckets.ts tests/core/buckets.test.ts
git commit -m "feat: kolonų priskyrimas, tempimo taisyklės ir rūšiavimas"
```

---

### Task 4: Laiko įvesties atpažinimas ir termino sudarymas

**Files:**
- Create: `src/core/timeinput.ts`
- Test: `tests/core/timeinput.test.ts`

**Interfaces:**
- Consumes: `addDays`, `formatLocalDate` iš `datetime.ts`. **Ne `Clock`** — `resolveDue` ima `now: Date` tiesiogiai, nes `clock.ts` importas pažeistų naršyklei saugių modulių apribojimą.
- Produces: `parseTimeInput(raw: string): string | null` (grąžina `'HH:mm'`), `DateChoice = 'today' | 'tomorrow' | { date: string }`, `resolveDue(choice: DateChoice, time: string | null, now: Date): { due_at, due_has_time, remind_at }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/timeinput.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTimeInput, resolveDue } from '../../src/core/timeinput.js';

const NOW = new Date(2026, 7, 14, 10, 0); // 2026-08-14 10:00 vietinis

describe('parseTimeInput', () => {
  it('atpažįsta visus tris rašymo būdus', () => {
    expect(parseTimeInput('18')).toBe('18:00');
    expect(parseTimeInput('18:00')).toBe('18:00');
    expect(parseTimeInput('1800')).toBe('18:00');
    expect(parseTimeInput('9:05')).toBe('09:05');
    expect(parseTimeInput('0905')).toBe('09:05');
  });

  it('praleidžia tarpus ir tuščią eilutę laiko nelaiko', () => {
    expect(parseTimeInput('  18:30 ')).toBe('18:30');
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('   ')).toBeNull();
  });

  it('atmeta neteisingas reikšmes', () => {
    expect(parseTimeInput('25:00')).toBeNull();
    expect(parseTimeInput('18:60')).toBeNull();
    expect(parseTimeInput('abc')).toBeNull();
    expect(parseTimeInput('18:0:0')).toBeNull();
  });
});

describe('resolveDue', () => {
  it('šiandien be laiko reiškia jokios datos', () => {
    expect(resolveDue('today', null, NOW)).toEqual({ due_at: null, due_has_time: false, remind_at: null });
  });

  it('šiandien su laiku duoda žadintuvą šiai dienai', () => {
    expect(resolveDue('today', '18:00', NOW)).toEqual({
      due_at: '2026-08-14T18:00', due_has_time: true, remind_at: '2026-08-14T18:00',
    });
  });

  it('šiandien su jau praėjusia valanda perkelia į rytdieną', () => {
    expect(resolveDue('today', '08:00', NOW).due_at).toBe('2026-08-15T08:00');
  });

  it('rytoj be laiko duoda datą be žadintuvo', () => {
    expect(resolveDue('tomorrow', null, NOW)).toEqual({
      due_at: '2026-08-15', due_has_time: false, remind_at: null,
    });
  });

  it('konkreti data su laiku ir be jo', () => {
    expect(resolveDue({ date: '2026-09-01' }, '07:30', NOW).due_at).toBe('2026-09-01T07:30');
    expect(resolveDue({ date: '2026-09-01' }, null, NOW)).toEqual({
      due_at: '2026-09-01', due_has_time: false, remind_at: null,
    });
  });

  it('konkreti praeities data su praėjusiu laiku nekeliama į priekį', () => {
    expect(resolveDue({ date: '2026-08-14' }, '08:00', NOW).due_at).toBe('2026-08-14T08:00');
  });
});
```

Paskutinis testas fiksuoja svarbų skirtumą: „į rytdieną" keliama tik tada, kai naudotojas datos **nenurodė** — jei jis sąmoningai pasirinko konkrečią datą, jo pasirinkimas nekeičiamas.

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/timeinput.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/timeinput.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/core/timeinput.ts`:

```ts
import { addDays, formatLocalDate } from './datetime.js';

export type DateChoice = 'today' | 'tomorrow' | { date: string };

export function parseTimeInput(raw: string): string | null {
  const s = raw.trim();
  if (s === '') return null;

  let hours: number;
  let minutes: number;

  if (/^\d{1,2}$/.test(s)) {
    hours = Number(s);
    minutes = 0;
  } else if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    hours = Number(h);
    minutes = Number(m);
  } else if (/^\d{4}$/.test(s)) {
    hours = Number(s.slice(0, 2));
    minutes = Number(s.slice(2));
  } else {
    return null;
  }

  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function resolveDue(
  choice: DateChoice,
  time: string | null,
  now: Date,
): { due_at: string | null; due_has_time: boolean; remind_at: string | null } {
  if (choice === 'today' && time === null) {
    return { due_at: null, due_has_time: false, remind_at: null };
  }

  const today = formatLocalDate(now);
  let date: string;

  if (choice === 'today') {
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    date = time !== null && time <= nowTime ? addDays(today, 1) : today;
  } else if (choice === 'tomorrow') {
    date = addDays(today, 1);
  } else {
    date = choice.date;
  }

  if (time === null) {
    return { due_at: date, due_has_time: false, remind_at: null };
  }
  return { due_at: `${date}T${time}`, due_has_time: true, remind_at: `${date}T${time}` };
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/timeinput.test.ts`
Expected: PASS, 9 testų

- [ ] **Step 5: Commit**

```bash
git add src/core/timeinput.ts tests/core/timeinput.test.ts
git commit -m "feat: laiko įvesties atpažinimas ir termino sudarymas"
```

---

### Task 5: Užduočių saugykla ir šoniniai efektai

Čia gyvena taisyklė, kuri specifikacijos savirevizijoje buvo rasta kaip trūkstama: **pakeitus `remind_at` arba `due_at`, `reminded_at` nuvalomas.**

**Files:**
- Create: `src/core/tasks.ts`
- Test: `tests/core/tasks.test.ts`

**Interfaces:**
- Consumes: `openDb` iš `db.ts`; `Clock` iš `clock.ts`; `Task`, `TaskInput`, `TaskPatch` iš `types.ts`
- Produces: `createTaskStore(db, clock): TaskStore` su metodais `list(): Task[]`, `get(id): Task | null`, `create(input): Task`, `update(id, patch): Task | null`, `remove(id): boolean`, `snooze(id, minutes): Task | null`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/tasks.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { createTaskStore, type TaskStore } from '../../src/core/tasks.js';

let store: TaskStore;
let clock: ReturnType<typeof fixedClock>;

beforeEach(() => {
  clock = fixedClock('2026-08-14T10:00:00');
  store = createTaskStore(openDb(':memory:'), clock);
});

describe('create', () => {
  it('užpildo numatytąsias reikšmes', () => {
    const t = store.create({ title: 'Nupirkti pieną' });
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.status).toBe('todo');
    expect(t.priority).toBe(2);
    expect(t.due_at).toBeNull();
    expect(t.due_has_time).toBe(false);
    expect(t.completed_at).toBeNull();
    expect(t.created_at).toBe(clock.now().toISOString());
  });

  it('nukerpa tarpus ir atmeta tuščią pavadinimą', () => {
    expect(store.create({ title: '  Pieną  ' }).title).toBe('Pieną');
    expect(() => store.create({ title: '   ' })).toThrow('Tuščias pavadinimas');
  });

  it('priima terminą ir priminimą', () => {
    const t = store.create({
      title: 'Skambutis', due_at: '2026-08-15T18:00', due_has_time: true, remind_at: '2026-08-15T18:00', priority: 1,
    });
    expect(t.due_has_time).toBe(true);
    expect(t.remind_at).toBe('2026-08-15T18:00');
    expect(t.priority).toBe(1);
  });
});

describe('update', () => {
  it('pažymėjus atlikta užpildo completed_at ir nutildo žadintuvą', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T18:00' });
    clock.advance(60_000);
    const done = store.update(t.id, { status: 'done' })!;
    expect(done.completed_at).toBe(clock.now().toISOString());
    expect(done.reminded_at).toBe(clock.now().toISOString());
  });

  it('grąžinus iš atlikta nuvalo completed_at', () => {
    const t = store.create({ title: 'X' });
    store.update(t.id, { status: 'done' });
    expect(store.update(t.id, { status: 'todo' })!.completed_at).toBeNull();
  });

  it('pakeitus remind_at nuvalo reminded_at', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T18:00' });
    store.update(t.id, { status: 'done' });
    store.update(t.id, { status: 'todo' });
    const moved = store.update(t.id, { remind_at: '2026-08-15T18:00' })!;
    expect(moved.reminded_at).toBeNull();
  });

  it('pakeitus due_at nuvalo reminded_at', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T18:00' });
    store.update(t.id, { status: 'done' });
    store.update(t.id, { status: 'todo' });
    const moved = store.update(t.id, { due_at: '2026-08-16' })!;
    expect(moved.reminded_at).toBeNull();
  });

  it('atnaujina updated_at ir grąžina null nežinomam id', () => {
    const t = store.create({ title: 'X' });
    clock.advance(60_000);
    expect(store.update(t.id, { title: 'Y' })!.updated_at).toBe(clock.now().toISOString());
    expect(store.update('nėra-tokio', { title: 'Y' })).toBeNull();
  });
});

describe('snooze', () => {
  it('perkelia priminimą į priekį ir leidžia jam vėl suveikti', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T10:00' });
    store.update(t.id, { status: 'done' });
    store.update(t.id, { status: 'todo' });
    const snoozed = store.snooze(t.id, 10)!;
    expect(snoozed.remind_at).toBe('2026-08-14T10:10');
    expect(snoozed.reminded_at).toBeNull();
  });
});

describe('list ir remove', () => {
  it('grąžina visas ir ištrina pagal id', () => {
    store.create({ title: 'A' });
    const b = store.create({ title: 'B' });
    expect(store.list()).toHaveLength(2);
    expect(store.remove(b.id)).toBe(true);
    expect(store.remove(b.id)).toBe(false);
    expect(store.list().map((t) => t.title)).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/tasks.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/tasks.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/core/tasks.ts`:

```ts
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Clock } from './clock.js';
import { formatLocalDateTime } from './datetime.js';
import type { Task, TaskInput, TaskPatch } from './types.js';

export interface TaskStore {
  list(): Task[];
  get(id: string): Task | null;
  create(input: TaskInput): Task;
  update(id: string, patch: TaskPatch): Task | null;
  remove(id: string): boolean;
  snooze(id: string, minutes: number): Task | null;
}

interface Row extends Omit<Task, 'due_has_time'> {
  due_has_time: number;
}

const toTask = (row: Row): Task => ({ ...row, due_has_time: row.due_has_time === 1 });

const PATCHABLE = ['title', 'status', 'priority', 'due_at', 'due_has_time', 'remind_at'] as const;

export function createTaskStore(db: Database.Database, clock: Clock): TaskStore {
  const selectAll = db.prepare('SELECT * FROM tasks');
  const selectOne = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const deleteOne = db.prepare('DELETE FROM tasks WHERE id = ?');

  const get = (id: string): Task | null => {
    const row = selectOne.get(id) as Row | undefined;
    return row ? toTask(row) : null;
  };

  const writeFields = (id: string, fields: Record<string, unknown>): Task | null => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return get(id);
    const assignments = keys.map((k) => `${k} = @${k}`).join(', ');
    const info = db
      .prepare(`UPDATE tasks SET ${assignments} WHERE id = @id`)
      .run({ ...fields, id });
    return info.changes === 0 ? null : get(id);
  };

  return {
    list: () => (selectAll.all() as Row[]).map(toTask),
    get,

    create(input) {
      const title = input.title.trim();
      if (title === '') throw new Error('Tuščias pavadinimas');

      const now = clock.now().toISOString();
      const task: Task = {
        id: randomUUID(),
        title,
        status: 'todo',
        priority: input.priority ?? 2,
        due_at: input.due_at ?? null,
        due_has_time: input.due_has_time ?? false,
        remind_at: input.remind_at ?? null,
        reminded_at: null,
        created_at: now,
        updated_at: now,
        completed_at: null,
      };

      db.prepare(
        `INSERT INTO tasks (id, title, status, priority, due_at, due_has_time, remind_at,
                            reminded_at, created_at, updated_at, completed_at)
         VALUES (@id, @title, @status, @priority, @due_at, @due_has_time, @remind_at,
                 @reminded_at, @created_at, @updated_at, @completed_at)`,
      ).run({ ...task, due_has_time: task.due_has_time ? 1 : 0 });

      return task;
    },

    update(id, patch) {
      const before = get(id);
      if (before === null) return null;

      const now = clock.now().toISOString();
      const fields: Record<string, unknown> = { updated_at: now };

      for (const key of PATCHABLE) {
        if (patch[key] === undefined) continue;
        fields[key] = key === 'due_has_time' ? (patch.due_has_time ? 1 : 0) : patch[key];
      }

      if (patch.status !== undefined && patch.status !== before.status) {
        if (patch.status === 'done') {
          fields.completed_at = now;
          fields.reminded_at = now;
        } else if (before.status === 'done') {
          fields.completed_at = null;
        }
      }

      const timingChanged =
        (patch.remind_at !== undefined && patch.remind_at !== before.remind_at) ||
        (patch.due_at !== undefined && patch.due_at !== before.due_at);
      if (timingChanged) fields.reminded_at = null;

      return writeFields(id, fields);
    },

    remove: (id) => deleteOne.run(id).changes > 0,

    snooze(id, minutes) {
      if (get(id) === null) return null;
      const target = new Date(clock.now().getTime() + minutes * 60_000);
      return writeFields(id, {
        remind_at: formatLocalDateTime(target),
        reminded_at: null,
        updated_at: clock.now().toISOString(),
      });
    },
  };
}
```

Atkreiptinas dėmesys į eiliškumą `update` viduje: pažymėjus atlikta `reminded_at` užpildomas, bet jei tuo pačiu kreipiniu keičiamas ir terminas, `timingChanged` šaka jį nuvalo. Tai sąmoninga — naujas laikas visada nusveria seną nutildymą.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/tasks.test.ts`
Expected: PASS, 10 testų

- [ ] **Step 5: Commit**

```bash
git add src/core/tasks.ts tests/core/tasks.test.ts
git commit -m "feat: užduočių saugykla su šoniniais efektais"
```

---

### Task 6: Nustatymų saugykla

**Files:**
- Create: `src/core/settings.ts`
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: `openDb` iš `db.ts`
- Produces: `SETTING_DEFAULTS`, `SettingsMap`, `createSettingsStore(db): { getAll(): SettingsMap; patch(values: Partial<SettingsMap>): SettingsMap }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/settings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/core/db.js';
import { createSettingsStore } from '../../src/core/settings.js';

let store: ReturnType<typeof createSettingsStore>;

beforeEach(() => {
  store = createSettingsStore(openDb(':memory:'));
});

it('grąžina numatytąsias reikšmes tuščioje bazėje', () => {
  expect(store.getAll()).toEqual({
    grouping: 'date',
    theme: 'system',
    sound: 'alarms',
    digest_times: ['10:00', '15:30'],
    port: 8080,
    hotkey: 'Ctrl+Alt+Space',
    autostart: true,
    last_digest: null,
  });
});

it('išsaugo pakeitimą ir palieka likusius nepaliestus', () => {
  const after = store.patch({ grouping: 'status', port: 9090 });
  expect(after.grouping).toBe('status');
  expect(after.port).toBe(9090);
  expect(after.theme).toBe('system');
  expect(store.getAll().grouping).toBe('status');
});

it('išlaiko sudėtinių reikšmių tipus', () => {
  const after = store.patch({ digest_times: ['09:00'], autostart: false });
  expect(after.digest_times).toEqual(['09:00']);
  expect(after.autostart).toBe(false);
});

it('atmeta nežinomą raktą', () => {
  expect(() => store.patch({ nesamas: 1 } as never)).toThrow('Nežinomas nustatymas: nesamas');
});

it('nerodo schema_version tarp nustatymų', () => {
  expect(store.getAll()).not.toHaveProperty('schema_version');
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/settings.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/core/settings.ts`:

```ts
import type Database from 'better-sqlite3';

export interface SettingsMap {
  grouping: 'date' | 'status';
  theme: 'light' | 'dark' | 'system';
  sound: 'always' | 'alarms' | 'off';
  digest_times: string[];
  port: number;
  hotkey: string;
  autostart: boolean;
  last_digest: string | null;
}

export const SETTING_DEFAULTS: SettingsMap = Object.freeze({
  grouping: 'date',
  theme: 'system',
  sound: 'alarms',
  digest_times: Object.freeze(['10:00', '15:30']) as string[],
  port: 8080,
  hotkey: 'Ctrl+Alt+Space',
  autostart: true,
  last_digest: null,
}) as SettingsMap;

const KEYS = Object.keys(SETTING_DEFAULTS) as (keyof SettingsMap)[];

export function createSettingsStore(db: Database.Database) {
  const selectAll = db.prepare('SELECT key, value FROM settings');
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );

  const getAll = (): SettingsMap => {
    const stored = new Map(
      (selectAll.all() as { key: string; value: string }[]).map((r) => [r.key, r.value]),
    );
    // Gili kopija: paviršinė grąžintų tą patį digest_times masyvą kiekvienam
    // kvietėjui, tad vienas jį pakeitęs sugadintų numatytąsias reikšmes visiems.
    const result = structuredClone(SETTING_DEFAULTS);
    for (const key of KEYS) {
      const raw = stored.get(key);
      if (raw !== undefined) {
        (result as Record<string, unknown>)[key] = JSON.parse(raw);
      }
    }
    return result;
  };

  return {
    getAll,
    patch(values: Partial<SettingsMap>): SettingsMap {
      for (const key of Object.keys(values)) {
        if (!KEYS.includes(key as keyof SettingsMap)) {
          throw new Error(`Nežinomas nustatymas: ${key}`);
        }
      }
      const write = db.transaction((entries: [string, unknown][]) => {
        for (const [key, value] of entries) upsert.run(key, JSON.stringify(value));
      });
      write(Object.entries(values));
      return getAll();
    },
  };
}
```

Visos reikšmės saugomos kaip JSON — todėl `port` grįžta skaičiumi, `autostart` loginiu tipu, o `digest_times` masyvu, be jokio tipų spėliojimo. `schema_version` nepatenka į rezultatą, nes jo nėra `KEYS` sąraše.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS, 5 testai

- [ ] **Step 5: Commit**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat: nustatymų saugykla su numatytosiomis reikšmėmis"
```

---

### Task 7: SSE įvykių centras

**Files:**
- Create: `src/server/events.ts`
- Test: `tests/server/events.test.ts`

**Interfaces:**
- Consumes: nieko
- Produces: `createEventHub(): { subscribe(res: Response): () => void; broadcast(type: string): void; count(): number }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/server/events.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { createEventHub } from '../../src/server/events.js';

function fakeResponse() {
  return {
    write: vi.fn(),
    writeHead: vi.fn(),
    flushHeaders: vi.fn(),
  } as unknown as Response & { write: ReturnType<typeof vi.fn> };
}

describe('createEventHub', () => {
  it('nusiunčia įvykį visiems prenumeratoriams', () => {
    const hub = createEventHub();
    const a = fakeResponse();
    const b = fakeResponse();
    hub.subscribe(a);
    hub.subscribe(b);

    hub.broadcast('tasks-changed');

    expect(a.write).toHaveBeenCalledWith('data: {"type":"tasks-changed"}\n\n');
    expect(b.write).toHaveBeenCalledWith('data: {"type":"tasks-changed"}\n\n');
  });

  it('atsijungęs prenumeratorius nebegauna įvykių', () => {
    const hub = createEventHub();
    const a = fakeResponse();
    const unsubscribe = hub.subscribe(a);
    expect(hub.count()).toBe(1);

    unsubscribe();
    hub.broadcast('tasks-changed');

    expect(hub.count()).toBe(0);
    expect(a.write).not.toHaveBeenCalled();
  });

  it('nustato SSE antraštes prisijungus', () => {
    const hub = createEventHub();
    const a = fakeResponse();
    hub.subscribe(a);
    expect(a.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/server/events.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/server/events.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/server/events.ts`:

```ts
import type { Response } from 'express';

export interface EventHub {
  subscribe(res: Response): () => void;
  broadcast(type: string): void;
  count(): number;
}

export function createEventHub(): EventHub {
  const clients = new Set<Response>();

  return {
    subscribe(res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      clients.add(res);
      return () => { clients.delete(res); };
    },

    broadcast(type) {
      const payload = `data: ${JSON.stringify({ type })}\n\n`;
      for (const res of clients) res.write(payload);
    },

    count: () => clients.size,
  };
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/server/events.test.ts`
Expected: PASS, 3 testai

- [ ] **Step 5: Commit**

```bash
git add src/server/events.ts tests/server/events.test.ts
git commit -m "feat: SSE įvykių centras"
```

---

### Task 8: REST API — užduotys ir nustatymai

**Files:**
- Create: `src/server/routes/tasks.ts`, `src/server/routes/settings.ts`, `src/server/app.ts`
- Test: `tests/server/api.test.ts`

**Interfaces:**
- Consumes: `TaskStore` iš `core/tasks.ts`; `createSettingsStore` rezultatas iš `core/settings.ts`; `EventHub` iš `server/events.ts`
- Produces: `createApp(deps: { tasks: TaskStore; settings: SettingsStore; events: EventHub; uiDir?: string }): express.Express`, `type SettingsStore = ReturnType<typeof createSettingsStore>`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/server/api.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { fixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { createSettingsStore } from '../../src/core/settings.js';
import { createTaskStore } from '../../src/core/tasks.js';
import { createEventHub } from '../../src/server/events.js';
import { createApp } from '../../src/server/app.js';

let app: ReturnType<typeof createApp>;
let events: ReturnType<typeof createEventHub>;
let broadcasts: string[];

beforeEach(() => {
  const db = openDb(':memory:');
  events = createEventHub();
  broadcasts = [];
  const spy = { ...events, broadcast: (t: string) => { broadcasts.push(t); } };
  app = createApp({
    tasks: createTaskStore(db, fixedClock('2026-08-14T10:00:00')),
    settings: createSettingsStore(db),
    events: spy,
  });
});

describe('POST /api/tasks', () => {
  it('sukuria užduotį ir praneša apie pokytį', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'Nupirkti pieną' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Nupirkti pieną');
    expect(res.body.due_at).toBeNull();
    expect(broadcasts).toEqual(['tasks-changed']);
  });

  it('atmeta tuščią pavadinimą su 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_title');
    expect(broadcasts).toEqual([]);
  });

  it('atmeta netinkamą prioritetą su 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'X', priority: 7 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_priority');
  });
});

describe('GET /api/tasks', () => {
  it('grąžina visas užduotis', async () => {
    await request(app).post('/api/tasks').send({ title: 'A' });
    await request(app).post('/api/tasks').send({ title: 'B' });
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.map((t: { title: string }) => t.title).sort()).toEqual(['A', 'B']);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('keičia būseną ir praneša', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A' });
    broadcasts.length = 0;
    const res = await request(app).patch(`/api/tasks/${created.body.id}`).send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completed_at).not.toBeNull();
    expect(broadcasts).toEqual(['tasks-changed']);
  });

  it('nežinomam id grąžina 404', async () => {
    const res = await request(app).patch('/api/tasks/nėra').send({ status: 'done' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('atmeta netinkamą būseną', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A' });
    const res = await request(app).patch(`/api/tasks/${created.body.id}`).send({ status: 'skraidymas' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_status');
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('ištrina ir grąžina 204, o antrą kartą 404', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A' });
    expect((await request(app).delete(`/api/tasks/${created.body.id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/tasks/${created.body.id}`)).status).toBe(404);
  });
});

describe('POST /api/tasks/:id/snooze', () => {
  it('perkelia priminimą', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'A', remind_at: '2026-08-14T10:00' });
    const res = await request(app).post(`/api/tasks/${created.body.id}/snooze`).send({ minutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.remind_at).toBe('2026-08-14T10:10');
  });
});

describe('/api/settings', () => {
  it('grąžina numatytąsias ir priima dalinį atnaujinimą', async () => {
    expect((await request(app).get('/api/settings')).body.grouping).toBe('date');
    const res = await request(app).patch('/api/settings').send({ grouping: 'status' });
    expect(res.status).toBe(200);
    expect(res.body.grouping).toBe('status');
    expect(res.body.theme).toBe('system');
  });

  it('atmeta nežinomą raktą su 400', async () => {
    const res = await request(app).patch('/api/settings').send({ nesamas: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_setting');
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/server/api.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/server/app.js"`

- [ ] **Step 3: Parašyti užduočių maršrutus**

`src/server/routes/tasks.ts`:

```ts
import { Router } from 'express';
import type { TaskStore } from '../../core/tasks.js';
import type { Priority, Status, TaskPatch } from '../../core/types.js';
import type { EventHub } from '../events.js';

const STATUSES: Status[] = ['todo', 'doing', 'done'];
const PRIORITIES: Priority[] = [1, 2, 3];

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function validatePatch(body: Record<string, unknown>): TaskPatch {
  const patch: TaskPatch = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      throw new ApiError(400, 'invalid_title', 'Pavadinimas negali būti tuščias');
    }
    patch.title = body.title.trim();
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as Status)) {
      throw new ApiError(400, 'invalid_status', 'Nežinoma būsena');
    }
    patch.status = body.status as Status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority as Priority)) {
      throw new ApiError(400, 'invalid_priority', 'Prioritetas turi būti 1, 2 arba 3');
    }
    patch.priority = body.priority as Priority;
  }
  if (body.due_at !== undefined) {
    if (body.due_at !== null && typeof body.due_at !== 'string') {
      throw new ApiError(400, 'invalid_due_at', 'Netinkamas terminas');
    }
    patch.due_at = body.due_at as string | null;
  }
  if (body.due_has_time !== undefined) patch.due_has_time = Boolean(body.due_has_time);
  if (body.remind_at !== undefined) {
    if (body.remind_at !== null && typeof body.remind_at !== 'string') {
      throw new ApiError(400, 'invalid_remind_at', 'Netinkamas priminimo laikas');
    }
    patch.remind_at = body.remind_at as string | null;
  }

  return patch;
}

export function tasksRouter(tasks: TaskStore, events: EventHub): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(tasks.list());
  });

  router.post('/', (req, res) => {
    const patch = validatePatch(req.body as Record<string, unknown>);
    if (patch.title === undefined) {
      throw new ApiError(400, 'invalid_title', 'Pavadinimas negali būti tuščias');
    }
    const created = tasks.create({
      title: patch.title,
      due_at: patch.due_at,
      due_has_time: patch.due_has_time,
      remind_at: patch.remind_at,
      priority: patch.priority,
    });
    events.broadcast('tasks-changed');
    res.status(201).json(created);
  });

  router.patch('/:id', (req, res) => {
    const updated = tasks.update(req.params.id, validatePatch(req.body as Record<string, unknown>));
    if (updated === null) throw new ApiError(404, 'not_found', 'Užduotis nerasta');
    events.broadcast('tasks-changed');
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    if (!tasks.remove(req.params.id)) throw new ApiError(404, 'not_found', 'Užduotis nerasta');
    events.broadcast('tasks-changed');
    res.status(204).end();
  });

  router.post('/:id/snooze', (req, res) => {
    const minutes = Number((req.body as { minutes?: unknown }).minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new ApiError(400, 'invalid_minutes', 'Minutės turi būti teigiamas skaičius');
    }
    const updated = tasks.snooze(req.params.id, minutes);
    if (updated === null) throw new ApiError(404, 'not_found', 'Užduotis nerasta');
    events.broadcast('tasks-changed');
    res.json(updated);
  });

  return router;
}

export { ApiError };
```

- [ ] **Step 4: Parašyti nustatymų maršrutus**

`src/server/routes/settings.ts`:

```ts
import { Router } from 'express';
import type { createSettingsStore } from '../../core/settings.js';
import { ApiError } from './tasks.js';

export type SettingsStore = ReturnType<typeof createSettingsStore>;

export function settingsRouter(settings: SettingsStore): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(settings.getAll());
  });

  router.patch('/', (req, res) => {
    try {
      res.json(settings.patch(req.body as Record<string, never>));
    } catch (err) {
      throw new ApiError(400, 'invalid_setting', (err as Error).message);
    }
  });

  return router;
}
```

- [ ] **Step 5: Surinkti Express aplikaciją**

`src/server/app.ts`:

```ts
import express from 'express';
import type { TaskStore } from '../core/tasks.js';
import type { EventHub } from './events.js';
import { ApiError, tasksRouter } from './routes/tasks.js';
import { settingsRouter, type SettingsStore } from './routes/settings.js';

export interface AppDeps {
  tasks: TaskStore;
  settings: SettingsStore;
  events: EventHub;
  uiDir?: string;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(express.json());

  app.use('/api/tasks', tasksRouter(deps.tasks, deps.events));
  app.use('/api/settings', settingsRouter(deps.settings));

  app.get('/api/events', (req, res) => {
    const unsubscribe = deps.events.subscribe(res);
    req.on('close', unsubscribe);
  });

  if (deps.uiDir !== undefined) {
    app.use(express.static(deps.uiDir));
    // Express 5 naudoja path-to-regexp v8: plikas '*' yra nevalidus kelias ir
    // meta klaidą jau registruojant maršrutą. Pavadintas pakaitos simbolis.
    app.get('/*splat', (_req, res) => { res.sendFile('index.html', { root: deps.uiDir }); });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Vidinė klaida' } });
  });

  return app;
}
```

Express 5 sinchroniškai mestas klaidas iš maršruto perduoda klaidų apdorojikliui automatiškai, tad `try/catch` kiekviename maršrute nereikalingas.

**Du Express 5 skirtumai, kuriuos privalu turėti galvoje** (projektas naudoja 5.x, nors pirmoji plano redakcija rėmėsi 4.x):

1. `express.json()` **nebenustato `req.body = {}`**, kai turinio tipas nėra JSON. Užklausa be `Content-Type` palieka `req.body` kaip `undefined`, tad kiekvienas maršrutas privalo jį normalizuoti — `(req.body ?? {})` — kitaip validacija mestų `TypeError` ir naudotojas gautų 500 vietoj 400.
2. Kelių šablonams naudojamas path-to-regexp v8, kuriame **plikas `'*'` yra nevalidus** ir meta klaidą jau registruojant maršrutą. Naudojamas pavadintas pakaitos simbolis `'/*splat'`.

- [ ] **Step 6: Paleisti testus**

Run: `npx vitest run tests/server/api.test.ts`
Expected: PASS, 11 testų

- [ ] **Step 7: Commit**

```bash
git add src/server tests/server/api.test.ts
git commit -m "feat: REST API užduotims ir nustatymams"
```

---

### Task 9: Serverio paleidimas ir porto atsarginis variantas

**Files:**
- Create: `src/server/index.ts`
- Test: `tests/server/listen.test.ts`

**Interfaces:**
- Consumes: `createApp` iš `app.ts`
- Produces: `listenWithFallback(app, startPort, attempts): Promise<{ server: http.Server; port: number }>`, `dataDir(): string`, `startServer(): Promise<{ server, port }>`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/server/listen.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { listenWithFallback } from '../../src/server/index.js';

const open: Server[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe('listenWithFallback', () => {
  it('užimtą portą praleidžia ir pasiima kitą', async () => {
    const first = await listenWithFallback(express(), 0, 5);
    open.push(first.server);

    const second = await listenWithFallback(express(), first.port, 5);
    open.push(second.server);

    expect(second.port).toBe(first.port + 1);
  });

  it('išnaudojus bandymus meta klaidą', async () => {
    const held = await listenWithFallback(express(), 0, 5);
    open.push(held.server);

    await expect(listenWithFallback(express(), held.port, 1)).rejects.toThrow(
      /Nepavyko užimti porto/,
    );
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/server/listen.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/server/index.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/server/index.ts`:

```ts
import type { Express } from 'express';
import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { systemClock } from '../core/clock.js';
import { openDb } from '../core/db.js';
import { createSettingsStore } from '../core/settings.js';
import { createTaskStore } from '../core/tasks.js';
import { createApp } from './app.js';
import { createEventHub } from './events.js';

export function listenWithFallback(
  app: Express,
  startPort: number,
  attempts: number,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number, left: number): void => {
      const server = app.listen(port, '0.0.0.0');

      const onStartupError = (err: NodeJS.ErrnoException): void => {
        if (err.code !== 'EADDRINUSE' || left <= 1) {
          reject(
            err.code === 'EADDRINUSE'
              ? new Error(`Nepavyko užimti porto: ${port} ir gretimi užimti`)
              : err,
          );
          return;
        }
        tryPort(port + 1, left - 1);
      };

      server.once('error', onStartupError);

      server.once('listening', () => {
        // Paleidimo klaidų tvarkyklė nuimama sąmoningai. Palikta ji pirmą klaidą
        // po paleidimo praneštų jau įvykdytam reject (t. y. niekam), o `once` ją
        // pašalintų — antra klaida liktų be nė vieno klausytojo ir Node nukirstų
        // procesą neapdorota išimtimi. Nuolat veikiančiam serveriui to negalima.
        server.removeListener('error', onStartupError);
        server.on('error', (err) => {
          console.error('Serverio klaida po paleidimo:', err);
        });

        const address = server.address();
        const actual = typeof address === 'object' && address !== null ? address.port : port;
        resolve({ server, port: actual });
      });
    };

    tryPort(startPort, attempts);
  });
}

export function dataDir(): string {
  const base = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config');
  const dir = join(base, 'taskerpro');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function startServer(uiDir?: string): Promise<{ server: Server; port: number }> {
  const db = openDb(join(dataDir(), 'tasks.db'));
  const settings = createSettingsStore(db);
  const app = createApp({
    tasks: createTaskStore(db, systemClock),
    settings,
    events: createEventHub(),
    uiDir,
  });
  return listenWithFallback(app, settings.getAll().port, 5);
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/server/listen.test.ts`
Expected: PASS, 2 testai

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts tests/server/listen.test.ts
git commit -m "feat: serverio paleidimas su porto atsarginiu variantu"
```

---

### Task 10: UI karkasas, tema ir API klientas

**Files:**
- Create: `vite.config.ts`, `src/ui/index.html`, `src/ui/main.tsx`, `src/ui/api.ts`, `src/ui/theme.css`, `src/ui/vite-env.d.ts`, `tests/setup.ts`
- Test: `tests/ui/api.test.ts`

**Interfaces:**
- Consumes: `Task`, `TaskPatch` iš `core/types.ts`; `SettingsMap` iš `core/settings.ts`
- Produces: `fetchTasks()`, `createTask(input)`, `patchTask(id, patch)`, `deleteTask(id)`, `fetchSettings()`, `patchSettings(values)`, `subscribeToChanges(onChange, onStatus): () => void`, `ConnectionStatus = 'connected' | 'disconnected'`

- [ ] **Step 1: Įdiegti front-end priklausomybes**

```bash
npm i react react-dom @dnd-kit/core
npm i -D @vitejs/plugin-react @types/react @types/react-dom vite jsdom @testing-library/react @testing-library/user-event
```

`vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/ui',
  plugins: [react()], // be šito JSX neišsiverčia ir `npm run build:ui` lūžta
  build: { outDir: '../../dist/ui', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
```

Perrašyti `vitest.config.ts`, kad UI testai turėtų DOM:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
});
```

`jsdom` naudojamas **visiems** testams, ne tik UI. Vitest 3 versijoje `environmentMatchGlobs` nebėra, o jsdom aplinka sukasi tame pačiame Node procese — `better-sqlite3` ir `node:fs` joje veikia be jokių apribojimų, tad skirstyti aplinkas nėra reikalo.

`tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

```bash
npm i -D @testing-library/jest-dom
```

Papildyti `package.json` skriptus:

```json
{
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev:ui": "vite",
    "build:ui": "vite build"
  }
}
```

`src/ui/vite-env.d.ts` — be jo TypeScript nepažįsta CSS ir turto importų, ir `tsc --noEmit` krenta su `TS2882`. Nei `vitest`, nei `vite build` to nepagauna, nes abu naudoja esbuild, ne `tsc`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 2: Parašyti krentantį testą**

`tests/ui/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask, deleteTask, fetchTasks, patchTask } from '../../src/ui/api.js';

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('api', () => {
  it('fetchTasks kreipiasi į /api/tasks', async () => {
    const spy = stubFetch(200, [{ id: 'a' }]);
    expect(await fetchTasks()).toEqual([{ id: 'a' }]);
    expect(spy).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'GET' }));
  });

  it('createTask siunčia JSON kūną', async () => {
    const spy = stubFetch(201, { id: 'a', title: 'X' });
    await createTask({ title: 'X' });
    expect(spy).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X' }),
    }));
  });

  it('patchTask naudoja PATCH ir id kelyje', async () => {
    const spy = stubFetch(200, { id: 'a' });
    await patchTask('a', { status: 'done' });
    expect(spy).toHaveBeenCalledWith('/api/tasks/a', expect.objectContaining({ method: 'PATCH' }));
  });

  it('deleteTask nelaukia JSON kūno', async () => {
    stubFetch(204, undefined);
    await expect(deleteTask('a')).resolves.toBeUndefined();
  });

  it('klaidos atsakymą paverčia meta klaida su serverio žinute', async () => {
    stubFetch(400, { error: { code: 'invalid_title', message: 'Pavadinimas negali būti tuščias' } });
    await expect(createTask({ title: '' })).rejects.toThrow('Pavadinimas negali būti tuščias');
  });
});
```

- [ ] **Step 3: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/api.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/api.js"`

- [ ] **Step 4: Parašyti API klientą**

`src/ui/api.ts`:

```ts
import type { SettingsMap } from '../core/settings.js';
import type { Task, TaskInput, TaskPatch } from '../core/types.js';

export type ConnectionStatus = 'connected' | 'disconnected';

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(path, init);
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(payload?.error?.message ?? 'Nepavyko susisiekti su serveriu');
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const fetchTasks = (): Promise<Task[]> => send('/api/tasks', 'GET');
export const createTask = (input: TaskInput): Promise<Task> => send('/api/tasks', 'POST', input);
export const patchTask = (id: string, patch: TaskPatch): Promise<Task> =>
  send(`/api/tasks/${id}`, 'PATCH', patch);
export const deleteTask = (id: string): Promise<void> => send(`/api/tasks/${id}`, 'DELETE');
export const fetchSettings = (): Promise<SettingsMap> => send('/api/settings', 'GET');
export const patchSettings = (values: Partial<SettingsMap>): Promise<SettingsMap> =>
  send('/api/settings', 'PATCH', values);

export function subscribeToChanges(
  onChange: () => void,
  onStatus: (status: ConnectionStatus) => void,
): () => void {
  let source: EventSource | null = null;
  let delay = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const connect = (): void => {
    if (stopped) return;
    source = new EventSource('/api/events');

    source.onopen = () => {
      delay = 1000;
      onStatus('connected');
    };
    source.onmessage = () => { onChange(); };
    source.onerror = () => {
      source?.close();
      onStatus('disconnected');
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };
  };

  connect();

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    source?.close();
  };
}
```

Perjungimo intervalas dvigubinamas nuo 1 iki 30 sekundžių, kaip nurodyta specifikacijoje.

- [ ] **Step 5: Parašyti temą**

`src/ui/theme.css`:

```css
:root {
  --fonas: #ffffff;
  --fonas-kolona: #f4f4f5;
  --fonas-kortele: #ffffff;
  --tekstas: #18181b;
  --tekstas-blankus: #71717a;
  --riba: #d4d4d8;
  --pradelsta: #b91c1c;
  --prioritetas-1: #dc2626;
  --prioritetas-2: #d97706;
  --prioritetas-3: #a1a1aa;
}

:root[data-tema='dark'] {
  --fonas: #18181b;
  --fonas-kolona: #232327;
  --fonas-kortele: #2a2a2f;
  --tekstas: #f4f4f5;
  --tekstas-blankus: #a1a1aa;
  --riba: #3f3f46;
  --pradelsta: #f87171;
  --prioritetas-1: #f87171;
  --prioritetas-2: #fbbf24;
  --prioritetas-3: #71717a;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-tema='light']) {
    --fonas: #18181b;
    --fonas-kolona: #232327;
    --fonas-kortele: #2a2a2f;
    --tekstas: #f4f4f5;
    --tekstas-blankus: #a1a1aa;
    --riba: #3f3f46;
    --pradelsta: #f87171;
    --prioritetas-1: #f87171;
    --prioritetas-2: #fbbf24;
    --prioritetas-3: #71717a;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--fonas);
  color: var(--tekstas);
  font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
```

Tamsios temos kintamieji aprašomi dviejose vietose sąmoningai: `[data-tema='dark']` galioja, kai naudotojas pasirinko temą aiškiai, o `prefers-color-scheme` blokas — kai pasirinkta „Pagal sistemą" (tada `data-tema` atributo nėra arba jis `system`).

- [ ] **Step 6: Parašyti įėjimo taškus**

`src/ui/index.html`:

```html
<!doctype html>
<html lang="lt">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TaskerPro</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/ui/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';

function App() {
  return <div>TaskerPro</div>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Paleisti testus**

Run: `npx vitest run tests/ui/api.test.ts`
Expected: PASS, 5 testai

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts vitest.config.ts package.json package-lock.json src/ui tests/ui
git commit -m "feat: UI karkasas, tema ir API klientas"
```

---

### Task 11: Užduoties kortelė

**Files:**
- Create: `src/ui/components/TaskCard.tsx`
- Test: `tests/ui/TaskCard.test.tsx`

**Interfaces:**
- Consumes: `isOverdue` iš `core/buckets.ts`; `timeOf`, `dateOf` iš `core/datetime.ts`; `Task` iš `core/types.ts`
- Produces: `<TaskCard task today onToggleDone onDelete onRename />` su `TaskCardProps { task: Task; today: string; onToggleDone(id: string, done: boolean): void; onDelete(id: string): void; onRename(id: string, title: string): void }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/TaskCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../src/core/types.js';
import { TaskCard } from '../../src/ui/components/TaskCard.js';

const TODAY = '2026-08-14';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'Nupirkti pieną', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, ...over,
  };
}

function renderCard(over: Partial<Task> = {}, handlers = {}) {
  const props = {
    task: task(over), today: TODAY,
    onToggleDone: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), ...handlers,
  };
  render(<TaskCard {...props} />);
  return props;
}

describe('TaskCard', () => {
  it('rodo pavadinimą, o bedatei nerodo datos žymės', () => {
    renderCard();
    expect(screen.getByText('Nupirkti pieną')).toBeDefined();
    expect(screen.queryByTestId('datos-zyme')).toBeNull();
  });

  it('datuotai rodo datą, o turinčiai laiką — ir valandą', () => {
    const { unmount } = render(
      <TaskCard
        task={task({ due_at: '2026-08-20' })} today={TODAY}
        onToggleDone={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()}
      />,
    );
    expect(screen.getByTestId('datos-zyme').textContent).toBe('2026-08-20');
    unmount();

    renderCard({ due_at: '2026-08-20T18:00', due_has_time: true });
    expect(screen.getByTestId('datos-zyme').textContent).toBe('2026-08-20 18:00');
  });

  it('pradelstą pažymi', () => {
    renderCard({ due_at: '2026-08-10' });
    expect(screen.getByTestId('datos-zyme').dataset.pradelsta).toBe('true');
  });

  it('varnelė praneša apie pažymėjimą', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));
    expect(props.onToggleDone).toHaveBeenCalledWith('t1', true);
  });

  it('ištrynimas praneša su id', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Ištrinti' }));
    expect(props.onDelete).toHaveBeenCalledWith('t1');
  });

  it('pavadinimas redaguojamas vietoje, Enter išsaugo', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByText('Nupirkti pieną'));
    const input = screen.getByRole('textbox', { name: 'Užduoties pavadinimas' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Nupirkti duonos{Enter}');
    expect(props.onRename).toHaveBeenCalledWith('t1', 'Nupirkti duonos');
  });

  it('Esc atšaukia redagavimą', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByText('Nupirkti pieną'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Užduoties pavadinimas' }), 'Kita{Escape}');
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByText('Nupirkti pieną')).toBeDefined();
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/TaskCard.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/ui/components/TaskCard.js"`

- [ ] **Step 3: Parašyti komponentą**

`src/ui/components/TaskCard.tsx`:

```tsx
import { useState } from 'react';
import { isOverdue } from '../../core/buckets.js';
import { dateOf, timeOf } from '../../core/datetime.js';
import type { Task } from '../../core/types.js';

export interface TaskCardProps {
  task: Task;
  today: string;
  onToggleDone(id: string, done: boolean): void;
  onDelete(id: string): void;
  onRename(id: string, title: string): void;
}

function dueLabel(task: Task): string | null {
  if (task.due_at === null) return null;
  const time = task.due_has_time ? timeOf(task.due_at) : null;
  return time === null ? dateOf(task.due_at) : `${dateOf(task.due_at)} ${time}`;
}

export function TaskCard({ task, today, onToggleDone, onDelete, onRename }: TaskCardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelling = useRef(false);
  const label = dueLabel(task);
  const overdue = isOverdue(task, today);

  const commit = (): void => {
    // Escape išima įvesties lauką iš DOM, o naršyklė tuo metu iššaukia blur —
    // be šitos vėliavos atmestas juodraštis vis tiek būtų išsaugotas. jsdom to
    // neatkartoja, tad testai vieni patys šito nepagautų.
    if (cancelling.current) {
      cancelling.current = false;
      setDraft(null);
      return;
    }
    const value = (draft ?? '').trim();
    if (value !== '' && value !== task.title) onRename(task.id, value);
    setDraft(null);
  };

  const cancel = (): void => {
    cancelling.current = true;
    setDraft(null);
  };

  return (
    <div className="kortele" data-atlikta={task.status === 'done'}>
      <span className="prioriteto-juostele" data-prioritetas={task.priority} />

      <input
        type="checkbox"
        aria-label="Pažymėti atlikta"
        checked={task.status === 'done'}
        onChange={(e) => onToggleDone(task.id, e.target.checked)}
      />

      {draft === null ? (
        <span
          className="pavadinimas"
          role="button"
          tabIndex={0}
          onClick={() => setDraft(task.title)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDraft(task.title);
            }
          }}
        >
          {task.title}
        </span>
      ) : (
        <input
          className="pavadinimas-ivestis"
          aria-label="Užduoties pavadinimas"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
        />
      )}

      {label !== null && (
        <span className="datos-zyme" data-testid="datos-zyme" data-pradelsta={overdue}>
          {label}
        </span>
      )}

      <button type="button" aria-label="Ištrinti" onClick={() => onDelete(task.id)}>
        ×
      </button>
    </div>
  );
}
```

Papildyti `src/ui/theme.css`:

```css
.kortele {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  padding: 8px 8px 8px 12px;
  background: var(--fonas-kortele);
  border: 1px solid var(--riba);
  border-radius: 4px;
}

.kortele[data-atlikta='true'] .pavadinimas {
  text-decoration: line-through;
  color: var(--tekstas-blankus);
}

.prioriteto-juostele {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  border-radius: 4px 0 0 4px;
}
.prioriteto-juostele[data-prioritetas='1'] { background: var(--prioritetas-1); }
.prioriteto-juostele[data-prioritetas='2'] { background: var(--prioritetas-2); }
.prioriteto-juostele[data-prioritetas='3'] { background: var(--prioritetas-3); }

.pavadinimas { flex: 1; cursor: text; }
.pavadinimas-ivestis {
  flex: 1;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--riba);
  border-radius: 3px;
  padding: 1px 4px;
}

.datos-zyme { color: var(--tekstas-blankus); font-size: 12px; white-space: nowrap; }
.datos-zyme[data-pradelsta='true'] { color: var(--pradelsta); }
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/ui/TaskCard.test.tsx`
Expected: PASS, 7 testai

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/TaskCard.tsx src/ui/theme.css tests/ui/TaskCard.test.tsx
git commit -m "feat: užduoties kortelė su redagavimu vietoje"
```

---

### Task 12: Termino ir prioriteto redaktorius

Bendras komponentas: 2 fazėje jį naudos ir tray langelis.

**Files:**
- Create: `src/ui/components/DueEditor.tsx`
- Test: `tests/ui/DueEditor.test.tsx`

**Interfaces:**
- Consumes: `parseTimeInput`, `resolveDue`, `DateChoice` iš `core/timeinput.ts`; `Priority` iš `core/types.ts`
- Produces: `<DueEditor value onChange now />` su `DueValue { due_at: string | null; due_has_time: boolean; remind_at: string | null; priority: Priority }` ir `DueEditorProps { value: DueValue; now: Date; onChange(next: DueValue): void }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/DueEditor.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DueEditor, type DueValue } from '../../src/ui/components/DueEditor.js';

const NOW = new Date(2026, 7, 14, 10, 0);
const EMPTY: DueValue = { due_at: null, due_has_time: false, remind_at: null, priority: 2 };

function renderEditor(value: DueValue = EMPTY) {
  const onChange = vi.fn();
  render(<DueEditor value={value} now={NOW} onChange={onChange} />);
  return onChange;
}

describe('DueEditor', () => {
  it('pagal nutylėjimą pažymėtas čipas „Šiandien"', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Šiandien' }).dataset.pazymeta).toBe('true');
  });

  it('paspaudus „Rytoj" nustato rytdienos datą be žadintuvo', async () => {
    const onChange = renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Rytoj' }));
    expect(onChange).toHaveBeenCalledWith({
      due_at: '2026-08-15', due_has_time: false, remind_at: null, priority: 2,
    });
  });

  it('įvedus laiką prie „Šiandien" sukuria žadintuvą šiai dienai', async () => {
    const onChange = renderEditor();
    await userEvent.type(screen.getByLabelText('Laikas'), '18');
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith({
      due_at: '2026-08-14T18:00', due_has_time: true, remind_at: '2026-08-14T18:00', priority: 2,
    });
  });

  it('praėjusi valanda be datos keliama į rytdieną', async () => {
    const onChange = renderEditor();
    await userEvent.type(screen.getByLabelText('Laikas'), '08:00');
    await userEvent.tab();
    expect(onChange.mock.lastCall![0].due_at).toBe('2026-08-15T08:00');
  });

  it('neatpažintas laikas nieko nekeičia', async () => {
    const onChange = renderEditor();
    await userEvent.type(screen.getByLabelText('Laikas'), 'abc');
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('prioriteto taškas keičia tik prioritetą', async () => {
    const onChange = renderEditor({ ...EMPTY, due_at: '2026-08-20', due_has_time: false });
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas prioritetas' }));
    expect(onChange).toHaveBeenCalledWith({
      due_at: '2026-08-20', due_has_time: false, remind_at: null, priority: 1,
    });
  });

  it('konkreti data iš kalendoriaus perduodama kaip yra', () => {
    const onChange = renderEditor();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-09-01' } });
    expect(onChange.mock.lastCall![0].due_at).toBe('2026-09-01');
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/DueEditor.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/ui/components/DueEditor.js"`

- [ ] **Step 3: Parašyti komponentą**

`src/ui/components/DueEditor.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { addDays, dateOf, formatLocalDate, timeOf } from '../../core/datetime.js';
import { parseTimeInput, resolveDue, type DateChoice } from '../../core/timeinput.js';
import type { Priority } from '../../core/types.js';

export interface DueValue {
  due_at: string | null;
  due_has_time: boolean;
  remind_at: string | null;
  priority: Priority;
}

export interface DueEditorProps {
  value: DueValue;
  now: Date;
  onChange(next: DueValue): void;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Aukštas prioritetas',
  2: 'Vidutinis prioritetas',
  3: 'Žemas prioritetas',
};

const timeFromValue = (value: DueValue): string =>
  value.due_at !== null && value.due_has_time ? (timeOf(value.due_at) ?? '') : '';

export function DueEditor({ value, now, onChange }: DueEditorProps) {
  const [timeDraft, setTimeDraft] = useState(() => timeFromValue(value));

  // Juodraštis persikrauna, kai tėvas paduoda kitą reikšmę. Be šito išsaugojus
  // užduotį ir formai atsistačius laiko laukelis liktų su senu tekstu, o kitas
  // blur jį pritaikytų naujai užduočiai.
  useEffect(() => {
    setTimeDraft(timeFromValue(value));
  }, [value.due_at, value.due_has_time]);

  const today = formatLocalDate(now);
  const currentDate: DateChoice =
    value.due_at === null ? 'today' : { date: dateOf(value.due_at) };
  const isTomorrow = value.due_at !== null && dateOf(value.due_at) === addDays(today, 1);

  const apply = (choice: DateChoice, timeRaw: string): void => {
    const time = timeRaw.trim() === '' ? null : parseTimeInput(timeRaw);
    if (timeRaw.trim() !== '' && time === null) return;
    onChange({ ...resolveDue(choice, time, now), priority: value.priority });
  };

  const chip = (label: string, choice: DateChoice, selected: boolean) => (
    <button
      type="button"
      aria-label={label}
      data-pazymeta={selected}
      onClick={() => apply(choice, timeDraft)}
    >
      {label}
    </button>
  );

  return (
    <div className="termino-eilute">
      {chip('Šiandien', 'today', value.due_at === null)}
      {chip('Rytoj', 'tomorrow', isTomorrow)}

      <input
        type="date"
        aria-label="Data"
        value={value.due_at !== null ? dateOf(value.due_at) : ''}
        onChange={(e) => {
          if (e.target.value !== '') apply({ date: e.target.value }, timeDraft);
        }}
      />

      <input
        type="text"
        aria-label="Laikas"
        placeholder="--:--"
        size={5}
        value={timeDraft}
        onChange={(e) => setTimeDraft(e.target.value)}
        onBlur={() => apply(currentDate, timeDraft)}
      />

      <span className="prioriteto-taskai">
        {([1, 2, 3] as Priority[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-label={PRIORITY_LABELS[p]}
            data-prioritetas={p}
            data-pazymeta={value.priority === p}
            onClick={() => onChange({ ...value, priority: p })}
          >
            ●
          </button>
        ))}
      </span>
    </div>
  );
}
```

Laikas taikomas per `onBlur`, o ne per kiekvieną klavišo paspaudimą — kitaip vedant „18:00" tarpinė reikšmė „1" būtų iš karto paversta 01:00.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/ui/DueEditor.test.tsx`
Expected: PASS, 7 testai

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/DueEditor.tsx tests/ui/DueEditor.test.tsx
git commit -m "feat: termino ir prioriteto redaktorius"
```

---

### Task 13: Filtrų juosta ir grupavimo perjungiklis

**Files:**
- Create: `src/ui/components/FilterBar.tsx`, `src/ui/localPrefs.ts`
- Test: `tests/ui/FilterBar.test.tsx`

**Interfaces:**
- Consumes: `Priority` iš `core/types.ts`; `SettingsMap` iš `core/settings.ts`
- Produces: `LocalPrefs { priorities: Priority[]; showDone: boolean }`, `loadLocalPrefs(): LocalPrefs`, `saveLocalPrefs(prefs): void`, `<FilterBar grouping prefs onGroupingChange onPrefsChange />`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/FilterBar.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '../../src/ui/components/FilterBar.js';
import { loadLocalPrefs, saveLocalPrefs } from '../../src/ui/localPrefs.js';

beforeEach(() => { localStorage.clear(); });

function renderBar(grouping: 'date' | 'status' = 'date', prefs = loadLocalPrefs()) {
  const onGroupingChange = vi.fn();
  const onPrefsChange = vi.fn();
  render(
    <FilterBar
      grouping={grouping}
      prefs={prefs}
      onGroupingChange={onGroupingChange}
      onPrefsChange={onPrefsChange}
    />,
  );
  return { onGroupingChange, onPrefsChange };
}

describe('localPrefs', () => {
  it('numatytai rodo visus prioritetus ir slepia atliktas', () => {
    expect(loadLocalPrefs()).toEqual({ priorities: [], showDone: false });
  });

  it('išsaugo ir atkuria', () => {
    saveLocalPrefs({ priorities: [1], showDone: true });
    expect(loadLocalPrefs()).toEqual({ priorities: [1], showDone: true });
  });

  it('sugadintą įrašą pakeičia numatytuoju', () => {
    localStorage.setItem('taskerpro.prefs', '{ne json');
    expect(loadLocalPrefs()).toEqual({ priorities: [], showDone: false });
  });
});

describe('FilterBar', () => {
  it('rodo aktyvų grupavimą ir leidžia jį perjungti', async () => {
    const { onGroupingChange } = renderBar('date');
    expect(screen.getByRole('button', { name: 'Datos' }).dataset.pazymeta).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Progresas' }));
    expect(onGroupingChange).toHaveBeenCalledWith('status');
  });

  it('prioriteto čipas įjungiamas ir išjungiamas', async () => {
    const { onPrefsChange } = renderBar('date', { priorities: [], showDone: false });
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));
    expect(onPrefsChange).toHaveBeenCalledWith({ priorities: [1], showDone: false });
  });

  it('pažymėtas čipas paspaudus nusiima', async () => {
    const { onPrefsChange } = renderBar('date', { priorities: [1, 2], showDone: false });
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));
    expect(onPrefsChange).toHaveBeenCalledWith({ priorities: [2], showDone: false });
  });

  it('jungiklis „Rodyti atliktas" perduoda naują reikšmę', async () => {
    const { onPrefsChange } = renderBar('date', { priorities: [], showDone: false });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Rodyti atliktas' }));
    expect(onPrefsChange).toHaveBeenCalledWith({ priorities: [], showDone: true });
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/FilterBar.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/ui/localPrefs.js"`

- [ ] **Step 3: Parašyti vietinių nustatymų modulį**

`src/ui/localPrefs.ts`:

```ts
import type { Priority } from '../core/types.js';

export interface LocalPrefs {
  priorities: Priority[];
  showDone: boolean;
}

const KEY = 'taskerpro.prefs';
const DEFAULTS: LocalPrefs = { priorities: [], showDone: false };

export function loadLocalPrefs(): LocalPrefs {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<LocalPrefs>;
    return {
      // Tikrinamas ne tik masyvo tipas, bet ir kiekvienas elementas: sugadintas
      // arba pasenęs localStorage įrašas kitaip nutekintų netikrus prioritetus
      // tiesiai į lentos filtrą.
      priorities: Array.isArray(parsed.priorities)
        ? parsed.priorities.filter((p): p is Priority => p === 1 || p === 2 || p === 3)
        : [],
      showDone: parsed.showDone === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLocalPrefs(prefs: LocalPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
```

- [ ] **Step 4: Parašyti komponentą**

`src/ui/components/FilterBar.tsx`:

```tsx
import type { Priority } from '../../core/types.js';
import type { LocalPrefs } from '../localPrefs.js';

export interface FilterBarProps {
  grouping: 'date' | 'status';
  prefs: LocalPrefs;
  onGroupingChange(next: 'date' | 'status'): void;
  onPrefsChange(next: LocalPrefs): void;
}

const PRIORITY_CHIPS: { value: Priority; label: string }[] = [
  { value: 1, label: 'Aukštas' },
  { value: 2, label: 'Vidutinis' },
  { value: 3, label: 'Žemas' },
];

export function FilterBar({ grouping, prefs, onGroupingChange, onPrefsChange }: FilterBarProps) {
  const togglePriority = (p: Priority): void => {
    const next = prefs.priorities.includes(p)
      ? prefs.priorities.filter((x) => x !== p)
      : [...prefs.priorities, p].sort((a, b) => a - b);
    onPrefsChange({ ...prefs, priorities: next });
  };

  return (
    <div className="filtru-juosta">
      <span className="grupavimas">
        {(['date', 'status'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-label={mode === 'date' ? 'Datos' : 'Progresas'}
            data-pazymeta={grouping === mode}
            onClick={() => onGroupingChange(mode)}
          >
            {mode === 'date' ? 'Datos' : 'Progresas'}
          </button>
        ))}
      </span>

      <span className="prioriteto-filtras">
        {PRIORITY_CHIPS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            data-prioritetas={value}
            data-pazymeta={prefs.priorities.includes(value)}
            onClick={() => togglePriority(value)}
          >
            {label}
          </button>
        ))}
      </span>

      <label>
        <input
          type="checkbox"
          aria-label="Rodyti atliktas"
          checked={prefs.showDone}
          onChange={(e) => onPrefsChange({ ...prefs, showDone: e.target.checked })}
        />
        Rodyti atliktas
      </label>
    </div>
  );
}
```

- [ ] **Step 5: Paleisti testus**

Run: `npx vitest run tests/ui/FilterBar.test.tsx`
Expected: PASS, 7 testų

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/FilterBar.tsx src/ui/localPrefs.ts tests/ui/FilterBar.test.tsx
git commit -m "feat: filtrų juosta ir grupavimo perjungiklis"
```

---

### Task 14: Lentos surinkimas su tempimu

**Files:**
- Create: `src/ui/components/Column.tsx`, `src/ui/components/Board.tsx`
- Modify: `src/ui/main.tsx` (pakeisti laikiną `App`), `src/ui/theme.css`
- Test: `tests/ui/Board.test.tsx`

**Interfaces:**
- Consumes: `DATE_BUCKETS`, `BUCKET_LABELS`, `dateBucketOf`, `dueForBucket`, `sortTasks` iš `core/buckets.ts`; `TaskCard`, `FilterBar`, `DueEditor`; `api.ts` funkcijos
- Produces: `<Board />` — pati aukščiausia lentos komponentė, valdanti užduočių ir nustatymų būseną

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/Board.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../src/core/types.js';
import { Board } from '../../src/ui/components/Board.js';
import * as api from '../../src/ui/api.js';

vi.mock('../../src/ui/api.js');

const TODAY = new Date(2026, 7, 14, 10, 0);

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'A', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, ...over,
  };
}

function setup(tasks: Task[], grouping: 'date' | 'status' = 'date') {
  vi.mocked(api.fetchTasks).mockResolvedValue(tasks);
  vi.mocked(api.fetchSettings).mockResolvedValue({
    grouping, theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
    port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
  });
  vi.mocked(api.subscribeToChanges).mockReturnValue(() => {});
  render(<Board now={TODAY} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Board — datos rodinys', () => {
  it('rodo keturias kolonas lietuviškais pavadinimais', async () => {
    setup([]);
    await waitFor(() => expect(screen.getByText('Šiandien')).toBeDefined());
    for (const label of ['Šiandien', 'Rytoj', 'Per savaitę', 'Vėliau']) {
      expect(screen.getByTestId(`kolona-${label}`)).toBeDefined();
    }
  });

  it('paskirsto užduotis į teisingas kolonas', async () => {
    setup([
      task({ id: 'a', title: 'Bedatė' }),
      task({ id: 'b', title: 'Rytoj', due_at: '2026-08-15' }),
      task({ id: 'c', title: 'Toli', due_at: '2026-09-30' }),
    ]);
    await waitFor(() => expect(screen.getByText('Bedatė')).toBeDefined());
    expect(within(screen.getByTestId('kolona-Šiandien')).getByText('Bedatė')).toBeDefined();
    expect(within(screen.getByTestId('kolona-Rytoj')).getByText('Rytoj')).toBeDefined();
    expect(within(screen.getByTestId('kolona-Vėliau')).getByText('Toli')).toBeDefined();
  });

  it('atliktas slepia, kol neįjungtas jungiklis', async () => {
    setup([task({ id: 'a', title: 'Padaryta', status: 'done' })]);
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    expect(screen.queryByText('Padaryta')).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Rodyti atliktas' }));
    expect(screen.getByText('Padaryta')).toBeDefined();
  });

  it('prioriteto filtras palieka tik pažymėtas', async () => {
    setup([
      task({ id: 'a', title: 'Svarbi', priority: 1 }),
      task({ id: 'b', title: 'Eilinė', priority: 3 }),
    ]);
    await waitFor(() => expect(screen.getByText('Svarbi')).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));
    expect(screen.getByText('Svarbi')).toBeDefined();
    expect(screen.queryByText('Eilinė')).toBeNull();
  });
});

describe('Board — progreso rodinys', () => {
  it('perjungus rodo tris būsenų kolonas ir išsaugo serveryje', async () => {
    setup([]);
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    vi.mocked(api.patchSettings).mockResolvedValue({
      grouping: 'status', theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
      port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Progresas' }));

    expect(api.patchSettings).toHaveBeenCalledWith({ grouping: 'status' });
    await waitFor(() => expect(screen.getByTestId('kolona-Reikia padaryti')).toBeDefined());
    expect(screen.getByTestId('kolona-Vykdoma')).toBeDefined();
    expect(screen.getByTestId('kolona-Atlikta')).toBeDefined();
  });
});

describe('Board — veiksmai', () => {
  it('varnelė siunčia PATCH su status done', async () => {
    setup([task({ id: 'a', title: 'A' })]);
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    vi.mocked(api.patchTask).mockResolvedValue(task({ id: 'a', status: 'done' }));

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));

    expect(api.patchTask).toHaveBeenCalledWith('a', { status: 'done' });
  });

  it('rodo ryšio juostą praradus SSE', async () => {
    // Tvarkyklė laikoma objekto lauke, o ne kintamajame: kintamąjį TypeScript
    // susiaurintų iki `null`, nes priskyrimo uždarinio viduje jis nemato.
    const captured: { onStatus?: (s: 'connected' | 'disconnected') => void } = {};
    vi.mocked(api.subscribeToChanges).mockImplementation((_onChange, onStatus) => {
      captured.onStatus = onStatus;
      return () => {};
    });
    setup([]);
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    captured.onStatus!('disconnected');

    await waitFor(() =>
      expect(screen.getByText('Nėra ryšio su serveriu')).toBeDefined(),
    );
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/Board.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/ui/components/Board.js"`

- [ ] **Step 3: Parašyti koloną**

`src/ui/components/Column.tsx`:

```tsx
import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

export interface ColumnProps {
  id: string;
  label: string;
  children: ReactNode;
}

export function Column({ id, label, children }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className="kolona"
      data-testid={`kolona-${label}`}
      data-virs={isOver}
    >
      <h2>{label}</h2>
      <div className="kolonos-turinys">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Parašyti lentą**

`src/ui/components/Board.tsx`:

```tsx
import {
  DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BUCKET_LABELS, DATE_BUCKETS, dateBucketOf, dueForBucket, sortTasks, type DateBucket } from '../../core/buckets.js';
import { formatLocalDate } from '../../core/datetime.js';
import type { SettingsMap } from '../../core/settings.js';
import type { Status, Task } from '../../core/types.js';
import * as api from '../api.js';
import { loadLocalPrefs, saveLocalPrefs, type LocalPrefs } from '../localPrefs.js';
import { Column } from './Column.js';
import { FilterBar } from './FilterBar.js';
import { TaskCard } from './TaskCard.js';

const STATUS_LABELS: Record<Status, string> = {
  todo: 'Reikia padaryti',
  doing: 'Vykdoma',
  done: 'Atlikta',
};
const STATUSES: Status[] = ['todo', 'doing', 'done'];

function DraggableCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

export function Board({ now }: { now: Date }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [prefs, setPrefs] = useState<LocalPrefs>(loadLocalPrefs);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = formatLocalDate(now);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const reload = useCallback(async () => {
    try {
      setTasks(await api.fetchTasks());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    void api.fetchSettings().then(setSettings).catch(() => setSettings(null));
    return api.subscribeToChanges(
      () => { void reload(); },
      (status) => setConnected(status === 'connected'),
    );
  }, [reload]);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (err) {
      // Varnelė lentoje atnaujinama optimistiškai, tad po nesėkmės vaizdas jau
      // rodo pakeitimą, kurio serveryje nėra. Persikraunam tikrą būseną PIRMA,
      // ir tik tada rodom klaidą — kitaip reload'o klaida užgožtų tikrąją.
      await reload();
      setError((err as Error).message);
    }
  };

  const updatePrefs = (next: LocalPrefs): void => {
    setPrefs(next);
    saveLocalPrefs(next);
  };

  const changeGrouping = (grouping: 'date' | 'status'): void => {
    void run(async () => { setSettings(await api.patchSettings({ grouping })); });
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const task = tasks.find((t) => t.id === event.active.id);
    const target = event.over?.id;
    if (task === undefined || target === undefined) return;

    if (settings?.grouping === 'status') {
      if (task.status !== target) {
        void run(() => api.patchTask(task.id, { status: target as Status }));
      }
      return;
    }
    const bucket = target as DateBucket;
    if (dateBucketOf(task, today) !== bucket) {
      void run(() => api.patchTask(task.id, dueForBucket(task, bucket, today)));
    }
  };

  const visible = sortTasks(
    tasks.filter((t) => {
      if (!prefs.showDone && t.status === 'done' && settings?.grouping !== 'status') return false;
      if (prefs.priorities.length > 0 && !prefs.priorities.includes(t.priority)) return false;
      return true;
    }),
  );

  const columns =
    settings?.grouping === 'status'
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

  return (
    <div className="lenta">
      {!connected && <div className="rysio-juosta">Nėra ryšio su serveriu</div>}
      {error !== null && <div className="klaidos-juosta">{error}</div>}

      <FilterBar
        grouping={settings?.grouping ?? 'date'}
        prefs={prefs}
        onGroupingChange={changeGrouping}
        onPrefsChange={updatePrefs}
      />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="kolonos">
          {columns.map((col) => (
            <Column key={col.id} id={col.id} label={col.label}>
              {col.tasks.map((task) => (
                <DraggableCard key={task.id} id={task.id}>
                  <TaskCard
                    task={task}
                    today={today}
                    onToggleDone={(id, done) =>
                      void run(() => api.patchTask(id, { status: done ? 'done' : 'todo' }))
                    }
                    onDelete={(id) => void run(() => api.deleteTask(id))}
                    onRename={(id, title) => void run(() => api.patchTask(id, { title }))}
                  />
                </DraggableCard>
              ))}
            </Column>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 5: Prijungti lentą prie įėjimo taško**

`src/ui/main.tsx` — pakeisti laikiną `App`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Board } from './components/Board.js';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Board now={new Date()} />
  </StrictMode>,
);
```

Papildyti `src/ui/theme.css`:

```css
.lenta { padding: 12px; }

.filtru-juosta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 12px;
}
.filtru-juosta button {
  font: inherit;
  color: var(--tekstas);
  background: transparent;
  border: 1px solid var(--riba);
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;
}
.filtru-juosta button[data-pazymeta='true'] {
  background: var(--tekstas);
  color: var(--fonas);
}

.kolonos { display: flex; gap: 12px; align-items: flex-start; }
.kolona {
  flex: 1 1 0;
  min-width: 0;
  background: var(--fonas-kolona);
  border-radius: 6px;
  padding: 8px;
}
.kolona[data-virs='true'] { outline: 2px solid var(--tekstas-blankus); }
.kolona h2 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--tekstas-blankus);
}
.kolonos-turinys { display: flex; flex-direction: column; gap: 6px; }

.rysio-juosta, .klaidos-juosta {
  padding: 6px 10px;
  margin-bottom: 8px;
  border-radius: 4px;
  background: var(--pradelsta);
  color: #fff;
}

@media (max-width: 900px) {
  .kolonos { overflow-x: auto; scroll-snap-type: x mandatory; }
  .kolona { flex: 0 0 85vw; scroll-snap-align: start; }
}
```

- [ ] **Step 6: Paleisti testus**

Run: `npx vitest run tests/ui/Board.test.tsx`
Expected: PASS, 7 testų

- [ ] **Step 7: Commit**

```bash
git add src/ui tests/ui/Board.test.tsx
git commit -m "feat: kanban lenta su dviem rodiniais, filtrais ir tempimu"
```

---

### Task 15: Naujos užduoties įvedimas lentoje

Lentai reikia savo įvedimo lauko — 1 fazėje tray langelio dar nėra, o be įvedimo sistema netikrinama nuo galo iki galo.

**Files:**
- Create: `src/ui/components/QuickAdd.tsx`
- Modify: `src/ui/components/Board.tsx` (įterpti `<QuickAdd>` virš kolonų), `src/ui/theme.css`
- Test: `tests/ui/QuickAdd.test.tsx`

**Interfaces:**
- Consumes: `DueEditor`, `DueValue` iš `DueEditor.tsx`; `TaskInput` iš `core/types.ts`
- Produces: `<QuickAdd now onCreate />` su `QuickAddProps { now: Date; onCreate(input: TaskInput): void }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/QuickAdd.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAdd } from '../../src/ui/components/QuickAdd.js';

const NOW = new Date(2026, 7, 14, 10, 0);

function renderQuickAdd() {
  const onCreate = vi.fn();
  render(<QuickAdd now={NOW} onCreate={onCreate} />);
  return onCreate;
}

describe('QuickAdd', () => {
  it('Enter sukuria bedatę užduotį', async () => {
    const onCreate = renderQuickAdd();
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Nupirkti pieną{Enter}');
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Nupirkti pieną', due_at: null, due_has_time: false, remind_at: null, priority: 2,
    });
  });

  it('po išsaugojimo išvalo lauką ir grąžina numatytąjį terminą', async () => {
    const onCreate = renderQuickAdd();
    const input = screen.getByLabelText('Nauja užduotis');
    await userEvent.click(screen.getByRole('button', { name: 'Rytoj' }));
    await userEvent.type(input, 'A{Enter}');
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Šiandien' }).dataset.pazymeta).toBe('true');
    onCreate.mockClear();

    await userEvent.type(input, 'B{Enter}');
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'B', due_at: null }));
  });

  it('perduoda pasirinktą terminą ir prioritetą', async () => {
    const onCreate = renderQuickAdd();
    await userEvent.click(screen.getByRole('button', { name: 'Rytoj' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas prioritetas' }));
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Skambutis{Enter}');
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Skambutis', due_at: '2026-08-15', due_has_time: false, remind_at: null, priority: 1,
    });
  });

  it('tuščias pavadinimas nieko nesukuria', async () => {
    const onCreate = renderQuickAdd();
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), '   {Enter}');
    expect(onCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/QuickAdd.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/ui/components/QuickAdd.js"`

- [ ] **Step 3: Parašyti komponentą**

`src/ui/components/QuickAdd.tsx`:

```tsx
import { useState } from 'react';
import type { TaskInput } from '../../core/types.js';
import { DueEditor, type DueValue } from './DueEditor.js';

export interface QuickAddProps {
  now: Date;
  onCreate(input: TaskInput): void;
}

const EMPTY_DUE: DueValue = { due_at: null, due_has_time: false, remind_at: null, priority: 2 };

export function QuickAdd({ now, onCreate }: QuickAddProps) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<DueValue>(EMPTY_DUE);

  const submit = (): void => {
    const trimmed = title.trim();
    if (trimmed === '') return;
    onCreate({
      title: trimmed,
      due_at: due.due_at,
      due_has_time: due.due_has_time,
      remind_at: due.remind_at,
      priority: due.priority,
    });
    setTitle('');
    setDue(EMPTY_DUE);
  };

  return (
    <div className="greitas-ivedimas">
      <input
        type="text"
        aria-label="Nauja užduotis"
        placeholder="Nauja užduotis…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <DueEditor value={due} now={now} onChange={setDue} />
    </div>
  );
}
```

- [ ] **Step 4: Įterpti į lentą**

`src/ui/components/Board.tsx` — pridėti importą ir įterpti komponentą tarp `<FilterBar>` ir `<DndContext>`:

```tsx
import { QuickAdd } from './QuickAdd.js';
```

```tsx
      <QuickAdd now={now} onCreate={(input) => void run(() => api.createTask(input))} />
```

Papildyti `src/ui/theme.css`:

```css
.greitas-ivedimas {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
}
.greitas-ivedimas > input {
  font: inherit;
  color: inherit;
  background: var(--fonas-kortele);
  border: 1px solid var(--riba);
  border-radius: 4px;
  padding: 6px 8px;
}
.termino-eilute { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.termino-eilute button, .termino-eilute input {
  font: inherit;
  color: var(--tekstas);
  background: transparent;
  border: 1px solid var(--riba);
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;
}
.termino-eilute button[data-pazymeta='true'] { background: var(--tekstas); color: var(--fonas); }
.prioriteto-taskai button[data-prioritetas='1'] { color: var(--prioritetas-1); }
.prioriteto-taskai button[data-prioritetas='2'] { color: var(--prioritetas-2); }
.prioriteto-taskai button[data-prioritetas='3'] { color: var(--prioritetas-3); }
```

- [ ] **Step 5: Paleisti visus testus**

Run: `npm test`
Expected: PASS, visi testai

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/ui/QuickAdd.test.tsx
git commit -m "feat: naujos užduoties įvedimas lentoje"
```

---

### Task 16: Temos taikymas ir pabaigos patikra nuo galo iki galo

Paskutinė užduotis surišta: tema pritaikoma iš nustatymų, serveris atiduoda sukompiliuotą lentą, o Playwright patikrina visą kelią per tikrą HTTP.

**Files:**
- Create: `src/ui/useTheme.ts`, `src/server/start.ts`, `playwright.config.ts`, `tests/e2e/board.spec.ts`, `README.md`
- Modify: `src/ui/components/Board.tsx`, `src/server/index.ts` (`dataDir` ir `startServer` turi paklusti `TASKERPRO_DATA` bei `TASKERPRO_PORT`), `package.json`
- Test: `tests/ui/useTheme.test.ts`, `tests/e2e/board.spec.ts`

**Interfaces:**
- Consumes: `SettingsMap` iš `core/settings.ts`; `startServer` iš `server/index.ts`
- Produces: `applyTheme(theme: SettingsMap['theme']): void`

- [ ] **Step 1: Parašyti krentantį temos testą**

`tests/ui/useTheme.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme } from '../../src/ui/useTheme.js';

beforeEach(() => { document.documentElement.removeAttribute('data-tema'); });

describe('applyTheme', () => {
  it('aiškų pasirinkimą užrašo atributu', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.tema).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.tema).toBe('light');
  });

  it('„pagal sistemą" atributą nuima, kad suveiktų prefers-color-scheme', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-tema')).toBe(false);
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/useTheme.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/useTheme.js"`

- [ ] **Step 3: Parašyti temos taikymą ir prijungti**

`src/ui/useTheme.ts`:

```ts
import type { SettingsMap } from '../core/settings.js';

export function applyTheme(theme: SettingsMap['theme']): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-tema');
    return;
  }
  document.documentElement.dataset.tema = theme;
}
```

`src/ui/components/Board.tsx` — pridėti importą ir efektą po `settings` būsenos deklaracijos:

```tsx
import { applyTheme } from '../useTheme.js';
```

```tsx
  useEffect(() => {
    if (settings !== null) applyTheme(settings.theme);
  }, [settings]);
```

- [ ] **Step 4: Paleisti temos testą**

Run: `npx vitest run tests/ui/useTheme.test.ts`
Expected: PASS, 2 testai

- [ ] **Step 5: Paruošti Playwright ir paleidimo skriptus**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://127.0.0.1:8099' },
  webServer: {
    command: 'npm run build:ui && npm run start:test',
    url: 'http://127.0.0.1:8099',
    reuseExistingServer: false,
  },
});
```

`package.json` skriptai:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:e2e": "playwright test",
    "dev:ui": "vite",
    "build:ui": "vite build",
    "start": "tsx src/server/start.ts",
    "start:test": "cross-env TASKERPRO_DATA=.e2e TASKERPRO_PORT=8099 tsx src/server/start.ts"
  }
}
```

```bash
npm i -D tsx cross-env
```

`src/server/start.ts`:

```ts
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './index.js';

if (process.env.TASKERPRO_DATA !== undefined) {
  rmSync(process.env.TASKERPRO_DATA, { recursive: true, force: true });
}

const { port } = await startServer(join(process.cwd(), 'dist/ui'));
console.log(`TaskerPro klausosi porto ${port}`);
```

`src/server/index.ts` — `dataDir` ir `startServer` turi paklusti aplinkos kintamiesiems, kad e2e testai naudotų atskirą bazę. Pakeisti abi funkcijas:

```ts
export function dataDir(): string {
  const override = process.env.TASKERPRO_DATA;
  const base = override ?? process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config');
  const dir = override ?? join(base, 'taskerpro');
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

```ts
export async function startServer(uiDir?: string): Promise<{ server: Server; port: number }> {
  const db = openDb(join(dataDir(), 'tasks.db'));
  const settings = createSettingsStore(db);
  const app = createApp({
    tasks: createTaskStore(db, systemClock),
    settings,
    events: createEventHub(),
    uiDir,
  });
  const port = process.env.TASKERPRO_PORT !== undefined
    ? Number(process.env.TASKERPRO_PORT)
    : settings.getAll().port;
  return listenWithFallback(app, port, 5);
}
```

- [ ] **Step 6: Parašyti e2e testą**

`tests/e2e/board.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('užduotis sukuriama, pažymima ir ištrinama', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Nauja užduotis').fill('Nupirkti pieną');
  await page.getByLabel('Nauja užduotis').press('Enter');

  const siandien = page.getByTestId('kolona-Šiandien');
  await expect(siandien.getByText('Nupirkti pieną')).toBeVisible();

  await siandien.getByRole('checkbox', { name: 'Pažymėti atlikta' }).check();
  await expect(page.getByText('Nupirkti pieną')).toBeHidden();

  await page.getByRole('checkbox', { name: 'Rodyti atliktas' }).check();
  await page.getByRole('button', { name: 'Ištrinti' }).click();
  await expect(page.getByText('Nupirkti pieną')).toBeHidden();
});

test('rytdienos užduotis patenka į koloną „Rytoj"', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Rytoj' }).click();
  await page.getByLabel('Nauja užduotis').fill('Rytojaus darbas');
  await page.getByLabel('Nauja užduotis').press('Enter');

  await expect(page.getByTestId('kolona-Rytoj').getByText('Rytojaus darbas')).toBeVisible();
});

test('grupavimo perjungiklis išlieka perkrovus puslapį', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Progresas' }).click();
  await expect(page.getByTestId('kolona-Reikia padaryti')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('kolona-Reikia padaryti')).toBeVisible();

  // Grupavimas saugomas serveryje, tad be grąžinimo jis nutekėtų į kitus testus.
  await page.getByRole('button', { name: 'Datos' }).click();
  await expect(page.getByTestId('kolona-Šiandien')).toBeVisible();
});

test('pakeitimas viename lange pasirodo kitame per SSE', async ({ browser }) => {
  const kompas = await browser.newPage();
  const plansete = await browser.newPage();
  await kompas.goto('/');
  await plansete.goto('/');

  await kompas.getByLabel('Nauja užduotis').fill('Bendra užduotis');
  await kompas.getByLabel('Nauja užduotis').press('Enter');

  await expect(plansete.getByText('Bendra užduotis')).toBeVisible({ timeout: 5000 });
});

test('kortelė tempiama iš „Šiandien" į „Rytoj" ir terminas pasikeičia', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Nauja užduotis').fill('Tempiama užduotis');
  await page.getByLabel('Nauja užduotis').press('Enter');

  const kortele = page.getByTestId('kolona-Šiandien').getByText('Tempiama užduotis');
  await kortele.dragTo(page.getByTestId('kolona-Rytoj'));

  await expect(page.getByTestId('kolona-Rytoj').getByText('Tempiama užduotis')).toBeVisible();
  await expect(page.getByTestId('kolona-Šiandien').getByText('Tempiama užduotis')).toBeHidden();
});

test('Escape atšaukia pavadinimo redagavimą net paspaudus šalia', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Nauja užduotis').fill('Originalus pavadinimas');
  await page.getByLabel('Nauja užduotis').press('Enter');

  await page.getByText('Originalus pavadinimas').click();
  const laukas = page.getByRole('textbox', { name: 'Užduoties pavadinimas' });
  await laukas.fill('Pakeista');
  await laukas.press('Escape');
  await page.getByTestId('kolona-Rytoj').click(); // fokusas nukeliauja kitur

  await expect(page.getByText('Originalus pavadinimas')).toBeVisible();
  await expect(page.getByText('Pakeista')).toBeHidden();
});

test('planšetės plotyje kolonos slenkamos horizontaliai', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');

  const kolonos = page.locator('.kolonos');
  const overflow = await kolonos.evaluate((el) => getComputedStyle(el).overflowX);
  expect(overflow).toBe('auto');
});
```

- [ ] **Step 7: Parašyti README**

`README.md`:

```markdown
# TaskerPro

Užduočių sistema namų tinklui. 1 fazė: serveris ir kanban lenta naršyklėje.

## Paleidimas

    npm install
    npm run build:ui
    npm start

Serveris klausosi `0.0.0.0:8080` ir atiduoda lentą adresu `http://localhost:8080`.

**Iš planšetės:** atidaryk `http://<kompiuterio-IP>:8080`. IP sužinosi paleidęs
`ipconfig`. Pirmą kartą Windows paklaus leidimo įeinančiam ryšiui — be jo
planšetė neprisijungs.

Duomenys laikomi `%APPDATA%/taskerpro/tasks.db`.

## Testai

    npm test          # vienetiniai ir integraciniai
    npm run test:e2e  # Playwright per tikrą HTTP

## Kūrimas

    npm run dev:ui    # Vite su karštu perkrovimu, /api nukreipiamas į 8080
```

- [ ] **Step 8: Paleisti visus testus**

Run: `npm test`
Expected: PASS, visi vienetiniai ir integraciniai testai

Run: `npm run test:e2e`
Expected: PASS, 5 testai

- [ ] **Step 9: Commit**

```bash
git add src tests playwright.config.ts package.json package-lock.json README.md
git commit -m "feat: temos taikymas, e2e patikros ir paleidimo instrukcija"
```

---

## Pabaigos patikra

Po 16 užduoties turi veikti:

- `npm start` paleidžia serverį, `http://localhost:8080` rodo lentą
- Užduotys kuriamos, pervadinamos, žymimos, trinamos
- Keturios datos kolonos ir trys progreso kolonos, perjungiklis išlieka perkrovus
- Prioriteto filtras ir „Rodyti atliktas" veikia ir išlieka tame pačiame įrenginyje
- Kortelės tempiamos tarp kolonų, terminas ir būsena keičiasi pagal taisykles
- Pakeitimas viename įrenginyje per SSE pasirodo kitame
- Tamsi tema veikia
- Planšetės plotyje kolonos slenkamos horizontaliai

**Neveiks (2–4 fazės):** tray ikona, globalus karštasis klavišas, iššokantis įvedimo langelis, žadintuvas, dienos apžvalga, garsas, nustatymų langas, autostartas, diegimo failas.

---

## Žinomos, sąmoningai atidėtos skolos

Rasta peržiūrų metu, įvertinta ir palikta 2 fazei. Nė viena nėra blokuojanti.

| Vieta | Kas | Kodėl atidėta |
|---|---|---|
| `Board.tsx` | Nepavykus užkrauti nustatymų lieka amžinas „Kraunama…" be klaidos | Klaidos kelias vietiniame tinkle; iki 2 fazės nustatymų lango vis tiek nėra |
| `core/tasks.ts` | `update` netrimina vien tarpų pavadinimo | HTTP sluoksnis validuoja; svarbu tik kai 2 fazė kvies tiesiogiai procese |
| `core/tasks.ts` | `update`/`snooze` kviečia `get(id)` perteklinai | Du indeksuoti skaitymai vienam naudotojui |
| `core/settings.ts` | `getAll` perleidžia `schema_version` eilutę prieš atmesdamas | Kosmetika 8 eilučių lentelėje |
| `TaskCard.tsx` | Redagavimo juodraštis nesusinchronizuoja, jei pavadinimas pasikeičia po SSE perkrovimo | Reikia, kad kitas įrenginys redaguotų tą pačią užduotį per tas sekundes |
| `DueEditor.tsx` | `onChange` kviečiamas nuėjus nuo nepaliesto tuščio laiko laukelio | Patikrinta, kad neciklina; reikšmė lygiavertė esamai |
| `Board.tsx` | `aria-label="Užduoties kortelė, tempiama"` skamba pasyviai | Vienas naudotojas, ekrano skaitytuvo reikalavimo nėra |
| `QuickAdd` testai | Atstatymo testas įrodo tik `due_at`, ne prioriteto ir laiko | Elgsena teisinga konstrukcijos dėka (vienas `EMPTY_DUE`); trūksta tik įrodymo |

**Pamoka 2–4 fazėms:** iš visų peržiūrų radinių didžioji dalis buvo ne vykdytojų klaidos, o defektai pačiame plane — vykdytojai rašė tiksliai tai, kas parašyta. Rimčiausi trys (paleidiklis, trynęs duomenų katalogą; užšaldytas laikrodis, rašęs neteisingas datas po vidurnakčio; migracija be transakcijos) būtų pasiekę naudotoją. Vėlesnių fazių planus verta perskaityti su tuo pačiu įtarumu prieš vykdymą.
