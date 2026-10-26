import type { Locale } from './i18n.js';
import { addDays, formatLocalDate } from './datetime.js';

export type DateChoice = 'today' | 'tomorrow' | { date: string };

// Be numatytosios reikšmės sąmoningai: `DueEditor` ir `SettingsView` abu jau
// paduoda tikrą kalbą, tad kvietėjas, kuris ją pamirštų, tyliai gautų
// lietuvišką parsinimą (pvz., „6pm" liktų atmesta) — dabar tokią klaidą
// pagauna tipų tikrinimas, o ne naudotojas.
export function parseTimeInput(raw: string, locale: Locale): string | null {
  const s = raw.trim();
  if (s === '') return null;

  // Tik anglų kalbai: „6pm", „6:30 PM", „12am". Lietuviškame įvedime `pm`
  // neturi prasmės, ir tylus jo priėmimas paslėptų rašybos klaidą.
  if (locale === 'en') {
    const ampm = /^(\d{1,2})(?::(\d{2}))?\s*([ap])m$/i.exec(s);
    if (ampm !== null) {
      const h = Number(ampm[1]);
      const m = ampm[2] === undefined ? 0 : Number(ampm[2]);
      if (h < 1 || h > 12 || m > 59) return null;
      const hours24 = ampm[3].toLowerCase() === 'a' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
      return `${String(hours24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

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
