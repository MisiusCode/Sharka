import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/core/types.js';
import { dateBucketOf, dueForBucket, isOverdue, sortTasks } from '../../src/core/buckets.js';

const TODAY = '2026-08-14';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'x', title: 'Užduotis', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, repeat: null, ...over,
  };
}

describe('dateBucketOf', () => {
  it('bedatę deda į šiandien', () => {
    expect(dateBucketOf(task(), TODAY)).toBe('today');
  });

  it('pradelstą deda į šiandien', () => {
    expect(dateBucketOf(task({ due_at: '2026-07-01' }), TODAY)).toBe('today');
  });

  it('šiandienos ir rytdienos datas skiria', () => {
    expect(dateBucketOf(task({ due_at: '2026-08-14T18:00', due_has_time: true }), TODAY)).toBe('today');
    expect(dateBucketOf(task({ due_at: '2026-08-15' }), TODAY)).toBe('tomorrow');
  });

  it('savaitę skaičiuoja slenkamai: +2 ir +7 patenka, +8 ne', () => {
    expect(dateBucketOf(task({ due_at: '2026-08-16' }), TODAY)).toBe('week');
    expect(dateBucketOf(task({ due_at: '2026-08-21' }), TODAY)).toBe('week');
    expect(dateBucketOf(task({ due_at: '2026-08-22' }), TODAY)).toBe('later');
  });

  it('veikia per mėnesio ribą', () => {
    expect(dateBucketOf(task({ due_at: '2026-09-01' }), '2026-08-31')).toBe('tomorrow');
    expect(dateBucketOf(task({ due_at: '2028-02-29' }), '2028-02-28')).toBe('tomorrow');
  });
});

describe('isOverdue', () => {
  it('bedatė niekada nėra pradelsta', () => {
    expect(isOverdue(task(), TODAY)).toBe(false);
  });

  it('praėjusi data yra pradelsta, šiandienos ne', () => {
    expect(isOverdue(task({ due_at: '2026-08-13' }), TODAY)).toBe(true);
    expect(isOverdue(task({ due_at: '2026-08-14' }), TODAY)).toBe(false);
  });

  it('atlikta užduotis nerodoma kaip pradelsta', () => {
    expect(isOverdue(task({ due_at: '2026-08-13', status: 'done' }), TODAY)).toBe(false);
  });
});

describe('dueForBucket', () => {
  it('į šiandien be laiko — datą nuvalo', () => {
    const t = task({ due_at: '2026-08-20' });
    expect(dueForBucket(t, 'today', TODAY)).toEqual({ due_at: null, due_has_time: false, remind_at: null });
  });

  it('į šiandien su laiku — palieka valandą šiai dienai ir perkelia priminimą', () => {
    const t = task({ due_at: '2026-08-20T18:00', due_has_time: true, remind_at: '2026-08-20T18:00' });
    expect(dueForBucket(t, 'today', TODAY)).toEqual({
      due_at: '2026-08-14T18:00', due_has_time: true, remind_at: '2026-08-14T18:00',
    });
  });

  it('į rytoj, savaitę ir vėliau priskiria +1, +7 ir +8', () => {
    const t = task();
    expect(dueForBucket(t, 'tomorrow', TODAY).due_at).toBe('2026-08-15');
    expect(dueForBucket(t, 'week', TODAY).due_at).toBe('2026-08-21');
    expect(dueForBucket(t, 'later', TODAY).due_at).toBe('2026-08-22');
  });

  it('perkeliant laikas išsaugomas', () => {
    const t = task({ due_at: '2026-08-14T07:30', due_has_time: true, remind_at: '2026-08-14T07:30' });
    expect(dueForBucket(t, 'week', TODAY)).toEqual({
      due_at: '2026-08-21T07:30', due_has_time: true, remind_at: '2026-08-21T07:30',
    });
  });
});

describe('sortTasks', () => {
  it('pradelstos viršuje, bedatės gale, tarp jų pagal prioritetą', () => {
    const sorted = sortTasks([
      task({ id: 'bedatė-žemas', priority: 3 }),
      task({ id: 'bedatė-aukštas', priority: 1 }),
      task({ id: 'šiandien', due_at: '2026-08-14' }),
      task({ id: 'pradelsta', due_at: '2026-08-10' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([
      'pradelsta', 'šiandien', 'bedatė-aukštas', 'bedatė-žemas',
    ]);
  });

  it('esant vienodam terminui ir prioritetui rikiuoja pagal sukūrimą', () => {
    const sorted = sortTasks([
      task({ id: 'antra', created_at: '2026-08-02T10:00:00Z' }),
      task({ id: 'pirma', created_at: '2026-08-01T10:00:00Z' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['pirma', 'antra']);
  });
});
