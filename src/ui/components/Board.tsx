import {
  DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BUCKET_LABELS, DATE_BUCKETS, dateBucketOf, dueForBucket, sortTasks, type DateBucket } from '../../core/buckets.js';
import {
  COMPLETED_BUCKETS, COMPLETED_LABELS, completedBetween, completedBucketOf,
  defaultRange, doneLastWeek, isValidRange, sortByCompleted,
} from '../../core/completed.js';
import { formatLithuanianDate, formatLocalDate } from '../../core/datetime.js';
import { statusLabel } from '../../core/i18n.js';
import type { PublicSettings } from '../../core/settings.js';
import type { Status, Task } from '../../core/types.js';
import * as api from '../api.js';
import { loadLocalPrefs, saveLocalPrefs, type LocalPrefs } from '../localPrefs.js';
import { applyTheme } from '../useTheme.js';
import { useNow } from '../useNow.js';
import { Column } from './Column.js';
import { DateField } from './DateField.js';
import type { DuePatch } from './DueEditor.js';
import { FilterBar } from './FilterBar.js';
import { PinGate } from './PinGate.js';
import { QuickAdd } from './QuickAdd.js';
import { TaskCard } from './TaskCard.js';

const STATUSES: Status[] = ['todo', 'doing', 'done'];

function DraggableCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    // dnd-kit šiam apvalkalui priskiria role="button" be savo aria-label — be
    // aiškaus pavadinimo prieinamumo medyje jis „pasisavina" visą vidinį tekstą
    // (pavadinimą, varnelę, trynimo mygtuką), tad `getByRole('button', …)`
    // tampa dviprasmiškas tarp šio apvalkalo ir tikrų vidinių mygtukų.
    //
    // aria-label dedamas PO `{...listeners} {...attributes}` sąmoningai: jei
    // jis būtų prieš juos, o dnd-kit kada nors pradėtų grąžinti savo
    // aria-label per `attributes`, spread'as jį tyliai perrašytų.
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} aria-label="Užduoties kortelė, tempiama">
      {children}
    </div>
  );
}

