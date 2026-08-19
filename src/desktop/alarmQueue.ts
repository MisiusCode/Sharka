import type { Task } from '../core/types.js';

export interface AlarmQueue {
  push(task: Task, lateMinutes: number): void;
  resolveCurrent(): void;
  pending(): number;
}

export function createAlarmQueue(
  show: (task: Task, lateMinutes: number) => void,
): AlarmQueue {
  const waiting: { task: Task; lateMinutes: number }[] = [];
  let current: string | null = null;

  const showNext = (): void => {
    const next = waiting.shift();
    if (next === undefined) {
      current = null;
      return;
    }
    current = next.task.id;
    show(next.task, next.lateMinutes);
  };

  return {
    push(task, lateMinutes) {
      if (current === task.id || waiting.some((w) => w.task.id === task.id)) return;
      waiting.push({ task, lateMinutes });
      if (current === null) showNext();
    },
    resolveCurrent() {
      if (current === null) return;
      current = null;
      showNext();
    },
    pending: () => waiting.length,
  };
}
