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