export function Board({ now: initialNow }: { now: Date }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [prefs, setPrefs] = useState<LocalPrefs>(loadLocalPrefs);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Serverio 401 su error.code 'unauthorized' reiškia, kad sesijos nėra (arba
  // ji baigėsi) — tada lenta rodo PIN ekraną vietoj savęs, žr. žemiau prieš
  // „Kraunama…" atšaką.
  const [reikiaPin, setReikiaPin] = useState(false);
  const [draft, setDraft] = useState(() => defaultRange(formatLocalDate(initialNow)));
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  // Bendras laikrodis (žr. `useNow.ts`) — `initialNow` tik sėja pradinę
  // reikšmę, o toliau jis gyvena savarankiškai: planšetė, palikta atidaryta
  // per naktį, kitaip amžinai rodytų vakarykštę „Šiandien" ir, tempiant
  // kortelę į „Rytoj", įrašytų neteisingą datą — būtent tą spragą, kurią
  // klientinis kibirėlių skaičiavimas turėjo išspręsti.
  const now = useNow(initialNow);

  const today = formatLocalDate(now);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const reload = useCallback(async () => {
    try {
      setTasks(await api.fetchTasks());
    } catch (err) {
      if (err instanceof api.UnauthorizedError) { setReikiaPin(true); return; }
      setError((err as Error).message);
    }
  }, []);

  // Analogiška `reload`, bet nustatymams — atskira funkcija, o ne inline
  // `.then` efekte, nes ją reikia iškviesti dar kartą po PIN įvedimo (žr.
  // PinGate onUnlocked žemiau). Pirmo apsilankymo be sesijos metu abu, ir
  // užduotys, ir nustatymai, gauna 401 vienu metu — vien užduočių
  // persikrovimo nepakaktų, lenta liktų „Kraunama…" amžinai, nes settings
  // taip ir neišsivaduotų iš null.
  const loadSettings = useCallback(async () => {
    try {
      setSettings(await api.fetchSettings());
    } catch (err) {
      if (err instanceof api.UnauthorizedError) { setReikiaPin(true); return; }
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    void reload();
    void loadSettings();
    return api.subscribeToChanges(
      () => { void reload(); },
      (status) => setConnected(status === 'connected'),
    );
  }, [reload, loadSettings]);

  useEffect(() => {
    if (settings !== null) applyTheme(settings.theme);
  }, [settings]);

  // Peržiūra gyvena tik „Padaryta" rodinyje. Nuvalymas per efektą, o ne
  // `changeGrouping` viduje: ryšys „grupavimas ne 'completed' → peržiūros nėra"
  // taip galioja bet kuriam grupavimo pasikeitimo keliui, o ne vien vienam
  // mygtukui. Šiandien toks kelias vienintelis — `changeGrouping`: nustatymai
  // imami vieną kartą montuojant, o SSE atnaujina tik užduotis.
  //
  // Skaitoma tiesiai iš `settings?.grouping`, o ne iš `completedView`: šis
  // hook'as turi būti kviečiamas besąlygiškai kiekvieną atvaizdavimą, taigi
  // prieš žemiau esantį ankstyvą `return`, o `completedView` apibrėžiamas
  // tik po jo.
  useEffect(() => {
    if (settings?.grouping !== 'completed') setApplied(null);
  }, [settings?.grouping]);

  // PRIEŠ „settings === null": be sesijos abu pradiniai užklausimai (užduotys
  // IR nustatymai) gauna 401, tad `settings` niekada neišsivaduotų iš null ir
  // žemiau esanti „Kraunama…" atšaka liktų rodoma amžinai, PIN ekranui taip ir
  // nepasirodžius.
  if (reikiaPin) {
    return (
      <PinGate
        onUnlocked={() => {
          setReikiaPin(false);
          // `error` galėjo likti iš senesnės, jau nebeaktualios nesėkmės —
          // nei `reload()`, nei `run()` savo `UnauthorizedError` atšakoje jo
          // neliečia (žr. aukščiau ir 151 eilutę), tad be šito lenta po
          // teisingo PIN grįžtų su svetimu klaidos pranešimu.
          setError(null);
          void reload();
          void loadSettings();
        }}
      />
    );
  }

  if (settings === null) {
    return <div className="lenta">Kraunama…</div>;
  }

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (err) {
      if (err instanceof api.UnauthorizedError) { setReikiaPin(true); return; }
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

  const changeGrouping = (grouping: 'date' | 'status' | 'completed'): void => {
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

  const completedView = settings?.grouping === 'completed';

  const visible = sortTasks(
    tasks.filter((t) => {
      if (!prefs.showDone && t.status === 'done' && settings?.grouping === 'date') return false;
      if (prefs.priorities.length > 0 && !prefs.priorities.includes(t.priority)) return false;
      return true;
    }),
  );

  // `rangeTasks` skaičiuojamas iš `visible`, tad prioriteto filtras veikia ir peržiūroje.
  const rangeView = completedView && applied !== null;
  const rangeTasks = applied === null ? [] : completedBetween(visible, applied.from, applied.to);

  const columns = completedView
    ? COMPLETED_BUCKETS.map((b) => ({
        id: b,
        label: COMPLETED_LABELS[b],
        tasks: sortByCompleted(visible.filter((t) => completedBucketOf(t, today) === b)),
      }))
    : settings?.grouping === 'status'
      ? STATUSES.map((s) => ({
          id: s,
          // LAIKINA: sąsaja dar visada lietuviška — 2b dalis paduos tikrą kalbą.
          label: statusLabel('lt', s),
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

      <QuickAdd now={now} onCreate={(input) => void run(() => api.createTask(input))} />

      {completedView && (
        <div className="laikotarpis">
          {/* Savi laukai vietoj `<input type="date">` — natyvus paklūsta
              naršyklės, o ne puslapio kalbai. Žr. DateField. */}
          <label>
            Nuo
            <DateField
              label="Nuo"
              value={draft.from}
              today={today}
              onChange={(v) => setDraft({ ...draft, from: v })}
            />
          </label>
          <label>
            Iki
            <DateField
              label="Iki"
              value={draft.to}
              today={today}
              onChange={(v) => setDraft({ ...draft, to: v })}
            />
          </label>
          <button
            type="button"
            disabled={!isValidRange(draft.from, draft.to)}
            onClick={() => setApplied(draft)}
          >
            Peržiūrėti
          </button>
          {draft.from !== '' && draft.to !== '' && draft.from > draft.to && (
            <span className="ispejimas">Pradžios data vėlesnė už pabaigos.</span>
          )}
        </div>
      )}

      {completedView && (
        <p className="suvestine">
          {rangeView ? (
            <>
              Padaryta: {rangeTasks.length}{' '}
              <button type="button" onClick={() => setApplied(null)}>
                Grįžti
              </button>
            </>
          ) : (
            <>Per savaitę padaryta {doneLastWeek(visible, today)}</>
          )}
        </p>
      )}

      {rangeView ? (
        rangeTasks.length === 0 ? (
          <p className="tuscia">Per šį laikotarpį nieko nepadaryta.</p>
        ) : (
          <ul className="atlikimu-sarasas">
            {rangeTasks.map((t) => (
              <li key={t.id}>
                <span className="prioriteto-juostele" data-prioritetas={t.priority} />
                <span className="atlikimo-data">
                  {t.completed_at !== null && t.completed_at !== undefined
                    ? formatLithuanianDate(t.completed_at.slice(0, 10), today)
                    : ''}
                </span>
                <span>{t.title}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="kolonos">
          {columns.map((col) => (
            <Column key={col.id} id={col.id} label={col.label} count={col.tasks.length}>
              {col.tasks.map((task) => {
                const kortelesProps = {
                  task,
                  today,
                  now,
                  onReschedule: (id: string, due: DuePatch) =>
                    void run(() =>
                      api.patchTask(id, {
                        due_at: due.due_at,
                        due_has_time: due.due_has_time,
                        remind_at: due.remind_at,
                        priority: due.priority,
                        repeat: due.repeat,
                      }),
                    ),
                  onToggleDone: (id: string, done: boolean) => {
                    // Optimistiškai atnaujina būseną iš karto: naršyklė varnelę
                    // pažymi natūraliai spustelėjus, bet React kontroliuojamas
                    // laukas ją grąžina atgal, jei `checked` vis dar remiasi sena
                    // (serverio dar nepatvirtinta) būsena — vartotojas matytų
                    // trumpą mirktelėjimą atgal į nepažymėtą prieš užduočiai
                    // dingstant iš sąrašo.
                    setTasks((prev) =>
                      prev.map((t) => (t.id === id ? { ...t, status: done ? 'done' : 'todo' } : t)),
                    );
                    void run(() => api.patchTask(id, { status: done ? 'done' : 'todo' }));
                  },
                  onDelete: (id: string) => void run(() => api.deleteTask(id)),
                  onRename: (id: string, title: string) => void run(() => api.patchTask(id, { title })),
                };
                return completedView ? (
                  <TaskCard key={task.id} {...kortelesProps} />
                ) : (
                  <DraggableCard key={task.id} id={task.id}>
                    <TaskCard {...kortelesProps} />
                  </DraggableCard>
                );
              })}
            </Column>
          ))}
        </div>
      </DndContext>
      )}
    </div>
  );
}
