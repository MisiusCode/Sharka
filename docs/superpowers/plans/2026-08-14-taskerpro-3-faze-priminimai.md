# TaskerPro 3 fazė: priminimai — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Priversti sistemą pačią priminti — dienos apžvalga nustatytais laikais ir žadintuvas užduotims su konkrečiu laiku.

**Architecture:** Visa priminimų logika gyvena `core/reminders.ts` ir yra gryna sprendimų priėmimo funkcija: gauna laiką ir užduotis, grąžina įvykius. Electron pusė tik parodo langus. Todėl visos įdomiausios elgsenos — vėluojantis priminimas po miego, praleista apžvalga, atidėjimas — testuojamos be jokio lango.

**Tech Stack:** ta pati kaip 1–2 fazėse.

**Ankstesnis planas:** `docs/superpowers/plans/2026-08-14-taskerpro-2-faze-electron-apvalkalas.md`

## Global Constraints

Galioja visos 1–2 fazių sąlygos, plius:

- **Planuoklis tikrina periodiškai, ne taimeriais.** Intervalas — 15 s. `setTimeout` kiekvienai užduočiai neišgyventų kompiuterio miego ir laikrodžio pokyčių.
- **Langai duomenis keičia per HTTP API**, ne per IPC. Pagrindinis procesas laukų nerašo.
- **Sprendimai lieka grynuose, įšvirkščiamuose moduliuose; `electron` importuoja tik langus valdantys apvalkalai** — `main.ts`, `tray.ts`, `windows.ts`, `reminderWindows.ts`. Ankstesnė formuluotė („importuoja tik `main.ts`") buvo neteisinga jau 2 fazėje ir aprašė ne taisyklę, o pageidavimą. Svarbu ne importų sąrašas, o tai, kad viskas, kur yra sprendimas — pozicija, karštasis klavišas, garsas, eilė, planuoklis — liktų testuojama be Electron.
- **Priminimo laikas lyginamas kaip eilutė** `YYYY-MM-DDTHH:mm` — tas pats vietinio sieninio laiko formatas kaip visur kitur.

---

## Failų struktūra

```
src/core/reminders.ts       planuoklis: žadintuvai ir dienos apžvalga
src/core/tasks.ts           (papildomas markReminded metodu)
src/desktop/sound.ts        shouldPlaySound — garso taisyklė
src/desktop/alarmQueue.ts   vienas langas vienu metu
src/ui/alarm/               žadintuvo langas
src/ui/digest/              dienos apžvalgos langas
```

---

### Task 1: Priminimų planuoklis

Didžiausia fazės užduotis. Čia gyvena visos taisyklės.

**Files:**
- Create: `src/core/reminders.ts`
- Modify: `src/core/tasks.ts` (pridėti `markReminded`)
- Test: `tests/core/reminders.test.ts`

**Interfaces:**
- Consumes: `TaskStore`, `SettingsStore`, `Clock`, `dateBucketOf`, `sortTasks`, `formatLocalDate`, `formatLocalDateTime`
- Produces: `markReminded(id): Task | null` metodas `TaskStore` sąsajoje; `ReminderEvents { onAlarm(task: Task, lateMinutes: number): void; onDigest(tasks: Task[]): void }`; `createReminderScheduler(deps): { tick(): void; start(intervalMs: number): () => void }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/reminders.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { createReminderScheduler } from '../../src/core/reminders.js';
import { createSettingsStore } from '../../src/core/settings.js';
import { createTaskStore, type TaskStore } from '../../src/core/tasks.js';

let tasks: TaskStore;
let settings: ReturnType<typeof createSettingsStore>;
let clock: ReturnType<typeof fixedClock>;
let onAlarm: ReturnType<typeof vi.fn>;
let onDigest: ReturnType<typeof vi.fn>;
let tick: () => void;

beforeEach(() => {
  const db = openDb(':memory:');
  clock = fixedClock('2026-08-14T09:00:00');
  tasks = createTaskStore(db, clock);
  settings = createSettingsStore(db);
  onAlarm = vi.fn();
  onDigest = vi.fn();
  tick = createReminderScheduler({ tasks, settings, clock, events: { onAlarm, onDigest } }).tick;
});

describe('žadintuvas', () => {
  it('suveikia atėjus laikui ir tik vieną kartą', () => {
    const t = tasks.create({ title: 'Skambutis', remind_at: '2026-08-14T09:30' });

    tick();
    expect(onAlarm).not.toHaveBeenCalled();

    clock.set('2026-08-14T09:30:00');
    tick();
    expect(onAlarm).toHaveBeenCalledWith(expect.objectContaining({ id: t.id }), 0);

    tick();
    expect(onAlarm).toHaveBeenCalledTimes(1);
  });

  it('po miego suveikia ir praneša vėlavimą', () => {
    tasks.create({ title: 'Skambutis', remind_at: '2026-08-14T09:30' });
    clock.set('2026-08-14T10:10:00');

    tick();

    expect(onAlarm).toHaveBeenCalledWith(expect.anything(), 40);
  });

  it('atliktai užduočiai neskamba', () => {
    const t = tasks.create({ title: 'X', remind_at: '2026-08-14T09:30' });
    tasks.update(t.id, { status: 'done' });
    clock.set('2026-08-14T09:30:00');

    tick();

    expect(onAlarm).not.toHaveBeenCalled();
  });

  it('atidėjus suskamba iš naujo', () => {
    const t = tasks.create({ title: 'X', remind_at: '2026-08-14T09:30' });
    clock.set('2026-08-14T09:30:00');
    tick();

    tasks.snooze(t.id, 10);
    clock.set('2026-08-14T09:40:00');
    tick();

    expect(onAlarm).toHaveBeenCalledTimes(2);
  });
});

describe('dienos apžvalga', () => {
  it('suveikia nustatytu laiku su šios dienos užduotimis', () => {
    tasks.create({ title: 'Bedatė' });
    tasks.create({ title: 'Rytojaus', due_at: '2026-08-15' });

    clock.set('2026-08-14T10:00:00');
    tick();

    expect(onDigest).toHaveBeenCalledTimes(1);
    expect(onDigest.mock.lastCall![0].map((t: { title: string }) => t.title)).toEqual(['Bedatė']);
  });

  it('to paties laiko antrą kartą nekartoja', () => {
    tasks.create({ title: 'A' });
    clock.set('2026-08-14T10:00:00');
    tick();
    clock.set('2026-08-14T10:00:30');
    tick();

    expect(onDigest).toHaveBeenCalledTimes(1);
  });

  it('praleidus abu laikus suveikia tik vėlesnis', () => {
    tasks.create({ title: 'A' });
    clock.set('2026-08-14T16:00:00');

    tick();

    expect(onDigest).toHaveBeenCalledTimes(1);
    expect(settings.getAll().last_digest).toBe('2026-08-14T15:30');
  });

  it('nesant ką rodyti langas nekviečiamas, bet laikas užfiksuojamas', () => {
    clock.set('2026-08-14T10:00:00');
    tick();

    expect(onDigest).not.toHaveBeenCalled();
    expect(settings.getAll().last_digest).toBe('2026-08-14T10:00');
  });

  it('kitą dieną suveikia iš naujo', () => {
    tasks.create({ title: 'A' });
    clock.set('2026-08-14T10:00:00');
    tick();
    clock.set('2026-08-15T10:00:00');
    tick();

    expect(onDigest).toHaveBeenCalledTimes(2);
  });

  it('antras tos dienos laikas suveikia, jei liko neatliktų', () => {
    tasks.create({ title: 'A' });
    clock.set('2026-08-14T10:00:00');
    tick();
    clock.set('2026-08-14T15:30:00');
    tick();

    expect(onDigest).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/reminders.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/reminders.js"`

- [ ] **Step 3: Papildyti užduočių saugyklą**

`src/core/tasks.ts` — į `TaskStore` sąsają pridėti:

```ts
  markReminded(id: string): Task | null;
```

ir į grąžinamą objektą, prie `snooze`:

```ts
    markReminded(id) {
      if (get(id) === null) return null;
      const now = clock.now().toISOString();
      return writeFields(id, { reminded_at: now, updated_at: now });
    },
```

- [ ] **Step 4: Parašyti planuoklį**

`src/core/reminders.ts`:

```ts
import { dateBucketOf, sortTasks } from './buckets.js';
import type { Clock } from './clock.js';
import { formatLocalDate, formatLocalDateTime } from './datetime.js';
import type { createSettingsStore } from './settings.js';
import type { TaskStore } from './tasks.js';
import type { Task } from './types.js';

export interface ReminderEvents {
  onAlarm(task: Task, lateMinutes: number): void;
  onDigest(tasks: Task[]): void;
}

export interface SchedulerDeps {
  tasks: TaskStore;
  settings: ReturnType<typeof createSettingsStore>;
  clock: Clock;
  events: ReminderEvents;
}

export interface Scheduler {
  tick(): void;
  start(intervalMs: number): () => void;
}

function minutesBetween(fromLocal: string, now: Date): number {
  const [date, time] = fromLocal.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const then = new Date(y, m - 1, d, hh, mm);
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
}

export function createReminderScheduler(deps: SchedulerDeps): Scheduler {
  const { tasks, settings, clock, events } = deps;

  const runAlarms = (nowLocal: string, now: Date): void => {
    for (const task of tasks.list()) {
      if (task.remind_at === null || task.reminded_at !== null) continue;
      if (task.status === 'done' || task.remind_at > nowLocal) continue;

      tasks.markReminded(task.id);
      events.onAlarm(task, minutesBetween(task.remind_at, now));
    }
  };

  const runDigest = (nowLocal: string, today: string): void => {
    const { digest_times, last_digest } = settings.getAll();

    const due = digest_times
      .map((time) => `${today}T${time}`)
      .filter((slot) => slot <= nowLocal && (last_digest === null || last_digest < slot))
      .sort();

    const slot = due.at(-1);
    if (slot === undefined) return;

    // Laikas fiksuojamas net ir tuščiai apžvalgai — kitaip tikrinimas kartotųsi kas 15 s.
    settings.patch({ last_digest: slot });

    const todays = tasks
      .list()
      .filter((t) => t.status !== 'done' && dateBucketOf(t, today) === 'today');

    if (todays.length > 0) events.onDigest(sortTasks(todays));
  };

  const tick = (): void => {
    const now = clock.now();
    const nowLocal = formatLocalDateTime(now);
    runAlarms(nowLocal, now);
    runDigest(nowLocal, formatLocalDate(now));
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

Dienos apžvalgos taisyklė yra „paimk vėliausią pralaidų laiką", o ne „paleisk kiekvieną iš eilės" — pabudus 16:00 naudotojui reikia vieno lango su tuo, kas liko, o ne dviejų iš eilės.

- [ ] **Step 5: Paleisti testus**

Run: `npx vitest run tests/core/reminders.test.ts tests/core/tasks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/reminders.ts src/core/tasks.ts tests/core/reminders.test.ts
git commit -m "feat: priminimų planuoklis su dienos apžvalga ir vėlavimo pagavimu"
```

---

### Task 2: Žadintuvo langas

**Files:**
- Create: `src/ui/alarm/index.html`, `src/ui/alarm/main.tsx`, `src/ui/alarm/AlarmView.tsx`, `src/ui/assets/alarm.wav`
- Modify: `vite.config.ts`, `src/ui/theme.css`
- Test: `tests/ui/AlarmView.test.tsx`

**Interfaces:**
- Consumes: `Task` iš `core/types.ts`; `timeOf` iš `core/datetime.ts`
- Produces: `<AlarmView task lateMinutes soundOn onDone onSnooze onDismiss />`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/AlarmView.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../src/core/types.js';
import { AlarmView } from '../../src/ui/alarm/AlarmView.js';

const TASK: Task = {
  id: 't1', title: 'Paskambinti mamai', status: 'todo', priority: 1,
  due_at: '2026-08-14T18:00', due_has_time: true, remind_at: '2026-08-14T18:00',
  reminded_at: null, created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
  completed_at: null,
};

function renderAlarm(lateMinutes = 0, soundOn = true) {
  const handlers = { onDone: vi.fn(), onSnooze: vi.fn(), onDismiss: vi.fn() };
  render(<AlarmView task={TASK} lateMinutes={lateMinutes} soundOn={soundOn} {...handlers} />);
  return handlers;
}

describe('AlarmView', () => {
  it('rodo pavadinimą ir laiką', () => {
    renderAlarm();
    expect(screen.getByText('Paskambinti mamai')).toBeDefined();
    expect(screen.getByText('18:00')).toBeDefined();
  });

  it('vėluojant rodo kiek', () => {
    renderAlarm(40);
    expect(screen.getByText('vėluoja 40 min')).toBeDefined();
  });

  it('nevėluojant vėlavimo neminimi', () => {
    renderAlarm(0);
    expect(screen.queryByText(/vėluoja/)).toBeNull();
  });

  it('mygtukai praneša tėvui', async () => {
    const h = renderAlarm();
    await userEvent.click(screen.getByRole('button', { name: 'Atlikta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Atidėti 10 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Uždaryti' }));
    expect(h.onDone).toHaveBeenCalled();
    expect(h.onSnooze).toHaveBeenCalled();
    expect(h.onDismiss).toHaveBeenCalled();
  });

  it('garsui išjungus nutildymo mygtuko nerodo', () => {
    renderAlarm(0, false);
    expect(screen.queryByRole('button', { name: 'Nutildyti' })).toBeNull();
  });

  it('nutildymas paslepia mygtuką, bet lango neuždaro', async () => {
    renderAlarm(0, true);
    await userEvent.click(screen.getByRole('button', { name: 'Nutildyti' }));
    expect(screen.queryByRole('button', { name: 'Nutildyti' })).toBeNull();
    expect(screen.getByText('Paskambinti mamai')).toBeDefined();
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/AlarmView.test.tsx`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti komponentą**

`src/ui/alarm/AlarmView.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { timeOf } from '../../core/datetime.js';
import type { Task } from '../../core/types.js';
import garsas from '../assets/alarm.wav';

export interface AlarmViewProps {
  task: Task;
  lateMinutes: number;
  soundOn: boolean;
  onDone(): void;
  onSnooze(): void;
  onDismiss(): void;
}

export function AlarmView({ task, lateMinutes, soundOn, onDone, onSnooze, onDismiss }: AlarmViewProps) {
  const [muted, setMuted] = useState(!soundOn);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (muted) {
      audio.current?.pause();
      return;
    }
    try {
      audio.current = new Audio(garsas);
      audio.current.loop = true;
      void audio.current.play()?.catch(() => {});
    } catch {
      // jsdom ir dalis aplinkų garso negroja — tyla čia nėra klaida.
    }
    return () => { audio.current?.pause(); };
  }, [muted]);

  return (
    <div className="zadintuvas" data-prioritetas={task.priority}>
      <p className="zadintuvo-laikas">
        {task.due_at !== null ? timeOf(task.due_at) : ''}
        {lateMinutes > 0 && <span className="veluoja"> vėluoja {lateMinutes} min</span>}
      </p>

      <h1>{task.title}</h1>

      <div className="zadintuvo-mygtukai">
        <button type="button" onClick={onDone}>Atlikta</button>
        <button type="button" onClick={onSnooze}>Atidėti 10 min</button>
        <button type="button" onClick={onDismiss}>Uždaryti</button>
        {!muted && (
          <button type="button" onClick={() => setMuted(true)}>Nutildyti</button>
        )}
      </div>
    </div>
  );
}
```

Testuose `vėluoja 40 min` yra atskirame `<span>`, todėl `getByText` jį randa kaip savarankišką mazgą.

Garso failas `src/ui/assets/alarm.wav` — trumpas (1–2 s) pyptelėjimas, grojamas ratu. Tinka bet koks laisvai naudojamas WAV; svarbu, kad būtų mono ir trumpas, nes kartojamas.

TypeScript reikia žinoti apie `.wav` importą — `src/ui/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 4: Sukurti puslapį**

`src/ui/alarm/index.html` — kaip kiti, `<title>Priminimas</title>`.

`src/ui/alarm/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Task } from '../../core/types.js';
import * as api from '../api.js';
import '../theme.css';
import { applyTheme } from '../useTheme.js';
import { AlarmView } from './AlarmView.js';

