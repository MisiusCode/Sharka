# TaskerPro 2 fazė: Electron apvalkalas — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paversti 1 fazės serverį nuolat veikiančia Windows programa: tray ikona, globalus karštasis klavišas ir iššokantis langelis prie laikrodžio.

**Architecture:** Electron pagrindinis procesas paleidžia tą patį `startServer` iš 1 fazės ir prideda langus. Visa logika, kurią įmanoma atskirti nuo Electron — lango pozicija, karštojo klavišo registracija — gyvena grynuose moduliuose su įšvirkščiamomis priklausomybėmis ir yra testuojama. Pati Electron sąsaja tikrinama rankiniu sąrašu, nes langų automatizavimas kainuotų daugiau, nei duotų.

**Tech Stack:** Electron 33+ (ESM pagrindiniame procese), React, Vite kelių puslapių režimu.

**Ankstesnis planas:** `docs/superpowers/plans/2026-08-14-taskerpro-1-faze-core-serveris-lenta.md`

## Global Constraints

Galioja visos 1 fazės sąlygos, plius:

- **Natyvaus modulio ABI — patikrinta, perkompiliavimo NEREIKIA.** `better-sqlite3` užsikrauna Electron pagrindiniame procese be jokių papildomų veiksmų, nes Electron 43 pakuoja Node 24.18.1, o kūrimo mašinoje Node 24.17.0 — tas pats ABI (137). Tai laimingas sutapimas, ne garantija: pakeitus Electron arba Node major versiją, tai gali sugriūti su `NODE_MODULE_VERSION` klaida. Tada prireiktų `@electron/rebuild` ir dviejų skriptų (`rebuild:electron` prieš programą, `rebuild:node` prieš testus), nes vienas binaras abiejų aptarnauti negali.
- **`ELECTRON_RUN_AS_NODE` privalo būti išvalytas paleidžiant programą.** VS Code ir jo terminalai šį kintamąjį nustato saviems procesams, o jis verčia `electron.exe` elgtis kaip paprastas Node: `import { app } from 'electron'` tada nusprendžia į npm apvalkalą, kuris eksportuoja binaro kelią kaip eilutę, ir `app` būna `undefined`. Simptomai atrodo kaip ESM nesuderinamumas, nors kodas visiškai tvarkingas. Todėl `app` skriptas kintamąjį išvalo: `cross-env ELECTRON_RUN_AS_NODE= electron .`. **ESM pagrindiniame procese veikia be priekaištų** — įvardyti importai iš `electron` patikrinti Electron 43.
- **Pagrindinis procesas neturi tiesioginės prieigos prie SQLite.** Langai kreipiasi į `http://127.0.0.1:<portas>` — tą patį API, kurį naudoja planšetė.
- **Grynieji `src/desktop/` moduliai priima Electron API kaip argumentą**, o ne importuoja `electron` tiesiogiai. Importuoja tik `main.ts`.
- Vartotojui matomi tekstai — lietuviški, tikslios eilutės nurodytos užduotyse.

---

## Failų struktūra

```
src/desktop/
  windowPosition.ts   popupBounds — grynas lango pozicijos skaičiavimas
  hotkey.ts           createHotkeyManager — registracija su įšvirkščiamu API
  windows.ts          langų kūrimas ir gyvavimas
  tray.ts             tray ikona ir meniu
  main.ts             Electron įėjimo taškas
  assets/icon.png

src/ui/quick-add/     tray langelio ekranas
  index.html  main.tsx  QuickAddScreen.tsx
src/ui/components/
  GroupedList.tsx     užduočių sąrašas su sekcijų antraštėmis
```

---

### Task 1: Electron karkasas ir kompiliavimas

**Files:**
- Create: `src/desktop/main.ts`, `tsconfig.build.json`, `src/desktop/assets/icon.png`
- Modify: `package.json`, `vite.config.ts`

**Interfaces:**
- Consumes: `startServer` iš `src/server/index.ts`
- Produces: sukompiliuotas `dist/desktop/main.js`, kurį paleidžia `npm run app`

- [ ] **Step 1: Įdiegti Electron ir sukurti build konfigūraciją**

```bash
npm i -D electron
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "outDir": "dist", "noEmit": false, "rootDir": "src" },
  "include": ["src/core", "src/server", "src/desktop"]
}
```

`package.json` — pridėti `main` ir skriptus:

```json
{
  "main": "dist/desktop/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.build.json && vite build",
    "app": "npm run build && electron ."
  }
}
```

Ikoną `src/desktop/assets/icon.png` (256×256, permatomas fonas) reikia nukopijuoti į `dist` po kompiliavimo — papildyti `build` skriptą:

```json
"build": "tsc -p tsconfig.build.json && vite build && node -e \"require('fs').cpSync('src/desktop/assets','dist/desktop/assets',{recursive:true})\""
```

- [ ] **Step 2: Parašyti pagrindinį procesą**

`src/desktop/main.ts`:

