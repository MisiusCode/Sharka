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