const params = new URLSearchParams(window.location.search);
const id = params.get('id')!;
const lateMinutes = Number(params.get('late') ?? '0');
const soundOn = params.get('sound') === '1';

const [tasks, settings] = await Promise.all([api.fetchTasks(), api.fetchSettings()]);
applyTheme(settings.theme);

const task = tasks.find((t: Task) => t.id === id);
if (task === undefined) {
  window.close();
} else {
  const close = (): void => { window.close(); };

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AlarmView
        task={task}
        lateMinutes={lateMinutes}
        soundOn={soundOn}
        onDone={() => void api.patchTask(id, { status: 'done' }).then(close)}
        onSnooze={() => void api.snoozeTask(id, 10).then(close)}
        onDismiss={close}
      />
    </StrictMode>,
  );
}
```

`src/ui/api.ts` — pridėti trūkstamą funkciją:

```ts
export const snoozeTask = (id: string, minutes: number): Promise<Task> =>
  send(`/api/tasks/${id}/snooze`, 'POST', { minutes });
```

`vite.config.ts` — į `rollupOptions.input` pridėti `alarm: resolve('src/ui/alarm/index.html')`.

Papildyti `src/ui/theme.css`:

```css
.zadintuvas {
  height: 100vh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  border-left: 6px solid var(--prioritetas-2);
}
.zadintuvas[data-prioritetas='1'] { border-left-color: var(--prioritetas-1); }
.zadintuvas[data-prioritetas='3'] { border-left-color: var(--prioritetas-3); }
.zadintuvas h1 { margin: 0; font-size: 18px; }
.zadintuvo-laikas { margin: 0; color: var(--tekstas-blankus); font-size: 12px; }
.veluoja { color: var(--pradelsta); }
.zadintuvo-mygtukai { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.zadintuvo-mygtukai button {
  font: inherit;
  color: var(--tekstas);
  background: transparent;
  border: 1px solid var(--riba);
  border-radius: 3px;
  padding: 4px 10px;
  cursor: pointer;
}
```

- [ ] **Step 5: Paleisti testus**

Run: `npx vitest run tests/ui/AlarmView.test.tsx`
Expected: PASS, 6 testų

- [ ] **Step 6: Commit**

```bash
git add src/ui vite.config.ts tests/ui/AlarmView.test.tsx
git commit -m "feat: žadintuvo langas su garsu ir atidėjimu"
```

---

### Task 3: Dienos apžvalgos langas

**Files:**
- Create: `src/ui/digest/index.html`, `src/ui/digest/main.tsx`, `src/ui/digest/DigestView.tsx`
- Modify: `vite.config.ts`, `src/ui/theme.css`
- Test: `tests/ui/DigestView.test.tsx`

**Interfaces:**
- Consumes: `Task`; `TaskCard`
- Produces: `<DigestView tasks onToggleDone onClose />`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/DigestView.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../src/core/types.js';
import { DigestView } from '../../src/ui/digest/DigestView.js';

function task(id: string, title: string): Task {
  return {
    id, title, status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z', completed_at: null,
  };
}

describe('DigestView', () => {
  it('rodo antraštę su užduočių skaičiumi', () => {
    render(<DigestView tasks={[task('a', 'A'), task('b', 'B')]} onToggleDone={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Šiandienai liko 2')).toBeDefined();
  });

  it('vienaskaitą rašo teisingai', () => {
    render(<DigestView tasks={[task('a', 'A')]} onToggleDone={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Šiandienai liko 1')).toBeDefined();
  });

  it('varnelė lange praneša tėvui', async () => {
    const onToggleDone = vi.fn();
    render(<DigestView tasks={[task('a', 'A')]} onToggleDone={onToggleDone} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));
    expect(onToggleDone).toHaveBeenCalledWith('a', true);
  });

  it('mygtukas uždaro', async () => {
    const onClose = vi.fn();
    render(<DigestView tasks={[task('a', 'A')]} onToggleDone={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Uždaryti' }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/DigestView.test.tsx`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti komponentą ir puslapį**

`src/ui/digest/DigestView.tsx`:

```tsx
import { formatLocalDate } from '../../core/datetime.js';
import type { Task } from '../../core/types.js';
import type { DueValue } from '../components/DueEditor.js';
import { TaskCard } from '../components/TaskCard.js';

export interface DigestViewProps {
  tasks: Task[];
  now: Date;
  onToggleDone(id: string, done: boolean): void;
  onDelete(id: string): void;
  onRename(id: string, title: string): void;
  onReschedule(id: string, due: DueValue): void;
  onClose(): void;
}

export function DigestView({ tasks, now, onClose, ...handlers }: DigestViewProps) {
  const today = formatLocalDate(now);

  return (
    <div className="apzvalga">
      <h1>Šiandienai liko {tasks.length}</h1>

      <div className="apzvalgos-sarasas">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} today={today} now={now} {...handlers} />
        ))}
      </div>

      <button type="button" onClick={onClose}>Uždaryti</button>
    </div>
  );
}
```

`src/ui/digest/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { dateBucketOf, sortTasks } from '../../core/buckets.js';
import { formatLocalDate } from '../../core/datetime.js';
import * as api from '../api.js';
import '../theme.css';
import { applyTheme } from '../useTheme.js';
import { DigestView } from './DigestView.js';

const [tasks, settings] = await Promise.all([api.fetchTasks(), api.fetchSettings()]);
applyTheme(settings.theme);

const today = formatLocalDate(new Date());
const todays = sortTasks(
  tasks.filter((t) => t.status !== 'done' && dateBucketOf(t, today) === 'today'),
);

function Screen() {
  return (
    <DigestView
      tasks={todays}
      onToggleDone={(id, done) => void api.patchTask(id, { status: done ? 'done' : 'todo' })}
      onClose={() => window.close()}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Screen />
  </StrictMode>,
);
```

`src/ui/digest/index.html` — `<title>Dienos apžvalga</title>`.

`vite.config.ts` — pridėti `digest: resolve('src/ui/digest/index.html')`.

`src/ui/theme.css`:

```css
.apzvalga { height: 100vh; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.apzvalga h1 { margin: 0; font-size: 15px; }
.apzvalgos-sarasas { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.apzvalga > button {
  font: inherit;
  align-self: flex-end;
  color: var(--tekstas);
  background: transparent;
  border: 1px solid var(--riba);
  border-radius: 3px;
  padding: 4px 12px;
  cursor: pointer;
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/ui/DigestView.test.tsx`
Expected: PASS, 4 testai

- [ ] **Step 5: Commit**

```bash
git add src/ui vite.config.ts tests/ui/DigestView.test.tsx
git commit -m "feat: dienos apžvalgos langas"
```

---

### Task 4: Garso taisyklė ir žadintuvų eilė

**Files:**
- Create: `src/desktop/sound.ts`, `src/desktop/alarmQueue.ts`
- Test: `tests/desktop/sound.test.ts`, `tests/desktop/alarmQueue.test.ts`

**Interfaces:**
- Consumes: `SettingsMap` iš `core/settings.ts`; `Task`
- Produces: `shouldPlaySound(setting, kind: 'alarm' | 'digest'): boolean`; `createAlarmQueue(show): { push(task, lateMinutes): void; resolveCurrent(): void; pending(): number }`

- [ ] **Step 1: Parašyti krentančius testus**

`tests/desktop/sound.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldPlaySound } from '../../src/desktop/sound.js';

describe('shouldPlaySound', () => {
  it('„Visada" groja abiem', () => {
    expect(shouldPlaySound('always', 'alarm')).toBe(true);
    expect(shouldPlaySound('always', 'digest')).toBe(true);
  });

  it('„Tik žadintuvams" apžvalgą palieka tylią', () => {
    expect(shouldPlaySound('alarms', 'alarm')).toBe(true);
    expect(shouldPlaySound('alarms', 'digest')).toBe(false);
  });

  it('„Išjungta" nutildo viską', () => {
    expect(shouldPlaySound('off', 'alarm')).toBe(false);
    expect(shouldPlaySound('off', 'digest')).toBe(false);
  });
});
```

`tests/desktop/alarmQueue.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../src/core/types.js';
import { createAlarmQueue } from '../../src/desktop/alarmQueue.js';

const task = (id: string): Task => ({
  id, title: id, status: 'todo', priority: 2,
  due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
  created_at: '', updated_at: '', completed_at: null,
});

describe('createAlarmQueue', () => {
  it('pirmą rodo iš karto, antrą laiko eilėje', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);

    q.push(task('a'), 0);
    q.push(task('b'), 0);

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(task('a'), 0);
    expect(q.pending()).toBe(1);
  });

  it('uždarius einamąjį parodo kitą', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);
    q.push(task('a'), 0);
    q.push(task('b'), 5);

    q.resolveCurrent();

    expect(show).toHaveBeenLastCalledWith(task('b'), 5);
    expect(q.pending()).toBe(0);
  });

  it('tuščioje eilėje resolveCurrent nieko nedaro', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);
    q.resolveCurrent();
    expect(show).not.toHaveBeenCalled();
  });

  it('to paties id du kartus į eilę nededa', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);
    q.push(task('a'), 0);
    q.push(task('a'), 0);
    expect(q.pending()).toBe(0);
  });
});
```

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/desktop/sound.test.ts tests/desktop/alarmQueue.test.ts`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti realizacijas**

`src/desktop/sound.ts`:

```ts
import type { SettingsMap } from '../core/settings.js';

export function shouldPlaySound(setting: SettingsMap['sound'], kind: 'alarm' | 'digest'): boolean {
  if (setting === 'off') return false;
  if (setting === 'always') return true;
  return kind === 'alarm';
}
```

`src/desktop/alarmQueue.ts`:

```ts
import type { Task } from '../core/types.js';

export interface AlarmQueue {
  push(task: Task, lateMinutes: number): void;
  resolveCurrent(): void;
  pending(): number;
}

export function createAlarmQueue(
  show: (task: Task, lateMinutes: number) => void,
): AlarmQueue {
  const waiting: { task: Task; lateMinutes: number }[] = [];
  let current: string | null = null;

  const showNext = (): void => {
    const next = waiting.shift();
    if (next === undefined) {
      current = null;
      return;
    }
    current = next.task.id;
    show(next.task, next.lateMinutes);
  };

  return {
    push(task, lateMinutes) {
      if (current === task.id || waiting.some((w) => w.task.id === task.id)) return;
      waiting.push({ task, lateMinutes });
      if (current === null) showNext();
    },
    resolveCurrent() {
      if (current === null) return;
      current = null;
      showNext();
    },
    pending: () => waiting.length,
  };
}
```

Apsauga nuo dubliavimo pagal `id` reikalinga todėl, kad atidėtas ir vėl suveikęs priminimas gali atkeliauti, kol senas langas dar neuždarytas.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/desktop/sound.test.ts tests/desktop/alarmQueue.test.ts`
Expected: PASS, 7 testų

- [ ] **Step 5: Commit**

```bash
git add src/desktop tests/desktop
git commit -m "feat: garso taisyklė ir žadintuvų eilė"
```

---

### Task 5: Sujungimas su Electron

**Files:**
- Create: `src/desktop/reminderWindows.ts`
- Modify: `src/desktop/main.ts`, `src/desktop/tray.ts`

**Interfaces:**
- Consumes: `createReminderScheduler`, `createAlarmQueue`, `shouldPlaySound`, `popupBounds`
- Produces: `createReminderWindows(baseUrl, deps): { showAlarm(task, lateMinutes), showDigest(), dispose() }`

- [ ] **Step 1: Parašyti priminimų langų modulį**

`src/desktop/reminderWindows.ts`:

```ts
import { BrowserWindow, screen } from 'electron';
import type { Task } from '../core/types.js';
import { popupBounds } from './windowPosition.js';

const ALARM_SIZE = { width: 340, height: 200 };
const DIGEST_SIZE = { width: 380, height: 460 };
const AUTO_CLOSE_MS = 60_000;

export interface ReminderWindowDeps {
  soundFor(kind: 'alarm' | 'digest'): boolean;
  onAlarmClosed(): void;
  snooze(taskId: string, minutes: number): Promise<void>;
}

function cornerBounds(size: { width: number; height: number }) {
  const { workArea } = screen.getPrimaryDisplay();
  const corner = { x: workArea.x + workArea.width, y: workArea.y + workArea.height, width: 0, height: 0 };
  return popupBounds(corner, workArea, size);
}

export function createReminderWindows(baseUrl: string, deps: ReminderWindowDeps) {
  let alarm: BrowserWindow | null = null;
  let digest: BrowserWindow | null = null;

  return {
    showAlarm(task: Task, lateMinutes: number) {
      alarm?.destroy();

      const sound = deps.soundFor('alarm') ? '1' : '0';
      alarm = new BrowserWindow({
        ...cornerBounds(ALARM_SIZE),
        frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
      });
      alarm.setAlwaysOnTop(true, 'screen-saver');
      void alarm.loadURL(
        `${baseUrl}/alarm/?id=${task.id}&late=${lateMinutes}&sound=${sound}`,
      );

      // Nepaliestas langas grįžta po 10 min — ta pati logika kaip mygtukas „Atidėti".
      const timer = setTimeout(() => {
        void deps.snooze(task.id, 10).finally(() => alarm?.close());
      }, AUTO_CLOSE_MS);

      alarm.on('closed', () => {
        clearTimeout(timer);
        alarm = null;
        deps.onAlarmClosed();
      });
    },

    showDigest() {
      if (digest !== null && !digest.isDestroyed()) {
        digest.focus();
        return;
      }
      digest = new BrowserWindow({
        ...cornerBounds(DIGEST_SIZE),
        frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
      });
      void digest.loadURL(`${baseUrl}/digest/`);
      digest.on('closed', () => { digest = null; });
    },

    dispose() {
      alarm?.destroy();
      digest?.destroy();
    },
  };
}
```

- [ ] **Step 2: Pridėti garso pasirinkimą į tray meniu**

`src/desktop/tray.ts` — praplėsti `TrayHandlers` ir meniu:

```ts
export interface TrayHandlers {
  onQuickAdd(): void;
  onOpenBoard(): void;
  onSoundChange(value: 'always' | 'alarms' | 'off'): void;
  onQuit(): void;
}
```

```ts
export function createTray(
  appPath: string,
  sound: 'always' | 'alarms' | 'off',
  handlers: TrayHandlers,
): Tray {
```

Meniu šablone prieš skirtuką įterpti:

```ts
      {
        label: 'Garsas',
        submenu: (
          [
            ['always', 'Visada'],
            ['alarms', 'Tik žadintuvams'],
            ['off', 'Išjungta'],
          ] as const
        ).map(([value, label]) => ({
          label,
          type: 'radio' as const,
          checked: sound === value,
          click: () => handlers.onSoundChange(value),
        })),
      },
```

- [ ] **Step 3: Paleisti planuoklį pagrindiniame procese**

`src/desktop/main.ts` — po tray sukūrimo pridėti:

**Dėmesio — 2 fazės palikimas.** `main.ts` po nustatymų perskaitymo kviečia `db.close()`, nes iki šiol bazės daugiau nereikėjo. Planuokliui ji reikalinga visą programos gyvavimo laiką, tad **tą `db.close()` eilutę reikia pašalinti**, o bazę uždaryti `before-quit` tvarkyklėje kartu su kitais ištekliais. `db` ir `settingsStore` kintamieji jau egzistuoja. Trūksta tik užduočių saugyklos:

```ts
    const store = createTaskStore(db, systemClock);

    const reminderWindows = createReminderWindows(`http://127.0.0.1:${port}`, {
      soundFor: (kind) => shouldPlaySound(settingsStore.getAll().sound, kind),
      onAlarmClosed: () => queue.resolveCurrent(),
      snooze: async (taskId, minutes) => {
        await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/snooze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutes }),
        });
      },
    });

    const queue = createAlarmQueue((task, late) => reminderWindows.showAlarm(task, late));

    const stopScheduler = createReminderScheduler({
      tasks: store,
      settings: settingsStore,
      clock: systemClock,
      events: {
        onAlarm: (task, late) => queue.push(task, late),
        onDigest: () => reminderWindows.showDigest(),
      },
    }).start(15_000);

    app.on('will-quit', () => {
      stopScheduler();
      reminderWindows.dispose();
    });