```ts
import { app, dialog } from 'electron';
import { join } from 'node:path';
import { startServer } from '../server/index.js';

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady()
    .then(async () => {
      const { port } = await startServer(join(app.getAppPath(), 'dist/ui'));
      console.log(`TaskerPro klausosi porto ${port}`);
    })
    .catch((err: unknown) => {
      // Be šito užimti visi portai (arba natyvaus modulio ABI klaida) reikštų
      // tylų atmestą pažadą: programa liktų kaboti be serverio ir be jokio
      // ženklo naudotojui.
      dialog.showErrorBox('TaskerPro', `Nepavyko paleisti serverio:\n${String(err)}`);
      app.quit();
    });

  // Programa gyvena tray'uje — uždaryti visus langus nereiškia išeiti.
  app.on('window-all-closed', () => {});
}
```

- [ ] **Step 3: Patikrinti, kad programa pasileidžia**

Run: `npm run app`
Expected: procesas lieka veikti, konsolėje `TaskerPro klausosi porto 8080`, o naršyklėje `http://localhost:8080` rodoma 1 fazės lenta.

**Jei `app` yra `undefined`** — patikrink `ELECTRON_RUN_AS_NODE`. VS Code jį nustato, ir tada `electron.exe` sukasi kaip paprastas Node. Būtent tam `app` skripte yra `cross-env ELECTRON_RUN_AS_NODE=`; paleidžiant binarą ranka kintamąjį reikia išvalyti pačiam.

**Jei matai `NODE_MODULE_VERSION` neatitikimą** — Electron ir Node ABI išsiskyrė (šiame projekte jie sutampa). Tada reikia `@electron/rebuild` ir dviejų skriptų, `rebuild:electron` bei `rebuild:node`, perjungiant tarp programos ir testų.

Antras `npm run app` tame pačiame kompiuteryje turi iš karto baigtis (vieno egzemplioriaus užraktas).

- [ ] **Step 4: Įsitikinti, kad 1 fazės testai nesulūžo**

Run: `npm test`
Expected: PASS, visi testai

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.build.json src/desktop
git commit -m "feat: Electron karkasas su vieno egzemplioriaus užraktu"
```

---

### Task 2: Iššokančio lango pozicijos skaičiavimas

Gryna funkcija — vienintelė lango elgsenos dalis, kurią verta ir įmanoma padengti testais.

**Files:**
- Create: `src/desktop/windowPosition.ts`
- Test: `tests/desktop/windowPosition.test.ts`

**Interfaces:**
- Produces: `Bounds { x, y, width, height }`, `popupBounds(tray: Bounds, workArea: Bounds, size: { width, height }): Bounds`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/desktop/windowPosition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { popupBounds } from '../../src/desktop/windowPosition.js';

const EKRANAS = { x: 0, y: 0, width: 1920, height: 1040 }; // juosta apačioje, 40px
const DYDIS = { width: 380, height: 480 };

describe('popupBounds', () => {
  it('juostai apačioje langą deda virš jos ir centruoja ties ikona', () => {
    const b = popupBounds({ x: 1700, y: 1040, width: 24, height: 40 }, EKRANAS, DYDIS);
    expect(b.y + b.height).toBe(1032); // 8px tarpas nuo darbo srities apačios
    expect(b.x + b.width / 2).toBe(1712);
  });

  it('neleidžia langui išlįsti pro dešinį kraštą', () => {
    const b = popupBounds({ x: 1900, y: 1040, width: 24, height: 40 }, EKRANAS, DYDIS);
    expect(b.x + b.width).toBe(1912);
  });

  it('neleidžia langui išlįsti pro kairį kraštą', () => {
    const b = popupBounds({ x: 10, y: 1040, width: 24, height: 40 }, EKRANAS, DYDIS);
    expect(b.x).toBe(8);
  });

  it('juostai viršuje langą deda po ja', () => {
    const virsuje = { x: 0, y: 40, width: 1920, height: 1040 };
    const b = popupBounds({ x: 1700, y: 0, width: 24, height: 40 }, virsuje, DYDIS);
    expect(b.y).toBe(48);
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/desktop/windowPosition.test.ts`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti realizaciją**

`src/desktop/windowPosition.ts`:

```ts
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TARPAS = 8;

export function popupBounds(
  tray: Bounds,
  workArea: Bounds,
  size: { width: number; height: number },
): Bounds {
  const trayCenter = tray.x + tray.width / 2;
  const minX = workArea.x + TARPAS;
  // Ekrane, siauresniame už patį langą, maxX taptų mažesnis už minX ir
  // Math.min galutinai nustumtų langą už kairiojo krašto. Riba prispaudžiama.
  const maxX = Math.max(workArea.x + workArea.width - size.width - TARPAS, minX);
  const x = Math.min(Math.max(trayCenter - size.width / 2, minX), maxX);

  const trayBelowWorkArea = tray.y >= workArea.y + workArea.height;
  const y = trayBelowWorkArea
    ? workArea.y + workArea.height - size.height - TARPAS
    : workArea.y + TARPAS;

  return { x: Math.round(x), y: Math.round(y), ...size };
}
```

