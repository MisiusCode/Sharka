import { useEffect, useState } from 'react';
import { addDays, dateOf, formatLocalDate, timeOf } from '../../core/datetime.js';
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
  onChange(next: DuePatch): void;
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
    onChange({ ...resolveDue(choice, time, now), priority: value.priority, repeat: value.repeat });
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

      {/* Savas laukas vietoj `<input type="date">`: natyvus paklūsta naršyklės,
          o ne puslapio kalbai, tad planšetėje liktų angliškas. Žr. DateField. */}
      <DateField
        label="Data"
        value={value.due_at !== null ? dateOf(value.due_at) : ''}
        today={formatLocalDate(now)}
        onChange={(v) => {
          if (v !== '') apply({ date: v }, timeDraft);
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

      <select
        aria-label="Kartojimas"
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
