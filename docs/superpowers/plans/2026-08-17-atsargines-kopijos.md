# Naktinės atsarginės kopijos — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kartą per parą įrašyti visą užduočių bazę ir jos CSV kopiją į naudotojo nurodytą aplanką, laikant septynias paskutines poras.

**Architecture:** Gryna dalis (CSV formavimas, rotacijos sprendimas) atskirta nuo diską liečiančios (`VACUUM INTO`, failų trynimas), o planuoklis kartoja `createReminderScheduler` formą su įšvirkščiamu laikrodžiu. Aplanką nurodo naudotojas nustatymų lange; Electron pusėje pridedamas aplanko parinkimo tiltas.

**Tech Stack:** ta pati kaip visame projekte — TypeScript strict, better-sqlite3, Vitest, React, Electron preload + IPC.

**Specifikacija:** `docs/superpowers/specs/2026-08-17-atsargines-kopijos-design.md`

## Global Constraints

- **Node 22+**, TypeScript `strict: true`. Jokio `any` viešose signatūrose. `npm run typecheck` — realūs vartai.
- **Reliatyvūs importai rašomi su `.js` galūne**, nors failai yra `.ts`/`.tsx`. Nekeisk į beplėtinius.
- **`electron` importuoja tik langus valdantys apvalkalai:** `main.ts`, `tray.ts`, `windows.ts`, `reminderWindows.ts`, preload.
- **Kopijavimui naudojamas `VACUUM INTO`, ne failo kopijavimas** — WAL režimu dalis įrašytų duomenų gali gulėti `-wal` faile.
- **Rotacija trina TIK `tasks-YYYY-MM-DD.db` ir `tasks-YYYY-MM-DD.csv`.** Aplanką nurodo naudotojas ir jame gali gulėti jo failai. Jokio trynimo pagal failų sistemos laiko žymą.
- **CSV: kabliataškis kaip skirtukas, UTF-8 su BOM, `\r\n` eilučių pabaigos.** Kitaip lietuviškas Excel failą sulaužo.
- **Naujas planuoklis stabdomas `before-quit`, prieš `db.close()`** — kartu su priminimų planuokliu ir nustatymų sekykle. „Liečia bazę po uždarymo" šiame projekte pasirodė tris kartus.
- Vartotojui matomi tekstai — lietuviški.

---

## Failų struktūra

```
src/core/backup.ts              CSV, rotacija, rašymas, planuoklis
src/core/settings.ts            (+3 raktai ir validatoriai)
src/desktop/main.ts             (+planuoklio paleidimas, aplanko IPC, numatytojo kelio inicializacija)
src/desktop/preload.cjs         (+pickBackupDir tiltas)
src/ui/settings/SettingsView.tsx (+aplanko laukas ir būsenos eilutė)
tests/core/backup.test.ts
```

---

### Task 1: CSV formavimas

Gryna funkcija. Čia gyvena visos Excel suderinamumo smulkmenos.

**Files:**
- Create: `src/core/backup.ts`
- Test: `tests/core/backup.test.ts`

**Interfaces:**
- Consumes: `Task` iš `./types.js`
- Produces: `tasksToCsv(tasks: Task[]): string`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/backup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/core/types.js';
import { tasksToCsv } from '../../src/core/backup.js';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'x', title: 'Nupirkti pieną', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-14T10:00:00.000Z', updated_at: '2026-08-14T10:00:00.000Z',
    completed_at: null, ...over,
  };
}

