import { BrowserWindow, screen, type BrowserWindowConstructorOptions } from 'electron';
import type { Task } from '../core/types.js';
import { popupBounds, type Bounds } from './windowPosition.js';

const ALARM_SIZE = { width: 340, height: 200 };
const DIGEST_SIZE = { width: 380, height: 460 };
const AUTO_CLOSE_MS = 60_000;

export interface ReminderWindowDeps {
  soundFor(kind: 'alarm' | 'digest'): boolean;
  onAlarmClosed(): void;
  snooze(taskId: string, minutes: number): Promise<void>;
  /** Tray ikonos ribos — kad priminimai atsirastų tame pačiame ekrane kaip ji. */
  trayBounds(): Bounds | null;
}

// Siauras `BrowserWindow` pjūvis — tik tai, ką šis failas iš tikrųjų
// naudoja. Leidžia testuose paduoti netikrą langą, kad `reminderWindows.ts`
// (vienintelis failas, importuojantis `electron` tik dėl langų kūrimo) būtų
// testuojamas be paties Electron proceso.
export interface ReminderWindowHandle {
  webContents: { setWindowOpenHandler(handler: () => { action: 'deny' }): void };
  once(event: 'ready-to-show', listener: () => void): void;
  on(event: 'closed', listener: () => void): void;
  show(): void;
  close(): void;
  destroy(): void;
  isDestroyed(): boolean;
  focus(): void;
  loadURL(url: string): Promise<void>;
  setAlwaysOnTop(flag: boolean, level?: string): void;
}

export type ReminderWindowFactory = (options: BrowserWindowConstructorOptions) => ReminderWindowHandle;

// Realus `BrowserWindow` tenkina `ReminderWindowHandle` per visus jo narius,
// bet Electron tipai jį aprašo per `EventEmitter` perkrovas (overloads), kurių
// struktūrinė atitiktis TypeScript požiūriu nėra tiesmukiška. Konvertuojame
// per `unknown` — pačiam `BrowserWindow` tai nekeičia, tai tik siaurina jo
// tipą iki to, ką ši byla iš tikrųjų naudoja.
const defaultWindowFactory: ReminderWindowFactory = (options) =>
  new BrowserWindow(options) as unknown as ReminderWindowHandle;

export interface ReminderWindows {
  showAlarm(task: Task, lateMinutes: number): void;
  showDigest(): void;
  /**
   * Pastato `disposed` sargą NEATIDARANT langų. Kviečiama iš `before-quit`
   * (main.ts), t.y. PRIEŠ Electron pradedant uždarinėti langus tarp
   * `before-quit` ir `will-quit` — žr. komentarą prie `closed` tvarkyklės
   * žemiau, kodėl laikas čia lemiamas.
   */
  beginShutdown(): void;
  dispose(): void;
}

export function createReminderWindows(
  baseUrl: string,
  deps: ReminderWindowDeps,
  windowFactory: ReminderWindowFactory = defaultWindowFactory,
): ReminderWindows {
  let alarm: ReminderWindowHandle | null = null;
  let digest: ReminderWindowHandle | null = null;
  let disposed = false;

  // Ekranas parenkamas pagal tray ikoną, ne pagrindinis: kelių monitorių stale
  // priminimas kitaip iššoktų kitame ekrane nei visa kita programa.
  const cornerBounds = (size: { width: number; height: number }): Bounds => {
    const tray = deps.trayBounds();
    const display =
      tray === null
        ? screen.getPrimaryDisplay()
        : screen.getDisplayNearestPoint({ x: tray.x, y: tray.y });
    const { workArea } = display;
    const corner = {
      x: workArea.x + workArea.width,
      y: workArea.y + workArea.height,
      width: 0,
      height: 0,
    };
    return popupBounds(corner, workArea, size);
  };

  const buildWindow = (size: { width: number; height: number }): ReminderWindowHandle => {
    const win = windowFactory({
      ...cornerBounds(size),
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false, // be šito langas blyksteli baltai, kol puslapis nenupieštas
    });
    win.once('ready-to-show', () => win.show());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return win;
  };

  return {
    showAlarm(task: Task, lateMinutes: number) {
      alarm?.destroy();

      const sound = deps.soundFor('alarm') ? '1' : '0';
      const win = buildWindow(ALARM_SIZE);
      alarm = win;
      win.setAlwaysOnTop(true, 'screen-saver');
      void win.loadURL(
        `${baseUrl}/alarm/?id=${encodeURIComponent(task.id)}&late=${lateMinutes}&sound=${sound}`,
      );

      // Nepaliestas langas grįžta po 10 min — ta pati logika kaip mygtukas „Atidėti".
      // `win`, ne `alarm`: kol atidėjimo užklausa keliauja, naudotojas gali langą
      // uždaryti ir eilė atidaryti kitą — tada `alarm` rodytų jau į kitą langą ir
      // uždarytume svetimą žadintuvą, kurio niekas neatidėjo.
      const timer = setTimeout(() => {
        void deps
          .snooze(task.id, 10)
          .catch(() => {
            // Serveris nepasiekiamas — nutildome. Be `catch` tai būtų neapdorotas
            // atmestas pažadas, o Node 22 tokiu atveju nukerta procesą.
          })
          .finally(() => {
            if (!win.isDestroyed()) win.close();
          });
      }, AUTO_CLOSE_MS);

      win.on('closed', () => {
        clearTimeout(timer);
        if (alarm === win) alarm = null;
        // Išjungiant programą, `disposed` pastatomas `beginShutdown()`
        // kvietimu iš `before-quit` (main.ts) — PRIEŠ Electron pradedant
        // uždarinėti langus tarp `before-quit` ir `will-quit`. Be šio sargo
        // (arba jei jis būtų statomas per vėlai, pvz. tik `dispose()` viduje
        // `will-quit` metu) eilė šiuo tarpu atidarytų dar vieną langą, kurio
        // niekas nebesunaikintų.
        if (!disposed) deps.onAlarmClosed();
      });
    },

    showDigest() {
      if (digest !== null && !digest.isDestroyed()) {
        digest.focus();
        return;
      }
      const win = buildWindow(DIGEST_SIZE);
      digest = win;
      void win.loadURL(`${baseUrl}/digest/`);
      win.on('closed', () => {
        if (digest === win) digest = null;
      });
    },

    beginShutdown() {
      disposed = true;
    },

    dispose() {
      // `disposed = true` pakartojama (ne tik pasikliaujama `beginShutdown()`),
      // kad tiesioginis `dispose()` kvietimas (pvz. testuose, arba jei kada
      // nors iškviečiamas be `beginShutdown()` prieš tai) liktų saugus pats
      // savaime.
      disposed = true;
      alarm?.destroy();
      digest?.destroy();
    },
  };
}
