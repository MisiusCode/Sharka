import { addDays, dateOf, timeOf } from './datetime.js';
import { t, type Locale, type MessageKey } from './i18n.js';
import type { Task } from './types.js';

export type DateBucket = 'today' | 'tomorrow' | 'week' | 'later';

export const DATE_BUCKETS: DateBucket[] = ['today', 'tomorrow', 'week', 'later'];

const BUCKET_KEYS: Record<DateBucket, MessageKey> = {
  today: 'bucket.today',
  tomorrow: 'bucket.tomorrow',
  week: 'bucket.week',
  later: 'bucket.later',
};

export function bucketLabel(locale: Locale, bucket: DateBucket): string {
  return t(locale, BUCKET_KEYS[bucket]);
}

// LAIKINA — 2b dalis ištrina, kai sąsaja pradės perduoti tikrą kalbą.
// Lietuviškas vaizdas, kad sąsaja ir jos testai veiktų nepakeisti. Reikšmės
// skaičiuojamos iš tos pačios lentelės, tad nutolti nuo `bucketLabel` jos negali.
export const BUCKET_LABELS: Record<DateBucket, string> = {
  today: bucketLabel('lt', 'today'),
  tomorrow: bucketLabel('lt', 'tomorrow'),
  week: bucketLabel('lt', 'week'),
  later: bucketLabel('lt', 'later'),
};

export function dateBucketOf(task: Task, today: string): DateBucket {
  if (task.due_at === null) return 'today';
  const date = dateOf(task.due_at);
  if (date <= today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  if (date <= addDays(today, 7)) return 'week';
  return 'later';
}

export function isOverdue(task: Task, today: string): boolean {
  if (task.due_at === null || task.status === 'done') return false;
  return dateOf(task.due_at) < today;
}

export function dueForBucket(
  task: Task,
  bucket: DateBucket,
  today: string,
): { due_at: string | null; due_has_time: boolean; remind_at: string | null } {
  const time = task.due_at !== null && task.due_has_time ? timeOf(task.due_at) : null;

  if (bucket === 'today' && time === null) {
    return { due_at: null, due_has_time: false, remind_at: null };
  }

  const offsets: Record<DateBucket, number> = { today: 0, tomorrow: 1, week: 7, later: 8 };
  const date = addDays(today, offsets[bucket]);

  if (time === null) {
    return { due_at: date, due_has_time: false, remind_at: null };
  }
  return { due_at: `${date}T${time}`, due_has_time: true, remind_at: `${date}T${time}` };
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.due_at === null && b.due_at !== null) return 1;
    if (a.due_at !== null && b.due_at === null) return -1;
    if (a.due_at !== null && b.due_at !== null && a.due_at !== b.due_at) {
      return a.due_at < b.due_at ? -1 : 1;
    }
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}
