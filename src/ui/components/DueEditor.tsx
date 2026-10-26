import { useEffect, useState } from 'react';
import { bucketLabel } from '../../core/buckets.js';
import { addDays, dateOf, formatLocalDate, timeOf } from '../../core/datetime.js';
import { priorityLabel, t, type Locale } from '../../core/i18n.js';
import { repeatLabel } from '../../core/repeat.js';
import { parseTimeInput, resolveDue, type DateChoice } from '../../core/timeinput.js';
import type { Priority } from '../../core/types.js';
import { DateField } from './DateField.js';

export interface DueValue {
  due_at: string | null;
  due_has_time: boolean;
  remind_at: string | null;
  priority: Priority;
  repeat: string | null;
}

// Patch'as, kurį DueEditor siunčia į onChange — dalis laukų gali būti
// nepridėti (undefined = "šio karto nekeičiu"), o ne tik null/reikšmė (4
// radinys). Svarbiausias pavyzdys: pasirinkus kartojimo šabloną siunčiamas
// tik `{ repeat }`, be due_at — kitaip aiškiai (nors ir nekeistai) atsiųstas
// due_at nustelbtų serverio perskaičiavimą (žr. 1 radinį tasks.ts).
export type DuePatch = Partial<DueValue>;

export interface DueEditorProps {
  value: DueValue;
  now: Date;
  locale: Locale;
  onChange(next: DuePatch): void;
}

// Sąraše pavadinimas pradedamas didžiąja raide, kortelėje — ne („kartojasi
// kas pirmadienį" viduryje sakinio). Frazė ta pati, skiriasi tik pirmoji
// raidė, tad antros lentelės tam nereikia.
const didzioji = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Tos pačios reikšmės, kaip ir iki šiol: septynios savaitės dienos ir septynios
// mėnesio dienos. Pavadinimai nebe rašomi čia — jie ateina iš `repeatLabel`.
const REPEAT_VALUES = [
  'w:1', 'w:2', 'w:3', 'w:4', 'w:5', 'w:6', 'w:7',
  'm:1', 'm:5', 'm:10', 'm:15', 'm:20', 'm:25', 'm:31',
];

const timeFromValue = (value: DueValue): string =>
  value.due_at !== null && value.due_has_time ? (timeOf(value.due_at) ?? '') : '';

export function DueEditor({ value, now, locale, onChange }: DueEditorProps) {
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
    const time = timeRaw.trim() === '' ? null : parseTimeInput(timeRaw, locale);
    if (timeRaw.trim() !== '' && time === null) return;
    onChange({ ...resolveDue(choice, time, now), priority: value.priority, repeat: value.repeat });
  };

  // `data-testid` tik „rytoj" kabučiui — jį vienintelį e2e renka pagal
  // elementą, ne pagal matomą tekstą (žr. board.spec.ts). „Šiandien" ten
  // niekada neieškomas atskirai, tad naujo rakto jam nereikia.
  const chip = (label: string, choice: DateChoice, selected: boolean) => (
    <button
      type="button"
      aria-label={label}
      data-testid={choice === 'tomorrow' ? 'terminas-rytoj' : undefined}
      data-pazymeta={selected}
      onClick={() => apply(choice, timeDraft)}
    >
      {label}
    </button>
  );

  return (
    <div className="termino-eilute">
      {/* `bucketLabel`, ne sava etikečių lentelė: reikšmė sąmoningai bendra su
          kolonų antraštėmis — tai ta pati sąvoka („šiandien", „rytoj"). */}
      {chip(bucketLabel(locale, 'today'), 'today', value.due_at === null)}
      {chip(bucketLabel(locale, 'tomorrow'), 'tomorrow', isTomorrow)}

      {/* Savas laukas vietoj `<input type="date">`: natyvus paklūsta naršyklės,
          o ne puslapio kalbai, tad planšetėje liktų angliškas. Žr. DateField. */}
      <DateField
        label={t(locale, 'due.date')}
        testId="terminas-data-kalendorius"
        value={value.due_at !== null ? dateOf(value.due_at) : ''}
        today={formatLocalDate(now)}
        locale={locale}
        onChange={(v) => {
          if (v !== '') apply({ date: v }, timeDraft);
        }}
      />

      <input
        type="text"
        data-testid="terminas-laikas"
        aria-label={t(locale, 'due.time')}
        placeholder="--:--"
        size={5}
        value={timeDraft}
        onChange={(e) => setTimeDraft(e.target.value)}
        onBlur={() => apply(currentDate, timeDraft)}
      />

      <select
        aria-label={t(locale, 'due.repeat')}
        value={value.repeat ?? ''}
        onChange={(e) => {
          const repeat = e.target.value === '' ? null : e.target.value;
          if (repeat === null) {
            onChange({ ...value, repeat: null });
            return;
          }
          // 4 radinys: serveris tampa autoritetu terminui. Redaktorius
          // NEBESKAIČIUOJA nextOccurrence čia — jis siunčia tik pasikeitusį
          // repeat, be due_at ir be remind_at. Naują datą vartotojas pamatys
          // gavęs serverio atsakymą (lenta jau persikrauna per SSE). Tai
          // suderinama su 1 radinio taisymu tasks.ts: aiškiai nurodytas
          // due_at ten laimi prieš peršokimą tik tada, kai jo iš čia
          // nesiunčiame be reikalo.
          onChange({ repeat });
        }}
      >
        <option value="">{t(locale, 'due.noRepeat')}</option>
        {REPEAT_VALUES.map((v) => (
          <option key={v} value={v}>{didzioji(repeatLabel(locale, v))}</option>
        ))}
      </select>

      <span className="prioriteto-taskai">
        {([1, 2, 3] as Priority[]).map((p) => (
          <button
            key={p}
            type="button"
            data-testid={`terminas-prioritetas-${p}`}
            aria-label={t(locale, 'due.priority', { level: priorityLabel(locale, p) })}
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
