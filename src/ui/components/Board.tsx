import {
  DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { bucketLabel, DATE_BUCKETS, dateBucketOf, dueForBucket, sortTasks, type DateBucket } from '../../core/buckets.js';
import {
  COMPLETED_BUCKETS, completedBetween, completedBucketOf, completedLabel,
  defaultRange, doneLastWeek, isValidRange, sortByCompleted,
} from '../../core/completed.js';
import { formatDate, formatLocalDate } from '../../core/datetime.js';
import { statusLabel, t, type Locale } from '../../core/i18n.js';
import type { PublicSettings } from '../../core/settings.js';
import type { Status, Task } from '../../core/types.js';
import * as api from '../api.js';
import { errorText } from '../errorText.js';
import { loadLocalPrefs, saveLocalPrefs, type LocalPrefs } from '../localPrefs.js';
import { applyTheme } from '../useTheme.js';
import { browserLocale, localeOf } from '../useLocale.js';
import { useNow } from '../useNow.js';
import { Column } from './Column.js';
import { DateField } from './DateField.js';
import type { DuePatch } from './DueEditor.js';
import { FilterBar } from './FilterBar.js';
import { PinGate } from './PinGate.js';
import { QuickAdd } from './QuickAdd.js';
import { TaskCard } from './TaskCard.js';

const STATUSES: Status[] = ['todo', 'doing', 'done'];

function DraggableCard({ id, locale, children }: { id: string; locale: Locale; children: ReactNode }) {
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
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} aria-label={t(locale, 'board.dragHandle')}>
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
  // Nutrūkęs (dėl 401) mutuojantis veiksmas pakartojamas
  // po sėkmingo PIN. Laikomas `ref`, ne būsenoje: jo pasikeitimas
  // neturi perpiešti lentos, o tarp `run()` ir `onUnlocked` praeina
  // naudotojo PIN įvedimas. Įsimenamas TIK PASKUTINIS: sesija baigiasi tarp
  // dviejų paspaudimų, o ne vidury darbo srauto, tad realiai laukia
  // daugiausia vienas veiksmas — eilės nereikia.
  const nutruko = useRef<(() => Promise<unknown>) | null>(null);
  const [draft, setDraft] = useState(() => defaultRange(formatLocalDate(initialNow)));
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  // Bendras laikrodis (žr. `useNow.ts`) — `initialNow` tik sėja pradinę
  // reikšmę, o toliau jis gyvena savarankiškai: planšetė, palikta atidaryta
  // per naktį, kitaip amžinai rodytų vakarykštę „Šiandien" ir, tempiant
  // kortelę į „Rytoj", įrašytų neteisingą datą — būtent tą spragą, kurią
  // klientinis kibirėlių skaičiavimas turėjo išspręsti.
  const now = useNow(initialNow);

  const today = formatLocalDate(now);
  // Skaičiuojamas anksti (dar prieš „Kraunama…" atšaką žemiau), kad ir tas
  // trumpas kraunamas būsenos tekstas kalbėtų ta pačia kalba: `localeOf`
  // priima `settings === null` ir tada grąžina 'lt' atsarginę reikšmę.
  const locale = localeOf(settings);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // `lang` atributas nėra kosmetika — nuo jo priklauso rašybos tikrinimas
  // užduoties pavadinimo lauke ir ekrano skaitytuvai. `index.html` <html
  // lang="lt"> tėra pradinė reikšmė, kol nustatymai dar nepasikrovę. Tas
  // pats su `<title>Šarka</title>`: langas vadinasi programos vardu, bet
  // vardas irgi priklauso nuo kalbos („Sharka" angliškai), o Electron lango
  // antraštę ima iš `document.title`.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t(locale, 'app.name');
  }, [locale]);

  const reload = useCallback(async () => {
    try {
      setTasks(await api.fetchTasks());
    } catch (err) {
      if (err instanceof api.UnauthorizedError) { setReikiaPin(true); return; }
      setError(errorText(locale, err));
    }
    // `locale` sąrašo priklausomybėse: be jo šis kabutis liktų amžinai
    // uždarytas ties pirmojo atvaizdavimo kalba ('lt', kol nustatymai dar
    // nepasikrovę), o vėlesnės klaidos anglakalbiam naudotojui rodytųsi
    // lietuviškai.
  }, [locale]);

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
  // (be `locale` priklausomybės sąmoningai: nesėkmės atšaka čia negrąžina
  // klaidos teksto, o tik nulina `settings` — versti nėra ko.)

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

  // `run` apibrėžiama ČIA, prieš `reikiaPin` atšaką, o ne prie kitų mutacijų
  // žemiau (kaip būtų natūralu) — jos reikia PinGate `onUnlocked` viduje, o
  // ten, kaip ir čia, nesiremia `settings`. Jei ji liktų po ankstyvo
  // `return`, tos atšakos vykdymo metu `const run` niekada nebūtų pasiektas
  // (funkcija grąžina anksčiau), tad `onUnlocked` uždarytų neinicijuotą
  // laikiną negyvąją zoną (TDZ) ir kviesdama `run` mestų klaidą.
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (err) {
      if (err instanceof api.UnauthorizedError) {
        // Įsimenam veiksmą, kad PIN ekranui pasisekus jį pakartotume (žr.
        // `nutruko` deklaraciją aukščiau ir PinGate `onUnlocked` žemiau).
        nutruko.current = action;
        setReikiaPin(true);
        return;
      }
      // Varnelė lentoje atnaujinama optimistiškai, tad po nesėkmės vaizdas jau
      // rodo pakeitimą, kurio serveryje nėra. Persikraunam tikrą būseną PIRMA,
      // ir tik tada rodom klaidą — kitaip reload'o klaida užgožtų tikrąją.
      await reload();
      setError(errorText(locale, err));
    }
  };

  // PRIEŠ „settings === null": be sesijos abu pradiniai užklausimai (užduotys
  // IR nustatymai) gauna 401, tad `settings` niekada neišsivaduotų iš null ir
  // žemiau esanti „Kraunama…" atšaka liktų rodoma amžinai, PIN ekranui taip ir
  // nepasirodžius.
  if (reikiaPin) {
    return (
      <PinGate
        locale={browserLocale()}
        onUnlocked={() => {
          setReikiaPin(false);
          // `error` galėjo likti iš senesnės, jau nebeaktualios nesėkmės —
          // nei `reload()`, nei `run()` savo `UnauthorizedError` atšakoje jo
          // neliečia (žr. aukščiau ir 151 eilutę), tad be šito lenta po
          // teisingo PIN grįžtų su svetimu klaidos pranešimu.
          setError(null);
          void reload();
          void loadSettings();
          // Pakartojam nutrūkusią užklausą, jei tokia buvo — ir IŠ KARTO
          // išvalom nuorodą, kad kitas PIN įvedimas (dėl visai kitos,
          // vėlesnės 401) jos nebekartotų antrą kartą: dubliuota užduotis
          // yra blogiau nei prarasta.
          const veiksmas = nutruko.current;
          nutruko.current = null;
          if (veiksmas !== null) void run(veiksmas);
        }}
      />
    );
  }

  if (settings === null) {
    return <div className="lenta">{t(locale, 'board.loading')}</div>;
  }

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
        label: completedLabel(locale, b),
        tasks: sortByCompleted(visible.filter((t) => completedBucketOf(t, today) === b)),
      }))
    : settings?.grouping === 'status'
      ? STATUSES.map((s) => ({
          id: s,
          label: statusLabel(locale, s),
          tasks: visible.filter((t) => t.status === s),
        }))
      : DATE_BUCKETS.map((b) => ({
          id: b,
          label: bucketLabel(locale, b),
          tasks: visible.filter((t) => dateBucketOf(t, today) === b),
        }));

  return (
    <div className="lenta">
      {!connected && <div className="rysio-juosta">{t(locale, 'board.offline')}</div>}
      {error !== null && <div className="klaidos-juosta">{error}</div>}

      <FilterBar
        grouping={settings?.grouping ?? 'date'}
        prefs={prefs}
        locale={locale}
        onGroupingChange={changeGrouping}
        onPrefsChange={updatePrefs}
      />

      <QuickAdd now={now} locale={locale} onCreate={(input) => void run(() => api.createTask(input))} />

      {completedView && (
        <div className="laikotarpis">
          {/* Savi laukai vietoj `<input type="date">` — natyvus paklūsta
              naršyklės, o ne puslapio kalbai. Žr. DateField. */}
          <label>
            {t(locale, 'board.from')}
            <DateField
              label={t(locale, 'board.from')}
              testId="nuo-kalendorius"
              value={draft.from}
              today={today}
              locale={locale}
              onChange={(v) => setDraft({ ...draft, from: v })}
            />
          </label>
          <label>
            {t(locale, 'board.to')}
            <DateField
              label={t(locale, 'board.to')}
              value={draft.to}
              today={today}
              locale={locale}
              onChange={(v) => setDraft({ ...draft, to: v })}
            />
          </label>
          <button
            type="button"
            disabled={!isValidRange(draft.from, draft.to)}
            onClick={() => setApplied(draft)}
          >
            {t(locale, 'board.review')}
          </button>
          {draft.from !== '' && draft.to !== '' && draft.from > draft.to && (
            <span className="ispejimas">{t(locale, 'board.rangeInvalid')}</span>
          )}
        </div>
      )}

      {completedView && (
        <p className="suvestine">
          {rangeView ? (
            <>
              {t(locale, 'board.doneCount', { count: rangeTasks.length })}{' '}
              <button type="button" onClick={() => setApplied(null)}>
                {t(locale, 'board.back')}
              </button>
            </>
          ) : (
            <>{t(locale, 'board.doneWeek', { count: doneLastWeek(visible, today) })}</>
          )}
        </p>
      )}

      {rangeView ? (
        rangeTasks.length === 0 ? (
          <p className="tuscia">{t(locale, 'board.rangeEmpty')}</p>
        ) : (
          <ul className="atlikimu-sarasas">
            {/* Ciklo kintamasis vadinasi `task`, ne `t`: `t` čia yra vertimo
                funkcija, ir trumpasis vardas ją užstotų būtent toje vietoje,
                kur datą reikia formatuoti pagal kalbą. */}
            {rangeTasks.map((task) => (
              <li key={task.id}>
                <span className="prioriteto-juostele" data-prioritetas={task.priority} />
                <span className="atlikimo-data">
                  {task.completed_at !== null && task.completed_at !== undefined
                    ? formatDate(locale, task.completed_at.slice(0, 10), today)
                    : ''}
                </span>
                <span>{task.title}</span>
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
                  locale,
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
                  <DraggableCard key={task.id} id={task.id} locale={locale}>
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
