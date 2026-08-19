import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { createReminderScheduler, type ReminderEvents } from '../../src/core/reminders.js';
import { createSettingsStore } from '../../src/core/settings.js';
import { createTaskStore, type TaskStore } from '../../src/core/tasks.js';

let tasks: TaskStore;
let settings: ReturnType<typeof createSettingsStore>;
let clock: ReturnType<typeof fixedClock>;
let onAlarm: ReturnType<typeof vi.fn<ReminderEvents['onAlarm']>>;
let onDigest: ReturnType<typeof vi.fn<ReminderEvents['onDigest']>>;
let tick: () => void;

beforeEach(() => {
  const db = openDb(':memory:');
  clock = fixedClock('2026-08-14T09:00:00');
  tasks = createTaskStore(db, clock);
  settings = createSettingsStore(db);
  onAlarm = vi.fn();
  onDigest = vi.fn();
  tick = createReminderScheduler({ tasks, settings, clock, events: { onAlarm, onDigest } }).tick;
});

describe('žadintuvas', () => {
  it('suveikia atėjus laikui ir tik vieną kartą', () => {
    const t = tasks.create({ title: 'Skambutis', remind_at: '2026-08-14T09:30' });

    tick();
    expect(onAlarm).not.toHaveBeenCalled();

    clock.set('2026-08-14T09:30:00');
    tick();
    expect(onAlarm).toHaveBeenCalledWith(expect.objectContaining({ id: t.id }), 0);

    tick();
    expect(onAlarm).toHaveBeenCalledTimes(1);
  });

  it('po miego suveikia ir praneša vėlavimą', () => {
    tasks.create({ title: 'Skambutis', remind_at: '2026-08-14T09:30' });
    clock.set('2026-08-14T10:10:00');

    tick();

    expect(onAlarm).toHaveBeenCalledWith(expect.anything(), 40);
  });

  it('atliktai užduočiai neskamba', () => {
    const t = tasks.create({ title: 'X', remind_at: '2026-08-14T09:30' });
    tasks.update(t.id, { status: 'done' });
    clock.set('2026-08-14T09:30:00');

    tick();

    expect(onAlarm).not.toHaveBeenCalled();
  });

  it('atidėjus suskamba iš naujo', () => {
    const t = tasks.create({ title: 'X', remind_at: '2026-08-14T09:30' });
    clock.set('2026-08-14T09:30:00');
    tick();

    tasks.snooze(t.id, 10);
    clock.set('2026-08-14T09:40:00');
    tick();

    expect(onAlarm).toHaveBeenCalledTimes(2);
  });
});

describe('dienos apžvalga', () => {
  it('suveikia nustatytu laiku su šios dienos užduotimis', () => {
    tasks.create({ title: 'Bedatė' });
    tasks.create({ title: 'Rytojaus', due_at: '2026-08-15' });

    clock.set('2026-08-14T10:00:00');
    tick();

    expect(onDigest).toHaveBeenCalledTimes(1);
    expect(onDigest.mock.lastCall![0].map((t: { title: string }) => t.title)).toEqual(['Bedatė']);
  });

  it('to paties laiko antrą kartą nekartoja', () => {
    tasks.create({ title: 'A' });
    clock.set('2026-08-14T10:00:00');
    tick();
    clock.set('2026-08-14T10:00:30');
    tick();

    expect(onDigest).toHaveBeenCalledTimes(1);
  });

  it('praleidus abu laikus suveikia tik vėlesnis', () => {
    tasks.create({ title: 'A' });
    clock.set('2026-08-14T16:00:00');

    tick();

    expect(onDigest).toHaveBeenCalledTimes(1);
    expect(settings.getAll().last_digest).toBe('2026-08-14T15:30');
  });

  it('nesant ką rodyti langas nekviečiamas, bet laikas užfiksuojamas', () => {
    clock.set('2026-08-14T10:00:00');
    tick();

    expect(onDigest).not.toHaveBeenCalled();
    expect(settings.getAll().last_digest).toBe('2026-08-14T10:00');
  });

  it('kitą dieną suveikia iš naujo', () => {
    tasks.create({ title: 'A' });
    clock.set('2026-08-14T10:00:00');
    tick();
    clock.set('2026-08-15T10:00:00');
    tick();

    expect(onDigest).toHaveBeenCalledTimes(2);
  });

  it('antras tos dienos laikas suveikia, jei liko neatliktų', () => {
    tasks.create({ title: 'A' });
    clock.set('2026-08-14T10:00:00');
    tick();
    clock.set('2026-08-14T15:30:00');
    tick();

    expect(onDigest).toHaveBeenCalledTimes(2);
  });
});
