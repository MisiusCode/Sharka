import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../src/core/types.js';
import {
  createReminderWindows,
  type ReminderWindowFactory,
  type ReminderWindowHandle,
} from '../../src/desktop/reminderWindows.js';

// `reminderWindows.ts` importuoja `electron` tik dėl `BrowserWindow`
// (pakeičiama per `windowFactory` parametrą žemiau) ir `screen`
// (naudojama `cornerBounds` viduje, kurios `windowFactory` neaplenkia —
// ji vis tiek iškviečiama PRIEŠ atiduodant parinktis fabrikui). Be šio
// netikro modulio testas žlugtų realiame Node paleidime, nes ne-Electron
// aplinkoje `electron` paketas `screen` grąžina `undefined`.
vi.mock('electron', () => ({
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  BrowserWindow: class {},
}));

const task = (id: string): Task => ({
  id, title: id, status: 'todo', priority: 2,
  due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
  created_at: '', updated_at: '', completed_at: null, repeat: null,
});

interface FakeWindow extends ReminderWindowHandle {
  emit(event: 'closed'): void;
}

function fakeWindow(): FakeWindow {
  const closedListeners: (() => void)[] = [];
  let destroyed = false;
  const win: FakeWindow = {
    webContents: { setWindowOpenHandler: () => {} },
    once: (event, listener) => {
      if (event === 'ready-to-show') listener();
    },
    on: (event, listener) => {
      if (event === 'closed') closedListeners.push(listener);
    },
    show: () => {},
    close: () => {
      if (destroyed) return;
      destroyed = true;
      closedListeners.forEach((l) => l());
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      closedListeners.forEach((l) => l());
    },
    isDestroyed: () => destroyed,
    focus: () => {},
    loadURL: async () => {},
    setAlwaysOnTop: () => {},
    emit: (event) => {
      if (event === 'closed') closedListeners.forEach((l) => l());
    },
  };
  return win;
}

function fakeFactory(): { factory: ReminderWindowFactory; windows: FakeWindow[] } {
  const windows: FakeWindow[] = [];
  const factory: ReminderWindowFactory = () => {
    const win = fakeWindow();
    windows.push(win);
    return win;
  };
  return { factory, windows };
}

function baseDeps(overrides: Partial<Parameters<typeof createReminderWindows>[1]> = {}) {
  return {
    soundFor: () => false,
    onAlarmClosed: vi.fn(),
    snooze: vi.fn(async () => {}),
    trayBounds: () => null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createReminderWindows — išjungimo tvarka', () => {
  it('prieš beginShutdown(): lango uždarymas iškviečia onAlarmClosed', () => {
    const { factory, windows } = fakeFactory();
    const onAlarmClosed = vi.fn();
    const rw = createReminderWindows('http://localhost', baseDeps({ onAlarmClosed }), factory);

    rw.showAlarm(task('a'), 0);
    expect(windows).toHaveLength(1);
    windows[0].destroy();

    expect(onAlarmClosed).toHaveBeenCalledTimes(1);
  });

  it('po beginShutdown(): lango uždarymas NEBEIŠKVIEČIA onAlarmClosed', () => {
    const { factory, windows } = fakeFactory();
    const onAlarmClosed = vi.fn();
    const rw = createReminderWindows('http://localhost', baseDeps({ onAlarmClosed }), factory);

    rw.showAlarm(task('a'), 0);
    expect(windows).toHaveLength(1);

    rw.beginShutdown();
    windows[0].destroy();

    expect(onAlarmClosed).not.toHaveBeenCalled();
  });

  it('dispose() sunaikina ir žadintuvo, ir apžvalgos langus', () => {
    const { factory, windows } = fakeFactory();
    const rw = createReminderWindows('http://localhost', baseDeps(), factory);

    rw.showAlarm(task('a'), 0);
    rw.showDigest();
    expect(windows).toHaveLength(2);
    expect(windows.every((w) => w.isDestroyed())).toBe(false);

    rw.dispose();

    expect(windows.every((w) => w.isDestroyed())).toBe(true);
  });

  it('dispose() po beginShutdown() nekviečia onAlarmClosed uždarant likusius langus', () => {
    const { factory, windows } = fakeFactory();
    const onAlarmClosed = vi.fn();
    const rw = createReminderWindows('http://localhost', baseDeps({ onAlarmClosed }), factory);

    rw.showAlarm(task('a'), 0);
    rw.beginShutdown();
    rw.dispose();

    expect(windows[0].isDestroyed()).toBe(true);
    expect(onAlarmClosed).not.toHaveBeenCalled();
  });
});
