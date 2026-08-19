import { app, BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { popupBounds, type Bounds } from './windowPosition.js';

const POPUP_SIZE = { width: 380, height: 480 };

// Trumpas langas po `blur`-sukeltos slėpimo, per kurį `togglePopup` kvietimas
// ignoruojamas — žr. komentarą prie `lastBlurHideAt` žemiau.
const BLUR_HIDE_GRACE_MS = 250;

// Preload skriptas guli šalia šio failo tiek `src/desktop/` (vykdant per
// `tsx`), tiek `dist/desktop/` (sukompiliuotas) kataloguose — build žingsnis
// jį tiesiog nukopijuoja, nekompiliuodamas (žr. package.json). Skaičiuojame
// kelią nuo šio modulio URL, o ne nuo `app.getAppPath()`, kad veiktų
// nepriklausomai nuo to, iš kur procesas paleistas.
const PRELOAD_PATH = fileURLToPath(new URL('./preload.cjs', import.meta.url));

export interface Windows {
  togglePopup(trayBounds: Bounds): void;
  showPopup(trayBounds: Bounds): void;
  hidePopup(): void;
  openBoard(): void;
  openSettings(urls: string[]): void;
  dispose(): void;
}

export function createWindows(baseUrl: string): Windows {
  let popup: BrowserWindow | null = null;
  let board: BrowserWindow | null = null;
  let settings: BrowserWindow | null = null;
  let isQuitting = false;
  // Tray ikonos paspaudimas, kai langelis jau atidarytas, iš pradžių atima
  // fokusą (langelis gauna `blur` ir pasislepia), o tik TADA įvykdomas pačio
  // paspaudimo `click` tvarkyklė (`togglePopup`) — ji tuo metu jau mato
  // `isVisible() === false` ir atidarytų langelį iš naujo vietoj to, kad jis
  // liktų uždarytas. Įsimenam `blur`-sukeltos slėpties laiką ir per artimiausią
  // trumpą langą ignoruojame bandymą vėl atidaryti.
  let lastBlurHideAt = 0;

  // Renderer'io `window.close()` sunaikina WebContents be atšaukiamo
  // BrowserWindow `close` įvykio (Electron dokumentuoja šį elgesį pačiam
  // `webContents.close()`), tad langelis realiai užsidaro per preload bridge'ą
  // (žr. preload.cjs → main.ts → `hidePopup()`), o ne per šį listenerį.
  // Listeneris čia lieka kaip apsauginis tinklas keliams, kuriais `close`
  // vis tiek gali įvykti (pvz., Alt+F4), kad langelis ir tada tik pasislėptų,
  // o ne būtų sunaikintas. `isQuitting` būtinas: be jo `preventDefault()`
  // atšauktų bet kokį realų `app.quit()`, kuris eina per langų uždarymą, ir
  // programos nebūtų įmanoma išjungti iš jos pačios meniu.
  app.on('before-quit', () => { isQuitting = true; });

  const buildPopup = (): BrowserWindow => {
    const win = new BrowserWindow({
      ...POPUP_SIZE,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: { preload: PRELOAD_PATH },
    });
    void win.loadURL(`${baseUrl}/quick-add/`);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('blur', () => {
      win.hide();
      lastBlurHideAt = Date.now();
    });
    win.on('close', (event) => {
      if (isQuitting) return;
      event.preventDefault();
      win.hide();
    });
    win.on('closed', () => { popup = null; });
    return win;
  };

  const showPopup = (trayBounds: Bounds): void => {
    popup ??= buildPopup();
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    popup.setBounds(popupBounds(trayBounds, display.workArea, POPUP_SIZE));
    popup.show();
    popup.focus();
  };

  return {
    togglePopup(trayBounds) {
      popup ??= buildPopup();
      if (popup.isVisible()) {
        popup.hide();
        return;
      }
      if (Date.now() - lastBlurHideAt < BLUR_HIDE_GRACE_MS) return;
      showPopup(trayBounds);
    },

    // Naudojama `second-instance` tvarkyklėje (main.ts) — relaunch turi
    // ATIDARYTI langelį, o ne jį perjungti: jei jis jau matomas, `toggle`
    // elgesys būtų jį uždaręs, kas vartotojui atrodytų kaip niekas neįvyko.
    showPopup,

    hidePopup() {
      popup?.hide();
    },

    openBoard() {
      if (board !== null && !board.isDestroyed()) {
        board.show();
        board.focus();
        return;
      }
      board = new BrowserWindow({ width: 1200, height: 800, title: 'Šarka' });
      void board.loadURL(`${baseUrl}/`);
      board.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      board.on('closed', () => { board = null; });
    },

    openSettings(urls) {
      if (settings !== null && !settings.isDestroyed()) {
        settings.focus();
        return;
      }
      const win = new BrowserWindow({
        width: 520,
        height: 620,
        title: 'Nustatymai',
        show: false, // be šito langas blyksteli baltai, kol puslapis nenupieštas
        webPreferences: { preload: PRELOAD_PATH },
      });
      settings = win;
      win.once('ready-to-show', () => win.show());
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const query = encodeURIComponent(JSON.stringify(urls));
      void win.loadURL(`${baseUrl}/settings/?lan=${query}`);
      win.on('closed', () => { if (settings === win) settings = null; });
    },

    dispose() {
      popup?.destroy();
      board?.destroy();
      settings?.destroy();
    },
  };
}