describe('tasksToCsv', () => {
  it('prasideda BOM ir lietuviška antrašte', () => {
    const csv = tasksToCsv([]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Pavadinimas;Būsena;Prioritetas;Terminas;Priminimas;Sukurta;Atlikta');
  });

  it('naudoja kabliataškį ir CRLF', () => {
    const csv = tasksToCsv([task()]);
    expect(csv).toContain('\r\n');
    expect(csv).not.toContain('Pavadinimas,Būsena');
  });

  it('būsenas ir prioritetus verčia į lietuviškus', () => {
    const csv = tasksToCsv([
      task({ id: 'a', title: 'A', status: 'todo', priority: 1 }),
      task({ id: 'b', title: 'B', status: 'doing', priority: 2 }),
      task({ id: 'c', title: 'C', status: 'done', priority: 3 }),
    ]);
    expect(csv).toContain('A;Reikia padaryti;Aukštas;');
    expect(csv).toContain('B;Vykdoma;Vidutinis;');
    expect(csv).toContain('C;Atlikta;Žemas;');
  });

  it('tuščias reikšmes palieka tuščias, ne „null"', () => {
    const csv = tasksToCsv([task()]);
    expect(csv).not.toContain('null');
    expect(csv).toContain('Nupirkti pieną;Reikia padaryti;Vidutinis;;;');
  });

  it('ekranuoja kabliataškį, kabutes ir eilutės lūžį pavadinime', () => {
    const csv = tasksToCsv([
      task({ id: 'a', title: 'Pirkti: pieno; duonos' }),
      task({ id: 'b', title: 'Perskaityti "Anykščių šilelį"' }),
      task({ id: 'c', title: 'Pirma\nantra' }),
    ]);
    expect(csv).toContain('"Pirkti: pieno; duonos"');
    expect(csv).toContain('"Perskaityti ""Anykščių šilelį"""');
    expect(csv).toContain('"Pirma\nantra"');
  });

  it('perduoda terminą, priminimą ir atlikimo laiką', () => {
    const csv = tasksToCsv([
      task({ due_at: '2026-08-20T18:00', due_has_time: true, remind_at: '2026-08-20T18:00',
             status: 'done', completed_at: '2026-08-21T09:12:00.000Z' }),
    ]);
    expect(csv).toContain('2026-08-20T18:00;2026-08-20T18:00;2026-08-14T10:00:00.000Z;2026-08-21T09:12:00.000Z');
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/backup.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/backup.js"`

- [ ] **Step 3: Parašyti realizaciją**

`src/core/backup.ts`:

```ts
import type { Priority, Status, Task } from './types.js';

const STATUS_LABELS: Record<Status, string> = {
  todo: 'Reikia padaryti',
  doing: 'Vykdoma',
  done: 'Atlikta',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Aukštas',
  2: 'Vidutinis',
  3: 'Žemas',
};

const HEADER = 'Pavadinimas;Būsena;Prioritetas;Terminas;Priminimas;Sukurta;Atlikta';

function cell(value: string | null): string {
  const s = value ?? '';
  // Kabliataškis, kabutė ar eilutės lūžis laukelyje sulaužytų stulpelius, tad
  // toks laukelis gaubiamas kabutėmis, o kabutės viduje dvigubinamos.
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tasksToCsv(tasks: Task[]): string {
  const rows = tasks.map((t) =>
    [
      cell(t.title),
      cell(STATUS_LABELS[t.status]),
      cell(PRIORITY_LABELS[t.priority]),
      cell(t.due_at),
      cell(t.remind_at),
      cell(t.created_at),
      cell(t.completed_at),
    ].join(';'),
  );

  // BOM — be jo Excel iš „Nunešti baterijas" padaro „NuneÅ¡ti".
  // CRLF — Excel to tikisi; LF vienas kai kuriose versijose sulipdo eilutes.
  return `\uFEFF${[HEADER, ...rows].join('\r\n')}\r\n`;
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/backup.test.ts`
Expected: PASS, 6 testai

- [ ] **Step 5: Commit**

```bash
git add src/core/backup.ts tests/core/backup.test.ts
git commit -m "feat: užduočių CSV formavimas atsarginėms kopijoms"
```

---

### Task 2: Failų vardai ir rotacijos sprendimas

Grynos funkcijos. Rotacija yra pavojingiausia funkcijos dalis — testai čia svarbesni nei realizacija.

**Files:**
- Modify: `src/core/backup.ts`
- Test: `tests/core/backup.test.ts`

**Interfaces:**
- Produces: `backupNames(date: string): { db: string; csv: string }`, `BACKUP_RE: RegExp`, `expiredBackupDates(files: string[], keep: number): string[]`

- [ ] **Step 1: Parašyti krentančius testus**

Pridėti į `tests/core/backup.test.ts`:

```ts
import { backupNames, expiredBackupDates } from '../../src/core/backup.js';

describe('backupNames', () => {
  it('sudaro abiejų failų vardus iš datos', () => {
    expect(backupNames('2026-08-17')).toEqual({
      db: 'tasks-2026-08-17.db',
      csv: 'tasks-2026-08-17.csv',
    });
  });
});

describe('expiredBackupDates', () => {
  it('palieka naujausias N datų, grąžina likusias', () => {
    const files = [
      'tasks-2026-08-11.db', 'tasks-2026-08-11.csv',
      'tasks-2026-08-12.db', 'tasks-2026-08-12.csv',
      'tasks-2026-08-13.db', 'tasks-2026-08-13.csv',
    ];
    expect(expiredBackupDates(files, 2)).toEqual(['2026-08-11']);
  });

  it('nieko negrąžina, kai datų mažiau nei riba', () => {
    expect(expiredBackupDates(['tasks-2026-08-11.db'], 7)).toEqual([]);
  });

  it('IGNORUOJA svetimus failus aplanke', () => {
    // Aplanką nurodo naudotojas — jame gali gulėti bet kas. Rotacija privalo
    // liesti tik savo šabloną, kitaip sunaikintų svetimus duomenis.
    const files = [
      'tasks-2026-08-11.db', 'tasks-2026-08-12.db', 'tasks-2026-08-13.db',
      'nuotrauka.jpg', 'tasks.db', 'tasks-2026-08-13.db.bak',
      'tasks-2026-8-1.db', 'senas-tasks-2026-08-10.db',
    ];
    expect(expiredBackupDates(files, 2)).toEqual(['2026-08-11']);
  });

  it('viena data suskaičiuojama vieną kartą, nors failai du', () => {
    const files = [
      'tasks-2026-08-11.db', 'tasks-2026-08-11.csv',
      'tasks-2026-08-12.db', 'tasks-2026-08-12.csv',
    ];
    expect(expiredBackupDates(files, 2)).toEqual([]);
  });
});
```

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/backup.test.ts`
Expected: FAIL — `backupNames is not a function`

- [ ] **Step 3: Parašyti realizaciją**

Pridėti į `src/core/backup.ts`:

```ts
// Griežtas šablonas su pilnai užpildyta data: `tasks-2026-8-1.db` netinka,
// `tasks-2026-08-13.db.bak` netinka, `senas-tasks-...` netinka. Aplanke gali
// gulėti naudotojo failai, ir nė vienas iš jų neturi patekti į trynimą.
export const BACKUP_RE = /^tasks-(\d{4}-\d{2}-\d{2})\.(db|csv)$/;

export function backupNames(date: string): { db: string; csv: string } {
  return { db: `tasks-${date}.db`, csv: `tasks-${date}.csv` };
}

export function expiredBackupDates(files: string[], keep: number): string[] {
  const dates = new Set<string>();
  for (const name of files) {
    const match = BACKUP_RE.exec(name);
    if (match !== null) dates.add(match[1]);
  }
  // Data imama iš pavadinimo, ne iš failų sistemos laiko žymos:
  // sinchronizuojami aplankai (OneDrive) laiko žymas keičia.
  return [...dates].sort().reverse().slice(keep).sort();
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/backup.test.ts`
Expected: PASS, 11 testų

- [ ] **Step 5: Commit**

```bash
git add src/core/backup.ts tests/core/backup.test.ts
git commit -m "feat: atsarginių kopijų vardai ir rotacijos sprendimas"
```

---

### Task 3: Rašymas į diską

**Files:**
- Modify: `src/core/backup.ts`
- Test: `tests/core/backup.test.ts`

**Interfaces:**
- Consumes: `openDb` iš `./db.js`; `tasksToCsv`, `backupNames`, `expiredBackupDates`, `BACKUP_RE`
- Produces: `writeBackup(db: Database.Database, tasks: Task[], dir: string, date: string): void`, `pruneBackups(dir: string, keep: number): void`

- [ ] **Step 1: Parašyti krentančius testus**

Pridėti į `tests/core/backup.test.ts`:

```ts
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../src/core/db.js';
import { fixedClock } from '../../src/core/clock.js';
import { createTaskStore } from '../../src/core/tasks.js';
import { pruneBackups, writeBackup } from '../../src/core/backup.js';

describe('writeBackup', () => {
  it('sukuria abu failus, o .db atsidaro kaip veikianti bazė', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskerpro-kopija-'));
    const dbPath = join(dir, 'tasks.db');
    const db = openDb(dbPath);
    const store = createTaskStore(db, fixedClock('2026-08-17T10:00:00'));
    store.create({ title: 'Nupirkti pieną' });

    const target = join(dir, 'kopijos');
    writeBackup(db, store.list(), target, '2026-08-17');
    db.close();

    expect(existsSync(join(target, 'tasks-2026-08-17.db'))).toBe(true);
    expect(readFileSync(join(target, 'tasks-2026-08-17.csv'), 'utf8')).toContain('Nupirkti pieną');

    const copy = openDb(join(target, 'tasks-2026-08-17.db'));
    expect(createTaskStore(copy, fixedClock('2026-08-17T10:00:00')).list()).toHaveLength(1);
    copy.close();

    rmSync(dir, { recursive: true, force: true });
  });

  it('pakartotinai tą pačią dieną perrašo, o ne krenta', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskerpro-kopija-'));
    const db = openDb(join(dir, 'tasks.db'));
    const target = join(dir, 'kopijos');

    writeBackup(db, [], target, '2026-08-17');
    expect(() => writeBackup(db, [], target, '2026-08-17')).not.toThrow();

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('pruneBackups', () => {
  it('trina senas poras ir NELIEČIA svetimų failų', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskerpro-kopija-'));
    for (const name of [
      'tasks-2026-08-11.db', 'tasks-2026-08-11.csv',
      'tasks-2026-08-12.db', 'tasks-2026-08-12.csv',
      'tasks-2026-08-13.db', 'tasks-2026-08-13.csv',
      'svarbi-nuotrauka.jpg', 'tasks.db',
    ]) {
      writeFileSync(join(dir, name), 'x');
    }

    pruneBackups(dir, 2);

    const liko = readdirSync(dir).sort();
    expect(liko).toContain('svarbi-nuotrauka.jpg');
    expect(liko).toContain('tasks.db');
    expect(liko).not.toContain('tasks-2026-08-11.db');
    expect(liko).not.toContain('tasks-2026-08-11.csv');
    expect(liko).toContain('tasks-2026-08-13.db');

    rmSync(dir, { recursive: true, force: true });
  });

  it('neegzistuojančiame aplanke nekrenta', () => {
    expect(() => pruneBackups(join(tmpdir(), 'taskerpro-nera-tokio-aplanko'), 7)).not.toThrow();
  });
});
```

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/backup.test.ts`
Expected: FAIL — `writeBackup is not a function`

- [ ] **Step 3: Parašyti realizaciją**

Pridėti į `src/core/backup.ts`:

```ts
import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
```

```ts
export function writeBackup(
  db: Database.Database,
  tasks: Task[],
  dir: string,
  date: string,
): void {
  mkdirSync(dir, { recursive: true });
  const names = backupNames(date);
  const dbPath = join(dir, names.db);

  // VACUUM INTO nepavyksta, jei failas jau yra — tad tos dienos kopija
  // pašalinama, kad pakartotinis paleidimas nesulaužytų kopijavimo.
  rmSync(dbPath, { force: true });
  db.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`);

  writeFileSync(join(dir, names.csv), tasksToCsv(tasks), 'utf8');
}

export function pruneBackups(dir: string, keep: number): void {
  if (!existsSync(dir)) return;

  for (const date of expiredBackupDates(readdirSync(dir), keep)) {
    const names = backupNames(date);
    rmSync(join(dir, names.db), { force: true });
    rmSync(join(dir, names.csv), { force: true });
  }
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/backup.test.ts`
Expected: PASS, 15 testų

- [ ] **Step 5: Commit**

```bash
git add src/core/backup.ts tests/core/backup.test.ts
git commit -m "feat: atsarginės kopijos rašymas ir rotacija diske"
```

---

### Task 4: Planuoklis ir nustatymų raktai

**Files:**
- Modify: `src/core/backup.ts`, `src/core/settings.ts`
- Test: `tests/core/backup.test.ts`, `tests/core/settings.test.ts`

**Interfaces:**
- Consumes: `TaskStore`, `createSettingsStore` rezultatas, `Clock`, `formatLocalDate`
- Produces: `createBackupScheduler(deps): { tick(): void; start(intervalMs: number): () => void }`; `SettingsMap` papildomas `backup_dir: string`, `last_backup: string | null`, `last_backup_error: string | null`

- [ ] **Step 1: Papildyti nustatymus**

`src/core/settings.ts` — į `SettingsMap`:

```ts
  backup_dir: string;
  last_backup: string | null;
  last_backup_error: string | null;
```

Į `SETTING_DEFAULTS` (prieš `Object.freeze` uždarymą):

```ts
  // Tuščia reiškia „dar nenustatyta" — `main.ts` startuojant įrašo numatytąjį
  // kelią. `core` negali kreiptis į `server/index.ts` dataDir, tad kelias
  // atkeliauja iš išorės.
  backup_dir: '',
  last_backup: null,
  last_backup_error: null,
```

Į `VALIDATORS`:

```ts
  backup_dir: (v) => typeof v === 'string',
  last_backup: (v) => v === null || typeof v === 'string',
  last_backup_error: (v) => v === null || typeof v === 'string',
```

Pridėti testą į `tests/core/settings.test.ts`:

```ts
describe('atsarginių kopijų nustatymai', () => {
  it('numatytieji yra tuščias kelias ir jokios istorijos', () => {
    const s = store.getAll();
    expect(s.backup_dir).toBe('');
    expect(s.last_backup).toBeNull();
    expect(s.last_backup_error).toBeNull();
  });

  it('priima kelią ir datą', () => {
    store.patch({ backup_dir: 'D:\\Kopijos', last_backup: '2026-08-17' });
    expect(store.getAll().backup_dir).toBe('D:\\Kopijos');
    expect(store.getAll().last_backup).toBe('2026-08-17');
  });

  it('atmeta ne tekstinį kelią', () => {
    expect(() => store.patch({ backup_dir: 7 as never })).toThrow('Netinkama nustatymo reikšmė: backup_dir');
  });
});
```

- [ ] **Step 2: Parašyti krentantį planuoklio testą**

Pridėti į `tests/core/backup.test.ts`:

```ts
import { createSettingsStore } from '../../src/core/settings.js';
import { createBackupScheduler } from '../../src/core/backup.js';

describe('createBackupScheduler', () => {
  function setup(dirName: string) {
    const dir = mkdtempSync(join(tmpdir(), dirName));
    const db = openDb(join(dir, 'tasks.db'));
    const clock = fixedClock('2026-08-17T09:00:00');
    const tasks = createTaskStore(db, clock);
    const settings = createSettingsStore(db);
    settings.patch({ backup_dir: join(dir, 'kopijos') });
    const scheduler = createBackupScheduler({ db, tasks, settings, clock, keep: 7 });
    return { dir, db, clock, tasks, settings, tick: scheduler.tick };
  }

  it('padaro kopiją ir užfiksuoja datą', () => {
    const s = setup('taskerpro-plan-');
    s.tasks.create({ title: 'A' });

    s.tick();

    expect(existsSync(join(s.dir, 'kopijos', 'tasks-2026-08-17.db'))).toBe(true);
    expect(s.settings.getAll().last_backup).toBe('2026-08-17');
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('tą pačią parą antrą kartą nekartoja', () => {
    const s = setup('taskerpro-plan-');
    s.tick();
    const pirma = readFileSync(join(s.dir, 'kopijos', 'tasks-2026-08-17.csv'), 'utf8');

    s.tasks.create({ title: 'Vėliau pridėta' });
    s.clock.set('2026-08-17T23:00:00');
    s.tick();

    expect(readFileSync(join(s.dir, 'kopijos', 'tasks-2026-08-17.csv'), 'utf8')).toBe(pirma);
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('praleistą parą pagauna kitą dieną', () => {
    const s = setup('taskerpro-plan-');
    s.tick();
    s.clock.set('2026-08-19T08:00:00');
    s.tick();

    expect(existsSync(join(s.dir, 'kopijos', 'tasks-2026-08-19.db'))).toBe(true);
    expect(s.settings.getAll().last_backup).toBe('2026-08-19');
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('nepavykus įrašo klaidą, NEatnaujina last_backup ir nemeta išimties', () => {
    const s = setup('taskerpro-plan-');
    // Failas vietoje aplanko — mkdirSync nepavyks.
    const kelias = join(s.dir, 'ne-aplankas');
    writeFileSync(kelias, 'x');
    s.settings.patch({ backup_dir: kelias });

    expect(() => s.tick()).not.toThrow();

    expect(s.settings.getAll().last_backup).toBeNull();
    expect(s.settings.getAll().last_backup_error).not.toBeNull();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('tuščias aplanko kelias praleidžiamas be klaidos', () => {
    const s = setup('taskerpro-plan-');
    s.settings.patch({ backup_dir: '' });

    s.tick();

    expect(s.settings.getAll().last_backup).toBeNull();
    expect(s.settings.getAll().last_backup_error).toBeNull();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/backup.test.ts tests/core/settings.test.ts`
Expected: FAIL — `createBackupScheduler is not a function`

- [ ] **Step 4: Parašyti planuoklį**

Pridėti į `src/core/backup.ts`:

```ts
import type { Clock } from './clock.js';
import { formatLocalDate } from './datetime.js';
import type { createSettingsStore } from './settings.js';
import type { TaskStore } from './tasks.js';
```

```ts
export interface BackupSchedulerDeps {
  db: Database.Database;
  tasks: TaskStore;
  settings: ReturnType<typeof createSettingsStore>;
  clock: Clock;
  keep: number;
}

export interface BackupScheduler {
  tick(): void;
  start(intervalMs: number): () => void;
}

export function createBackupScheduler(deps: BackupSchedulerDeps): BackupScheduler {
  const { db, tasks, settings, clock, keep } = deps;

  const tick = (): void => {
    const today = formatLocalDate(clock.now());
    const current = settings.getAll();

    if (current.backup_dir === '' || current.last_backup === today) return;

    try {
      writeBackup(db, tasks.list(), current.backup_dir, today);
      pruneBackups(current.backup_dir, keep);
      settings.patch({ last_backup: today, last_backup_error: null });
    } catch (err) {
      const message = (err as Error).message;
      // `last_backup` NEatnaujinamas — kita proga bandoma iš naujo. Klaida
      // rašoma tik pasikeitus, kitaip žurnalas ir bazė gautų įrašą kas 15 s.
      if (message !== current.last_backup_error) {
        console.error('Nepavyko padaryti atsarginės kopijos:', err);
        settings.patch({ last_backup_error: message });
      }
    }
  };

  return {
    tick,
    start(intervalMs) {
      const handle = setInterval(tick, intervalMs);
      return () => clearInterval(handle);
    },
  };
}
```

- [ ] **Step 5: Paleisti testus**

Run: `npm test`
Expected: PASS, visi

- [ ] **Step 6: Commit**

```bash
git add src/core/backup.ts src/core/settings.ts tests/core/backup.test.ts tests/core/settings.test.ts
git commit -m "feat: atsarginių kopijų planuoklis ir nustatymų raktai"
```

---

### Task 5: Sujungimas — Electron, sąsaja, dokumentacija

**Files:**
- Modify: `src/desktop/main.ts`, `src/desktop/preload.cjs`, `src/ui/settings/SettingsView.tsx`, `README.md`
- Test: `tests/ui/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `createBackupScheduler` iš `core/backup.js`; `dataDir` iš `server/index.js`
- Produces: preload tiltas `pickBackupDir(): Promise<string | null>`

- [ ] **Step 1: Praplėsti preload tiltą**

`src/desktop/preload.cjs` — į `exposeInMainWorld` objektą pridėti:

```js
  pickBackupDir: () => ipcRenderer.invoke('backup:pick'),
```

- [ ] **Step 2: Prijungti planuoklį ir aplanko parinkimą**

`src/desktop/main.ts`:

```ts
import { createBackupScheduler } from '../core/backup.js';
```

Startuojant, šalia `syncAutostart` — inicializuoti numatytąjį kelią. Tai daroma čia, o ne `core/settings.ts`, nes `core` negali kreiptis į serverio `dataDir`:

```ts
      if (settingsStore.getAll().backup_dir === '') {
        settingsStore.patch({ backup_dir: join(dataDir(), 'backups') });
      }
```

Paleisti planuoklį šalia priminimų:

```ts
      const stopBackups = createBackupScheduler({
        db,
        tasks: store,
        settings: settingsStore,
        clock: systemClock,
        keep: 7,
      }).start(15_000);
```

Aplanko parinkimas — `dialog` jau importuotas:

```ts
      ipcMain.handle('backup:pick', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return result.canceled ? null : result.filePaths[0];
      });
```

**Į `before-quit` tvarkyklę, prieš `db.close()`**, pridėti `stopBackups()` — kartu su `stopScheduler()` ir `clearInterval(stopSettingsWatch)`:

```ts
      app.on('before-quit', () => {
        reminderWindows.beginShutdown();
        tray?.destroy();
        tray = null;
        stopScheduler();
        stopBackups();
        clearInterval(stopSettingsWatch);
        db.close();
      });
```

Tai nėra smulkmena: planuoklis skaito bazę, o „liečia bazę po uždarymo" šiame projekte pasirodė tris kartus.

- [ ] **Step 3: Parašyti krentantį sąsajos testą**

Pridėti į `tests/ui/SettingsView.test.tsx`:

```tsx
  it('rodo kopijų aplanką ir leidžia jį pakeisti nuėjus nuo lauko', () => {
    const onChange = renderView({ backup_dir: 'D:\\Kopijos' });
    const laukas = screen.getByLabelText('Kopijų aplankas');
    expect((laukas as HTMLInputElement).value).toBe('D:\\Kopijos');

    fireEvent.change(laukas, { target: { value: 'E:\\Kitas' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(laukas);
    expect(onChange).toHaveBeenCalledWith({ backup_dir: 'E:\\Kitas' });
  });

  it('rodo paskutinės kopijos būseną', () => {
    renderView({ last_backup: '2026-08-17' });
    expect(screen.getByText('Paskutinė kopija: 2026-08-17')).toBeDefined();
  });

  it('nepavykusią kopiją parodo su priežastimi', () => {
    renderView({ last_backup_error: 'ENOENT: kelias nerastas' });
    expect(screen.getByText(/nepavyko/i)).toBeDefined();
    expect(screen.getByText(/ENOENT: kelias nerastas/)).toBeDefined();
  });

  it('dar nedarytą kopiją pasako aiškiai', () => {
    renderView({});
    expect(screen.getByText('Paskutinė kopija: dar nedaryta')).toBeDefined();
  });
```

`renderView` jau priima `Partial<SettingsMap>` (`tests/ui/SettingsView.test.tsx:12`), tad naujiems testams jos keisti nereikia.

- [ ] **Step 4: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/SettingsView.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Kopijų aplankas`

- [ ] **Step 5: Papildyti nustatymų langą**

`src/ui/settings/SettingsView.tsx` — juodraštis, kaip ir porto lauke:

```tsx
  const [dirDraft, setDirDraft] = useState(settings.backup_dir);
```

Prieš „Planšetei" skiltį įterpti:

```tsx
      <label>
        Kopijų aplankas
        <input
          type="text"
          value={dirDraft}
          onChange={(e) => setDirDraft(e.target.value)}
          onBlur={() => {
            if (dirDraft !== settings.backup_dir) onChange({ backup_dir: dirDraft });
          }}
        />
      </label>
      {typeof window.taskerpro?.pickBackupDir === 'function' && (
        <button
          type="button"
          onClick={() => {
            void window.taskerpro?.pickBackupDir?.().then((kelias) => {
              if (kelias !== null && kelias !== undefined) {
                setDirDraft(kelias);
                onChange({ backup_dir: kelias });
              }
            });
          }}
        >
          Parinkti aplanką
        </button>
      )}
      <p className="ispejimas">
        Kopija šalia originalo apsaugo nuo sugadinto failo, bet ne nuo mirusio disko.
        Nurodyk OneDrive, Dropbox ar tinklo disko aplanką.
      </p>
      <p>
        {settings.last_backup_error !== null
          ? `Paskutinė kopija: nepavyko — ${settings.last_backup_error}`
          : settings.last_backup !== null
            ? `Paskutinė kopija: ${settings.last_backup}`
            : 'Paskutinė kopija: dar nedaryta'}
      </p>
```

Mygtukas rodomas tik tada, kai tiltas yra: nustatymų puslapį galima atidaryti ir planšetės naršyklėje, kur `window.taskerpro` neegzistuoja, o aplanko parinkimo dialogas ten neturi prasmės.

Praplėsti `window.taskerpro` tipą faile `src/ui/quick-add/window.d.ts`, kuriame jis jau aprašytas (`hidePopup`, `openBoard`):

```ts
    pickBackupDir?: () => Promise<string | null>;
```

- [ ] **Step 6: Papildyti README**

Į „Žinomi apribojimai" skiltį prieš esamus punktus įterpti:

```markdown
## Atsarginės kopijos

Kartą per parą į nustatymuose nurodytą aplanką įrašoma visa bazė
(`tasks-2026-08-17.db`) ir jos CSV kopija. Laikomos septynios paskutinės.

**Numatytasis aplankas yra šalia duomenų bazės, ir tai apsaugo tik nuo sugadinto
failo.** Nuo mirusio disko apsaugo tik kopija kitoje vietoje — nurodyk OneDrive,
Dropbox ar tinklo disko aplanką nustatymuose.

Atkūrimas: išjunk programą, nukopijuok pasirinktą `tasks-YYYY-MM-DD.db` vietoje
`%APPDATA%\taskerpro\tasks.db` ir paleisk iš naujo. Atkūrimo mygtuko sąsajoje
sąmoningai nėra — jis prireikia kartą per gyvenimą, o klaidingai paspaustas
sunaikintų dabartinius duomenis.
```

- [ ] **Step 7: Paleisti viską**

Run: `npm test`
Expected: PASS

Run: `npm run typecheck`
Expected: švaru

Run: `npm run build`
Expected: švaru

- [ ] **Step 8: Rankinė patikra**

Run: `npm run app`

1. Nustatymuose matomas kopijų aplankas su numatytuoju keliu
2. „Parinkti aplanką" atidaro Windows dialogą ir įrašo pasirinkimą
3. Palaukus iki 15 s, nurodytame aplanke atsiranda `tasks-<šiandien>.db` ir `.csv`
4. CSV atsidaro Excel'iu su teisingais stulpeliais ir lietuviškomis raidėmis
5. Nustatymuose atsiranda „Paskutinė kopija: <šiandienos data>"
6. Nurodžius neegzistuojantį kelią (pvz. `Z:\nera`), po ciklo rodoma „nepavyko" su priežastimi, o programa veikia toliau
7. Programa išsijungia švariai, be klaidos lango

- [ ] **Step 9: Commit**

```bash
git add src/desktop/main.ts src/desktop/preload.cjs src/ui/settings src/ui/settings/*.d.ts tests/ui/SettingsView.test.tsx README.md
git commit -m "feat: atsarginių kopijų aplankas nustatymuose ir planuoklio prijungimas"
```

---

## Pabaigos patikra

- Kartą per parą atsiranda `tasks-YYYY-MM-DD.db` ir `.csv` nurodytame aplanke
- Laikomos septynios poros; svetimi failai aplanke nepaliesti
- CSV atsidaro lietuvišku Excel'iu be sugadintų raidžių
- Nepavykus kopija nekartojama tyliai — būsena matoma nustatymuose
- Programa išsijungia švariai: planuoklis sustabdomas prieš uždarant bazę