Juostos padėtis nustatoma pagal tai, ar tray ikona yra žemiau darbo srities: Windows darbo sritis (`workArea`) niekada neapima užduočių juostos, tad tai patikimesnis požymis nei ekrano aukščio lyginimas.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/desktop/windowPosition.test.ts`
Expected: PASS, 5 testai

- [ ] **Step 5: Commit**

```bash
git add src/desktop/windowPosition.ts tests/desktop/windowPosition.test.ts
git commit -m "feat: iššokančio lango pozicijos skaičiavimas"
```

---

### Task 3: Karštojo klavišo valdymas

**Files:**
- Create: `src/desktop/hotkey.ts`
- Test: `tests/desktop/hotkey.test.ts`

**Interfaces:**
- Produces: `ShortcutApi { register(acc, cb): boolean; unregister(acc): void }`, `createHotkeyManager(api): { apply(acc, cb): boolean; current(): string | null; dispose(): void }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/desktop/hotkey.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createHotkeyManager, type ShortcutApi } from '../../src/desktop/hotkey.js';

function fakeApi(succeeds = true): ShortcutApi & { registered: string[]; unregistered: string[] } {
  const registered: string[] = [];
  const unregistered: string[] = [];
  return {
    registered,
    unregistered,
    register: (acc) => { if (succeeds) registered.push(acc); return succeeds; },
    unregister: (acc) => { unregistered.push(acc); },
  };
}