```

`queue` deklaruojamas po `reminderWindows`, bet naudojamas jo viduje — `const` iškėlimas čia veikia, nes `onAlarmClosed` iškviečiamas tik po to, kai abu jau sukurti. Kad tai būtų akivaizdu, `onAlarmClosed` rašomas kaip rodyklinė funkcija, o ne tiesioginė nuoroda.

`createTray` kreipinys `main.ts` faile gauna naują antrą argumentą ir naują tvarkyklę:

```ts
    const tray = createTray(app.getAppPath(), settings.sound, {
      onQuickAdd: () => windows.togglePopup(tray.getBounds()),
      onOpenBoard: () => windows.openBoard(),
      onSoundChange: (value) => { settingsStore.patch({ sound: value }); },
      onQuit: () => { windows.dispose(); app.quit(); },
    });
```

- [ ] **Step 4: Rankinė patikra**

Run: `npm run app`

1. Sukurti užduotį su laiku po 2 minučių — sulaukti žadintuvo lango apatiniame dešiniajame kampe su garsu
2. „Atidėti 10 min" langą uždaro; per API matyti, kad `remind_at` pasistūmė
3. „Atlikta" pažymi užduotį ir uždaro langą
4. „Nutildyti" nutildo garsą, langas lieka
5. Sukurti dvi užduotis tam pačiam laikui — langai rodomi po vieną, antras po pirmojo uždarymo
6. Tray meniu → Garsas → Išjungta; kitas žadintuvas ateina tyliai
7. Nustatyti dienos apžvalgos laiką po 2 minučių (per `PATCH /api/settings`) — sulaukti apžvalgos lango su šiandienos užduotimis
8. Neturint neatliktų užduočių apžvalga nepasirodo
9. Užmigdyti kompiuterį prieš priminimo laiką ir pažadinti po jo — langas pasirodo su prierašu „vėluoja N min"

- [ ] **Step 5: Paleisti visus automatinius testus**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/desktop
git commit -m "feat: priminimų langai, eilė ir garso perjungimas tray meniu"
```

---

## Pabaigos patikra

Po 5 užduoties sistema pati primena: 10:00 ir 15:30 rodo dienos apžvalgą, o užduotims su laiku skambina žadintuvu, kuris kartojasi kas 10 minučių, kol atsakysi.

**Neveiks (4 fazė):** nustatymų langas, autostartas, LAN adreso rodymas, diegimo failas.
