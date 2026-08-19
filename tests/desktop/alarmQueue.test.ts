import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../src/core/types.js';
import { createAlarmQueue } from '../../src/desktop/alarmQueue.js';

const task = (id: string): Task => ({
  id, title: id, status: 'todo', priority: 2,
  due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
  created_at: '', updated_at: '', completed_at: null, repeat: null,
});

describe('createAlarmQueue', () => {
  it('pirmą rodo iš karto, antrą laiko eilėje', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);

    q.push(task('a'), 0);
    q.push(task('b'), 0);

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(task('a'), 0);
    expect(q.pending()).toBe(1);
  });

  it('uždarius einamąjį parodo kitą', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);
    q.push(task('a'), 0);
    q.push(task('b'), 5);

    q.resolveCurrent();

    expect(show).toHaveBeenLastCalledWith(task('b'), 5);
    expect(q.pending()).toBe(0);
  });

  it('tuščioje eilėje resolveCurrent nieko nedaro', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);
    q.resolveCurrent();
    expect(show).not.toHaveBeenCalled();
  });

  it('to paties id du kartus į eilę nededa', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);
    q.push(task('a'), 0);
    q.push(task('a'), 0);
    expect(q.pending()).toBe(0);
  });

  it('to paties id nededa antrą kartą, kol jis dar laukia (ne rodomas)', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);
    q.push(task('a'), 0);
    q.push(task('b'), 0);
    q.push(task('b'), 0);

    expect(q.pending()).toBe(1);
  });

  it('ištuštėjus eilei, naujas push vėl parodomas iš karto', () => {
    const show = vi.fn();
    const q = createAlarmQueue(show);
    q.push(task('a'), 0);
    q.push(task('b'), 0);

    q.resolveCurrent();
    q.resolveCurrent();
    q.push(task('c'), 0);

    expect(show).toHaveBeenLastCalledWith(task('c'), 0);
  });
});