describe('createHotkeyManager', () => {
  it('užregistruoja kombinaciją ir ją įsimena', () => {
    const api = fakeApi();
    const m = createHotkeyManager(api);
    expect(m.apply('Ctrl+Alt+Space', vi.fn())).toBe(true);
    expect(api.registered).toEqual(['Ctrl+Alt+Space']);
    expect(m.current()).toBe('Ctrl+Alt+Space');
  });

  it('keičiant kombinaciją seną atregistruoja', () => {
    const api = fakeApi();
    const m = createHotkeyManager(api);
    m.apply('Ctrl+Alt+Space', vi.fn());
    m.apply('Ctrl+Alt+T', vi.fn());
    expect(api.unregistered).toEqual(['Ctrl+Alt+Space']);
    expect(m.current()).toBe('Ctrl+Alt+T');
  });

  it('nepavykus registracijai grąžina false ir nieko neįsimena', () => {
    const m = createHotkeyManager(fakeApi(false));
    expect(m.apply('Ctrl+Alt+Space', vi.fn())).toBe(false);
    expect(m.current()).toBeNull();
  });

  it('dispose atregistruoja veikiančią kombinaciją', () => {
    const api = fakeApi();
    const m = createHotkeyManager(api);
    m.apply('Ctrl+Alt+Space', vi.fn());
    m.dispose();
    expect(api.unregistered).toEqual(['Ctrl+Alt+Space']);
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/desktop/hotkey.test.ts`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti realizaciją**

`src/desktop/hotkey.ts`:

```ts
export interface ShortcutApi {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export interface HotkeyManager {
  apply(accelerator: string, callback: () => void): boolean;
  current(): string | null;
  dispose(): void;
}

export function createHotkeyManager(api: ShortcutApi): HotkeyManager {
  let active: string | null = null;

  const release = (): void => {
    if (active !== null) {
      api.unregister(active);
      active = null;
    }
  };

  return {
    apply(accelerator, callback) {
      release();
      if (!api.register(accelerator, callback)) return false;
      active = accelerator;
      return true;
    },
    current: () => active,
    dispose: release,
  };
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/desktop/hotkey.test.ts`
Expected: PASS, 4 testai

- [ ] **Step 5: Commit**

```bash
git add src/desktop/hotkey.ts tests/desktop/hotkey.test.ts
git commit -m "feat: karštojo klavišo valdymas su registracijos klaidos apdorojimu"
```

---

### Task 4: Užduočių sąrašas su sekcijomis

Tray langelio sąrašas turi sekcijų antraštes pagal aktyvų grupavimą — tą patį nustatymą, kurį rodo lenta.

**Files:**
- Create: `src/ui/components/GroupedList.tsx`
- Test: `tests/ui/GroupedList.test.tsx`

**Interfaces:**
- Consumes: `DATE_BUCKETS`, `BUCKET_LABELS`, `dateBucketOf`, `sortTasks` iš `core/buckets.ts`; `TaskCard`
- Produces: `<GroupedList tasks grouping today onToggleDone onDelete onRename />`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/GroupedList.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Task } from '../../src/core/types.js';
import { GroupedList } from '../../src/ui/components/GroupedList.js';

const TODAY = '2026-08-14';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'A', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, ...over,
  };
}

function renderList(tasks: Task[], grouping: 'date' | 'status' = 'date') {
  render(
    <GroupedList
      tasks={tasks} grouping={grouping} today={TODAY}
      onToggleDone={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()}
    />,
  );
}

describe('GroupedList', () => {
  it('rodo tik tas sekcijas, kuriose yra užduočių', () => {
    renderList([task({ id: 'a' }), task({ id: 'b', due_at: '2026-08-15' })]);
    expect(screen.getByRole('heading', { name: 'Šiandien' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Rytoj' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Vėliau' })).toBeNull();
  });

  it('sekcijos eina laiko tvarka', () => {
    renderList([
      task({ id: 'a', due_at: '2026-09-30' }),
      task({ id: 'b', due_at: '2026-08-15' }),
      task({ id: 'c' }),
    ]);
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toEqual(['Šiandien', 'Rytoj', 'Vėliau']);
  });

  it('progreso režimu rodo būsenų antraštes', () => {
    renderList([task({ id: 'a', status: 'doing' })], 'status');
    expect(screen.getByRole('heading', { name: 'Vykdoma' })).toBeDefined();
  });

  it('tuščias sąrašas rodo paaiškinimą', () => {
    renderList([]);
    expect(screen.getByText('Užduočių nėra')).toBeDefined();
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/GroupedList.test.tsx`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti komponentą**

`src/ui/components/GroupedList.tsx`:

```tsx
import { BUCKET_LABELS, DATE_BUCKETS, dateBucketOf, sortTasks } from '../../core/buckets.js';
import type { Status, Task } from '../../core/types.js';
import type { DueValue } from './DueEditor.js';
import { TaskCard } from './TaskCard.js';

const STATUS_LABELS: Record<Status, string> = {
  todo: 'Reikia padaryti',
  doing: 'Vykdoma',
  done: 'Atlikta',
};
const STATUSES: Status[] = ['todo', 'doing', 'done'];

export interface GroupedListProps {
  tasks: Task[];
  grouping: 'date' | 'status';
  today: string;
  // `now` ir `onReschedule` yra PRIVALOMI, nes tokie jie yra ir TaskCard'e.
  // 1 fazės galutinė peržiūra pridėjo kortelei datos žymės redaktorių; padaryti
  // juos neprivalomais reikštų, kad pamiršus perduoti onReschedule naudotojo
  // datos pakeitimas dingtų tyliai, o `now` numatytasis `new Date()` sugriautų
  // gyvojo laikrodžio logiką.
  now: Date;
  onToggleDone(id: string, done: boolean): void;
  onDelete(id: string): void;
  onRename(id: string, title: string): void;
  onReschedule(id: string, due: DueValue): void;
}

export function GroupedList({ tasks, grouping, today, ...handlers }: GroupedListProps) {
  const sorted = sortTasks(tasks);

  const sections =
    grouping === 'status'
      ? STATUSES.map((s) => ({
          key: s,
          label: STATUS_LABELS[s],
          tasks: sorted.filter((t) => t.status === s),
        }))
      : DATE_BUCKETS.map((b) => ({
          key: b,
          label: BUCKET_LABELS[b],
          tasks: sorted.filter((t) => dateBucketOf(t, today) === b),
        }));

  const filled = sections.filter((s) => s.tasks.length > 0);
  if (filled.length === 0) return <p className="tuscia">Užduočių nėra</p>;

  return (
    <div className="sarasas">
      {filled.map((section) => (
        <section key={section.key}>
          <h3>{section.label}</h3>
          {section.tasks.map((task) => (
            <TaskCard key={task.id} task={task} today={today} {...handlers} />
          ))}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/ui/GroupedList.test.tsx`
Expected: PASS, 4 testai

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/GroupedList.tsx tests/ui/GroupedList.test.tsx
git commit -m "feat: užduočių sąrašas su sekcijų antraštėmis"
```

---

### Task 5: Tray langelio ekranas

**Files:**
- Create: `src/ui/quick-add/index.html`, `src/ui/quick-add/main.tsx`, `src/ui/quick-add/QuickAddScreen.tsx`
- Modify: `vite.config.ts` (kelių puslapių režimas), `src/ui/theme.css`
- Test: `tests/ui/QuickAddScreen.test.tsx`

**Interfaces:**
- Consumes: `QuickAdd`, `GroupedList`, `applyTheme`, `api.ts`
- Produces: `<QuickAddScreen now onOpenBoard onClose />`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/QuickAddScreen.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../src/ui/api.js';
import { QuickAddScreen } from '../../src/ui/quick-add/QuickAddScreen.js';

vi.mock('../../src/ui/api.js');

const NOW = new Date(2026, 7, 14, 10, 0);

const SETTINGS = {
  grouping: 'date' as const, theme: 'system' as const, sound: 'alarms' as const,
  digest_times: ['10:00', '15:30'], port: 8080, hotkey: 'Ctrl+Alt+Space',
  autostart: true, last_digest: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchTasks).mockResolvedValue([]);
  vi.mocked(api.fetchSettings).mockResolvedValue(SETTINGS);
  vi.mocked(api.subscribeToChanges).mockReturnValue(() => {});
});

describe('QuickAddScreen', () => {
  it('įvedimo laukas gauna fokusą iškart', async () => {
    render(<QuickAddScreen now={NOW} onOpenBoard={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Nauja užduotis')));
  });

  it('Enter sukuria užduotį ir uždaro langą', async () => {
    const onClose = vi.fn();
    vi.mocked(api.createTask).mockResolvedValue({} as never);
    render(<QuickAddScreen now={NOW} onOpenBoard={vi.fn()} onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Nupirkti pieną{Enter}');

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nupirkti pieną', due_at: null }),
    ));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Esc uždaro langą nieko nesukūręs', async () => {
    const onClose = vi.fn();
    render(<QuickAddScreen now={NOW} onOpenBoard={vi.fn()} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('nuoroda „Atidaryti lentą" praneša tėvui', async () => {
    const onOpenBoard = vi.fn();
    render(<QuickAddScreen now={NOW} onOpenBoard={onOpenBoard} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Atidaryti lentą' }));
    expect(onOpenBoard).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/QuickAddScreen.test.tsx`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti ekraną**

`src/ui/quick-add/QuickAddScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { formatLocalDate } from '../../core/datetime.js';
import type { SettingsMap } from '../../core/settings.js';
import type { Task, TaskInput } from '../../core/types.js';
import * as api from '../api.js';
import { GroupedList } from '../components/GroupedList.js';
import { QuickAdd } from '../components/QuickAdd.js';
import { applyTheme } from '../useTheme.js';

export interface QuickAddScreenProps {
  now: Date;
  onOpenBoard(): void;
  onClose(): void;
}

export function QuickAddScreen({ now, onOpenBoard, onClose }: QuickAddScreenProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTasks(await api.fetchTasks());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    void api.fetchSettings().then((s) => { setSettings(s); applyTheme(s.theme); }).catch(() => {});
    return api.subscribeToChanges(() => { void reload(); }, () => {});
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (action: () => Promise<unknown>, thenClose = false): Promise<void> => {
    try {
      setError(null);
      await action();
      await reload();
      if (thenClose) onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const create = (input: TaskInput): void => { void run(() => api.createTask(input), true); };

  return (
    <div className="langelis">
      {error !== null && <div className="klaidos-juosta">{error}</div>}

      <QuickAdd now={now} onCreate={create} autoFocus />

      <div className="langelio-sarasas">
        <GroupedList
          tasks={tasks}
          grouping={settings?.grouping ?? 'date'}
          today={formatLocalDate(now)}
          now={now}
          onToggleDone={(id, done) => void run(() => api.patchTask(id, { status: done ? 'done' : 'todo' }))}
          onDelete={(id) => void run(() => api.deleteTask(id))}
          onRename={(id, title) => void run(() => api.patchTask(id, { title }))}
          onReschedule={(id, due) => void run(() => api.patchTask(id, due))}
        />
      </div>

      <button type="button" className="atidaryti-lenta" onClick={onOpenBoard}>
        Atidaryti lentą
      </button>
    </div>
  );
}
```

`QuickAdd` reikia naujo neprivalomo `autoFocus` požymio — `src/ui/components/QuickAdd.tsx`:

```tsx
export interface QuickAddProps {
  now: Date;
  onCreate(input: TaskInput): void;
  autoFocus?: boolean;
}

export function QuickAdd({ now, onCreate, autoFocus = false }: QuickAddProps) {
```

ir įvesties lauke:

```tsx
        autoFocus={autoFocus}
```

- [ ] **Step 4: Sukurti puslapio įėjimo taškus**

`src/ui/quick-add/index.html` — kaip `src/ui/index.html`, tik `<title>Nauja užduotis</title>` ir `<script type="module" src="./main.tsx">`.

`src/ui/quick-add/main.tsx`:

> **Fix-wave update (Task 6):** `window.close()` on a renderer-initiated call
> destroys the WebContents without a cancelable BrowserWindow `close` event,
> so a plain `window.close()`/`window.open()` implementation here reloads the
> popup on every Escape and duplicates board windows. The version below routes
> both actions through the `preload.cjs` bridge introduced in Task 6, falling
> back to the browser APIs only when the bridge is absent (e.g. `npm run
> dev:ui`). See Task 6 Step 1 for `preload.cjs` and the IPC wiring in
> `main.ts`, and `src/ui/quick-add/window.d.ts` for the `window.taskerpro`
> type.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../theme.css';
import { QuickAddScreen } from './QuickAddScreen.js';

const close = (): void => {
  if (window.taskerpro) {
    window.taskerpro.hidePopup();
  } else {
    window.close();
  }
};
const openBoard = (): void => {
  if (window.taskerpro) {
    window.taskerpro.openBoard();
  } else {
    window.open('/', '_blank');
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QuickAddScreen now={new Date()} onOpenBoard={openBoard} onClose={close} />
  </StrictMode>,
);
```

`vite.config.ts` — kelių puslapių režimas:

```ts
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/ui',
  plugins: [react()],
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        board: resolve('src/ui/index.html'),
        quickAdd: resolve('src/ui/quick-add/index.html'),
      },
    },
  },
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
```

Papildyti `src/ui/theme.css`:

```css
.langelis { display: flex; flex-direction: column; height: 100vh; padding: 10px; gap: 8px; }
.langelio-sarasas { flex: 1; overflow-y: auto; }
.sarasas section { margin-bottom: 10px; }
.sarasas h3 {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--tekstas-blankus);
}
.sarasas .kortele + .kortele { margin-top: 4px; }
.tuscia { color: var(--tekstas-blankus); text-align: center; padding: 20px 0; }
.atidaryti-lenta {
  font: inherit;
  color: var(--tekstas-blankus);
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}
```

- [ ] **Step 5: Paleisti visus testus**

Run: `npm test`
Expected: PASS, visi testai

- [ ] **Step 6: Commit**

```bash
git add src/ui vite.config.ts tests/ui/QuickAddScreen.test.tsx
git commit -m "feat: tray langelio ekranas su greitu įvedimu ir sąrašu"
```

---

### Task 6: Tray ikona, langai ir sujungimas

Paskutinė užduotis suriša visas dalis. Automatinių testų čia nėra — Electron langų automatizavimas kainuotų daugiau, nei duotų — todėl ji baigiasi rankiniu patikros sąrašu.

**Files:**
- Create: `src/desktop/windows.ts`, `src/desktop/tray.ts`
- Modify: `src/desktop/main.ts`

**Interfaces:**
- Consumes: `popupBounds` iš `windowPosition.ts`; `createHotkeyManager` iš `hotkey.ts`
- Produces: `createWindows(baseUrl): { togglePopup(trayBounds), openBoard(), dispose() }`, `createTray(handlers): Tray`

- [ ] **Step 1: Parašyti langų modulį**

> **Fix-wave update:** pirminis planas čia numatė tik `win.on('closed', ...)`
> — be jokios `close` interceptacijos. Įgyvendinimo metu buvo pridėtas
> `close` handleris su `preventDefault()`, kad langelis tik pasislėptų, o ne
> būtų sunaikintas kaskart, kai puslapis kviečia `window.close()`. Tas
> handleris **neveikė**: renderer'io inicijuotas `window.close()` sunaikina
> WebContents be atšaukiamo BrowserWindow `close` įvykio (Electron pačiam
> `webContents.close()` tai dokumentuoja), tad langelis vis tiek buvo
> perkraunamas kaskart paspaudus Esc ar sukūrus užduotį. Be to, keliuose,
> kuriais `close` VIS TIEK įvykdavo (bet koks `app.quit()`, kuris nesunaikina
> langų tiesiogiai), `preventDefault()` atšaukdavo patį išjungimą — programos
> nebuvo įmanoma uždaryti iš jos paties meniu.
>
> Sprendimas: `src/desktop/preload.cjs` — CommonJS preload skriptas (preload
> visada CJS, nepriklausomai nuo `"type": "module"`), skelbiantis
> `window.taskerpro` tiltą per `contextBridge`:
>
> ```js
> const { contextBridge, ipcRenderer } = require('electron');
> contextBridge.exposeInMainWorld('taskerpro', {
>   hidePopup: () => ipcRenderer.send('popup:hide'),
>   openBoard: () => ipcRenderer.send('board:open'),
> });
> ```
>
> Langelio puslapis (`src/ui/quick-add/main.tsx`, žr. Task 5) šį tiltą kviečia
> tiesiogiai vietoj `window.close()`/`window.open()`. `main.ts` (žr. Step 3)
> gauna IPC pranešimus per `ipcMain.on('popup:hide', ...)` ir
> `ipcMain.on('board:open', ...)` ir kviečia atitinkamus `windows.ts` metodus.
> `close` handleris lieka kaip apsauginis tinklas retiems keliams, kuriais
> `close` vis tiek gali įvykti (pvz., Alt+F4) — bet dabar saugomas
> `isQuitting` požymiu, kad realaus išjungimo niekada neatšauktų.
>
> Papildomai: `webContents.setWindowOpenHandler(() => ({ action: 'deny' }))`
> ant abiejų langų, kad joks nevaldomas langas negalėtų atsirasti (žr. Task 6
> 3 punktą apačioje — „Atidaryti lentą" naudojo `window.open('/', '_blank')`,
> kuris dubliuodavo lentos langus, apeidamas `openBoard()` singleton'ą).
> `togglePopup` taip pat saugosi nuo tray click/`blur` lenktynių — žr.
> `lastBlurHideAt` kode.

`src/desktop/windows.ts`:

```ts
import { app, BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { popupBounds, type Bounds } from './windowPosition.js';

const POPUP_SIZE = { width: 380, height: 480 };
const BLUR_HIDE_GRACE_MS = 250;
const PRELOAD_PATH = fileURLToPath(new URL('./preload.cjs', import.meta.url));

export interface Windows {
  togglePopup(trayBounds: Bounds): void;
  showPopup(trayBounds: Bounds): void;
  hidePopup(): void;
  openBoard(): void;
  dispose(): void;
}

export function createWindows(baseUrl: string): Windows {
  let popup: BrowserWindow | null = null;
  let board: BrowserWindow | null = null;
  let isQuitting = false;
  let lastBlurHideAt = 0;

  app.on('before-quit', () => { isQuitting = true; });

  const buildPopup = (): BrowserWindow => {
    const win = new BrowserWindow({
      ...POPUP_SIZE,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: { preload: PRELOAD_PATH },
    });
    void win.loadURL(`${baseUrl}/quick-add/`);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('blur', () => { win.hide(); lastBlurHideAt = Date.now(); });
    win.on('close', (event) => {
      if (isQuitting) return;
      event.preventDefault();
      win.hide();
    });
    win.on('closed', () => { popup = null; });
    return win;
  };

  const showPopup = (trayBounds: Bounds): void => {
    popup ??= buildPopup();
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    popup.setBounds(popupBounds(trayBounds, display.workArea, POPUP_SIZE));
    popup.show();
    popup.focus();
  };

  return {
    togglePopup(trayBounds) {
      popup ??= buildPopup();
      if (popup.isVisible()) {
        popup.hide();
        return;
      }
      if (Date.now() - lastBlurHideAt < BLUR_HIDE_GRACE_MS) return;
      showPopup(trayBounds);
    },

    showPopup,

    hidePopup() {
      popup?.hide();
    },

    openBoard() {
      if (board !== null && !board.isDestroyed()) {
        board.show();
        board.focus();
        return;
      }
      board = new BrowserWindow({ width: 1200, height: 800, title: 'TaskerPro' });
      void board.loadURL(`${baseUrl}/`);
      board.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      board.on('closed', () => { board = null; });
    },

    dispose() {
      popup?.destroy();
      board?.destroy();
    },
  };
}
```

Langelis kuriamas vieną kartą ir toliau tik slepiamas — taip antras karštojo klavišo paspaudimas atsiveria akimirksniu, be pakartotinio puslapio krovimo.

- [ ] **Step 2: Parašyti tray modulį**

`src/desktop/tray.ts`:

```ts
import { Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';

export interface TrayHandlers {
  onQuickAdd(): void;
  onOpenBoard(): void;
  onQuit(): void;
}

export function createTray(appPath: string, handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromPath(join(appPath, 'dist/desktop/assets/icon.png'));
  const tray = new Tray(icon.resize({ width: 16, height: 16 }));

  tray.setToolTip('TaskerPro');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Nauja užduotis', click: handlers.onQuickAdd },
      { label: 'Atidaryti lentą', click: handlers.onOpenBoard },
      { type: 'separator' },
      { label: 'Išjungti', click: handlers.onQuit },
    ]),
  );
  tray.on('click', handlers.onQuickAdd);

  return tray;
}
```

(`resize` yra sinchroninis metodas — `resizeSync` niekada neegzistavo šios Electron versijos API; ankstesnė šio plano redakcija tą pavadinimą klaidingai nurodė.)

- [ ] **Step 3: Sujungti pagrindiniame procese**

> **Fix-wave update:** žemiau pateiktas variantas skiriasi nuo pirminio plano
> keliais taškais, kuriuos atskleidė galutinė peržiūra:
> - `.catch()` šaka po `app.whenReady().then(...)` — pirminiame plano
>   fragmente ji buvo praleista, bet kode visada buvo (žr. Task 1 Step 2) ir
>   lieka būtina: be jos nutrūkęs serverio paleidimas liktų tylus.
> - `tray` — ne `const` vietinis kintamasis, o modulio lygio `let`, nes
>   `Tray` egzemplioriaus vienintelė šaknis buvo uždarinių sugavimas; kai jos
>   nebelieka (pvz., karštojo klavišo registracijai nepavykus), GC gali
>   ikoną surinkti. Sunaikinamas eksplicitiškai `before-quit` metu.
> - `db.close()` iš karto po nustatymų perskaitymo — antra WAL jungtis
>   nebelaikoma atverta visą programos gyvavimo laiką.
> - `ipcMain.on('popup:hide', ...)` / `ipcMain.on('board:open', ...)` —
>   žr. Step 1 preload bridge'ą.
> - `app.on('second-instance', ...)` — antras paleidimo bandymas dabar
>   parodo langelį, vietoj to, kad tyliai nutrūktų.
> - `dialog.showMessageBox(...)` pažymėtas `void` — kaip ir kitur šiame
>   faile, plūduriuojantis pažadas čia nepriimtinas.

`src/desktop/main.ts`:

```ts
import { app, dialog, globalShortcut, ipcMain, type Tray } from 'electron';
import { join } from 'node:path';
import { openDb } from '../core/db.js';
import { createSettingsStore } from '../core/settings.js';
import { dataDir, startServer } from '../server/index.js';
import { createHotkeyManager } from './hotkey.js';
import { createTray } from './tray.js';
import { createWindows } from './windows.js';

let tray: Tray | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady()
    .then(async () => {
      const { port } = await startServer(join(app.getAppPath(), 'dist/ui'));
      const windows = createWindows(`http://127.0.0.1:${port}`);

      // `settingsStore` 3 ir 4 fazėse liks kintamuoju.
      const db = openDb(join(dataDir(), 'tasks.db'));
      const settingsStore = createSettingsStore(db);
      const settings = settingsStore.getAll();
      db.close();

      const toggleFromTray = (): void => { if (tray) windows.togglePopup(tray.getBounds()); };

      tray = createTray(app.getAppPath(), {
        onQuickAdd: toggleFromTray,
        onOpenBoard: () => windows.openBoard(),
        onQuit: () => { windows.dispose(); app.quit(); },
      });

      const hotkeys = createHotkeyManager({
        register: (acc, cb) => globalShortcut.register(acc, cb),
        unregister: (acc) => globalShortcut.unregister(acc),
      });

      if (!hotkeys.apply(settings.hotkey, toggleFromTray)) {
        void dialog.showMessageBox({
          type: 'warning',
          title: 'TaskerPro',
          message: `Kombinacija ${settings.hotkey} užimta`,
          detail: 'Pasirink kitą nustatymuose. Programa veikia — naudok tray ikoną.',
        });
      }

      app.on('second-instance', () => { if (tray) windows.showPopup(tray.getBounds()); });

      ipcMain.on('popup:hide', () => windows.hidePopup());
      ipcMain.on('board:open', () => windows.openBoard());

      app.on('will-quit', () => hotkeys.dispose());
      app.on('before-quit', () => { tray?.destroy(); tray = null; });
    })
    .catch((err: unknown) => {
      dialog.showErrorBox('TaskerPro', `Nepavyko paleisti serverio:\n${String(err)}`);
      app.quit();
    });

  app.on('window-all-closed', () => {});
}
```

Antras `openDb` kreipinys tam pačiam failui yra saugus — SQLite WAL režimas leidžia kelis ryšius tame pačiame procese — bet dabar rankena uždaroma iš karto po naudojimo, nes ilgesniam gyvavimui priežasties nėra.

- [ ] **Step 4: Rankinė patikra**

Run: `npm run app`

Patikrinti kiekvieną punktą:

1. Tray ikona atsiranda prie laikrodžio
2. `Ctrl+Alt+Space` atidaro langelį virš tray srities, įvedimo laukas turi fokusą
3. Įrašius tekstą ir paspaudus Enter užduotis atsiranda, langelis užsidaro
4. Antras `Ctrl+Alt+Space` paspaudimas langelį uždaro
5. Paspaudus kitur (fokuso praradimas) langelis dingsta
6. Esc langelį uždaro
7. Tray ikonos paspaudimas atidaro tą patį langelį
8. „Atidaryti lentą" atidaro lentos langą, pakartotinis paspaudimas jį iškelia, o ne kuria antrą
9. Lentoje pažymėjus užduotį, langelio sąrašas atsinaujina be perkrovimo
10. „Išjungti" uždaro programą, tray ikona dingsta
11. Langelio pozicija teisinga, kai užduočių juosta perkelta į viršų arba į kairę

- [ ] **Step 5: Paleisti visus automatinius testus**

Run: `npm test`
Expected: PASS

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/desktop
git commit -m "feat: tray ikona, iššokantis langelis ir lentos langas"
```

---

## Pabaigos patikra

Po 6 užduoties programa gyvena tray'uje, atsidaro karštuoju klavišu, priima užduotį per porą sekundžių ir rodo tą patį sąrašą, kurį mato planšetė.

**Neveiks (3–4 fazės):** žadintuvas, dienos apžvalga, garsas, nustatymų langas, autostartas, diegimo failas.


---

## Žinomos, sąmoningai atidėtos skolos (2 fazė)

| Vieta | Kas | Kodėl atidėta |
|---|---|---|
| `tray.ts` | Ikona kietai keičiama į 16×16, nepaisant DPI | Skaliuotame ekrane atrodys neryškiai; reikia daugiadydžio `.ico` — 4 fazės pakavimo darbas |
| `QuickAddScreen.tsx` | Langelis neperduoda `onStatus`, tad nerodo atsijungimo | Lenta tokiu atveju rodo juostą; langelis trumpalaikis |
| `windows.ts` | 250 ms tray perjungimo apsauga pagauna ir Escape → iškart tray paspaudimą | Savaime praeina per ketvirtį sekundės; ne duomenų ir ne kritimo rizika |

## Ko VIENUOLIKOS punktų rankinis sąrašas neapėmė

Task 6 rankinis sąrašas rėmėsi prielaida, kad jį vykdys žmogus prie tikro darbalaukio. Automatizuotoje aplinkoje septyni iš vienuolikos punktų liko nepatikrinti arba klaidingai „nepavykę" (nėra patikimos klaviatūros įvesties, žymeklis įstrigęs). Galutinė peržiūra dalį jų išsprendė skaitydama kodą, bet **šie lieka tikrai reikalaujantys žmogaus prie tikro kompiuterio** — sąrašas trumpas ir konkretus:

1. Paspausk tikrą karštąjį klavišą ir **iškart rašyk** — ar tekstas patenka į langelį. (Ar `show()` + `focus()` tikrai perima Windows pirmaplanį iš globalaus klavišo, skaitant kodą nenustatoma.)
2. Paspausk tray ikoną, kai langelis atidarytas — ar jis užsidaro, ar atsidaro iš naujo.
3. Paspausk kitur darbalaukyje — langelis turi dingti. Taip pat išbandyk datos parinkiklį langelyje: ar jis nepaslepia langelio iš po kojų.
4. Ar ikona matoma be „^" išskleidimo, ir ar dingsta paspaudus „Išjungti". Jei ikona paslėpta perpildyme — ar langelis neatsiranda viršutiniame kairiajame kampe.
5. Perkelk užduočių juostą į viršų arba kairę ir paspausk klavišą — ar langelis atsiranda teisingoje vietoje.
6. **Palik programą veikti per naktį**, tada atidaryk langelį ir spausk „Šiandien" — ar data teisinga. (Šito vienuolikos punktų sąraše apskritai nebuvo.)
