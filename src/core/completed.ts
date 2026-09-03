import { addDays } from './datetime.js';
import { t, type Locale, type MessageKey } from './i18n.js';
import type { Task } from './types.js';

export type CompletedBucket = 'today' | 'yesterday' | 'week' | 'earlier';

export const COMPLETED_BUCKETS: CompletedBucket[] = ['today', 'yesterday', 'week', 'earlier'];

const COMPLETED_KEYS: Record<CompletedBucket, MessageKey> = {
  today: 'done.today',
  yesterday: 'done.yesterday',
  week: 'done.week',
  earlier: 'done.earlier',
};

export function completedLabel(locale: Locale, bucket: CompletedBucket): string {
  return t(locale, COMPLETED_KEYS[bucket]);
}

// LAIKINA — 2b dalis ištrina, kai sąsaja pradės perduoti tikrą kalbą.
// Lietuviškas vaizdas, kad sąsaja ir jos testai veiktų nepakeisti. Reikšmės
// skaičiuojamos iš tos pačios lentelės, tad nutolti nuo `completedLabel` jos negali.
export const COMPLETED_LABELS: Record<CompletedBucket, string> = {
  today: completedLabel('lt', 'today'),
  yesterday: completedLabel('lt', 'yesterday'),
  week: completedLabel('lt', 'week'),
  earlier: completedLabel('lt', 'earlier'),
};

// `completed_at` yra pilnas ISO momentas UTC su Z; kolonoms reikia tik datos,
// tad imamas paprastas pjūvis be laiko juostos konvertavimo.
//
// Lietuva yra UTC+2 žiemą ir UTC+3 vasarą (UTC = vietinis − poslinkis), tad
// UTC data gali tik atsilikti nuo vietinės, niekada jos nepralenkti. Skirtumas
// tarp UTC pjūvio ir vietinės datos iškyla tik užduotims, atliktoms vietiniu
// laiku poslinkio valandomis iškart po vidurnakčio — 00:00–02:00 žiemą,
// 00:00–03:00 vasarą; vakare (pvz. 21:00–23:59) atliktos užduotys UTC ribos
// nekerta niekada. Priimta sąmoningai: taisymas reikštų laiko juostų logiką
// ten, kur jos sąmoningai nėra, o klaida — vienos dienos poslinkis retame
// krašte istoriniame rodinyje.
function completedDate(task: Task): string | null {
  if (task.status !== 'done' || task.completed_at === null) return null;
  return task.completed_at.slice(0, 10);
}

export function completedBucketOf(task: Task, today: string): CompletedBucket | null {
  const date = completedDate(task);
  if (date === null) return null;

  if (date >= today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  if (date >= addDays(today, -7)) return 'week';
  return 'earlier';
}

export function sortByCompleted(tasks: Task[]): Task[] {
  // Lyginimas grąžina ir nulį: komparatorius, niekada negrąžinantis nulio,
  // vienodoms reikšmėms nėra simetriškas, o `Array.sort` to tikisi.
  return [...tasks].sort((a, b) => {
    const x = a.completed_at ?? '';
    const y = b.completed_at ?? '';
    return x === y ? 0 : x > y ? -1 : 1;
  });
}

export function doneLastWeek(tasks: Task[], today: string): number {
  const riba = addDays(today, -7);
  return tasks.filter((t) => {
    const date = completedDate(t);
    return date !== null && date >= riba;
  }).length;
}

/** Trisdešimt dienų imtinai iš abiejų pusių: šiandien − 29 … šiandien. */
export function defaultRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -29), to: today };
}

export function isValidRange(from: string, to: string): boolean {
  // Tuščią eilutę tikrinti privaloma: `<input type="date">` ištrynus reikšmę
  // duoda '', o '' <= '2026-08-18' leksikografiškai yra true.
  if (from === '' || to === '') return false;
  return from <= to;
}

export function completedBetween(tasks: Task[], from: string, to: string): Task[] {
  return sortByCompleted(
    tasks.filter((t) => {
      const date = completedDate(t);
      return date !== null && date >= from && date <= to;
    }),
  );
}
