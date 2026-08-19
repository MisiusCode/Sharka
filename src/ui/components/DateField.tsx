import { useEffect, useRef, useState } from 'react';
import {
  isValidDateString,
  LITHUANIAN_WEEKDAYS_SHORT,
  monthGrid,
  monthTitle,
  shiftMonth,
} from '../../core/calendar.js';
import { formatLithuanianDate } from '../../core/datetime.js';

export interface DateFieldProps {
  // Naudojamas ir kaip `aria-label`, ir kaip kalendoriaus mygtuko vardo
  // priešdėlis — lentoje šalia stovi du laukai („Nuo" ir „Iki"), tad jų
  // mygtukai turi skirtis.
  label: string;
  value: string;
  today: string;
  onChange(value: string): void;
}

function Kalendoriukas() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5 1a.7.7 0 0 1 .7.7V2.5h4.6V1.7a.7.7 0 1 1 1.4 0V2.5h.8A1.5 1.5 0 0 1 14 4v8.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5V4a1.5 1.5 0 0 1 1.5-1.5h.8V1.7A.7.7 0 0 1 5 1ZM3.4 6.2v6.3c0 .06.04.1.1.1h9c.06 0 .1-.04.1-.1V6.2H3.4Z" />
    </svg>
  );
}

// Pakeičia natyvų `<input type="date">`. Chrome jam ima NARŠYKLĖS kalbą, o ne
// puslapio `lang` atributą, tad planšetės naršyklėje laukas ir jo kalendorius
// lieka angliški, kad ir ką darytum su HTML. Electron'e tai buvo išspręsta
// `app.commandLine.appendSwitch('lang', 'lt')`, bet svetimoje naršyklėje tokio
// sverto nėra — vienintelis būdas gauti lietuvišką datą visur yra piešti lauką
// patiems. Papildomai tai duoda pirmadieniu prasidedančią savaitę ir leidžia
// pagaliau nurodyti `placeholder` (natyviam datos laukui jis negalioja).
export function DateField({ label, value, today, onChange }: DateFieldProps) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [{ year, month }, setView] = useState(() => atidarymoMenuo(value, today));
  const wrap = useRef<HTMLSpanElement | null>(null);

  useEffect(() => { setDraft(value); }, [value]);

  // Atsivėrus rodom pasirinktos datos mėnesį, o jos neturint — šios dienos.
  useEffect(() => {
    if (open) setView(atidarymoMenuo(value, today));
  }, [open, value, today]);

  useEffect(() => {
    if (!open) return;
    const uzdaryk = (e: PointerEvent): void => {
      if (wrap.current !== null && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', uzdaryk);
    return () => document.removeEventListener('pointerdown', uzdaryk);
  }, [open]);

  const grid = monthGrid(year, month);

  return (
    <span className="datos-laukas" ref={wrap}>
      <input
        type="text"
        aria-label={label}
        inputMode="numeric"
        placeholder="yyyy-mm-dd"
        size={10}
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          // Praleidžiam tik tai, kas jau yra data (arba tuščia) — antraip
          // renkant „2026-0" į viršų nukeliautų pusiau surinkta reikšmė.
          if (next === '' || isValidDateString(next)) onChange(next);
        }}
        onBlur={() => {
          if (draft !== '' && !isValidDateString(draft)) setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            // Tray langelis klausosi Escape ant `window`: nesustabdytas įvykis
            // uždarytų visą langelį kartu su kalendoriumi.
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />

      <button
        type="button"
        className="kalendoriaus-mygtukas"
        aria-label={`${label} — kalendorius`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Kalendoriukas />
      </button>

      {open && (
        <div
          className="kalendorius"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="kalendoriaus-antraste">
            <button
              type="button"
              aria-label="Ankstesnis mėnuo"
              onClick={() => setView(shiftMonth(year, month, -1))}
            >
              ‹
            </button>
            <span>{monthTitle(year, month)}</span>
            <button
              type="button"
              aria-label="Kitas mėnuo"
              onClick={() => setView(shiftMonth(year, month, 1))}
            >
              ›
            </button>
          </div>

          <div className="savaites-dienos" aria-hidden="true">
            {LITHUANIAN_WEEKDAYS_SHORT.map((d) => <span key={d}>{d}</span>)}
          </div>

          <div className="kalendoriaus-dienos">
            {grid.map((d) => (
              <button
                key={d.date}
                type="button"
                data-data={d.date}
                data-menesyje={d.inMonth}
                data-siandien={d.date === today}
                data-pazymeta={d.date === value}
                aria-label={formatLithuanianDate(d.date, today)}
                onClick={() => {
                  onChange(d.date);
                  setDraft(d.date);
                  setOpen(false);
                }}
              >
                {Number(d.date.slice(8, 10))}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

function atidarymoMenuo(value: string, today: string): { year: number; month: number } {
  const baze = isValidDateString(value) ? value : today;
  return { year: Number(baze.slice(0, 4)), month: Number(baze.slice(5, 7)) };
}
