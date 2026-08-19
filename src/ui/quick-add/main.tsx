import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../theme.css';
import { QuickAddScreen } from './QuickAddScreen.js';

// `window.close()` renderer'iuje sunaikina WebContents be atšaukiamo
// BrowserWindow `close` įvykio (Electron dokumentuoja šį elgesį pačiam
// `webContents.close()`), tad langas kaskart perkraunamas iš naujo vietoj to,
// kad tik pasislėptų. `preload.cjs` per IPC praneša pagrindiniam procesui,
// kuris langą tik paslepia (žr. windows.ts). Grįžtama prie `window.close()`
// tik tada, kai bridge'o nėra — pvz., puslapis atidarytas paprastoje
// naršyklėje per `npm run dev:ui`.
const close = (): void => {
  if (window.sarka) {
    window.sarka.hidePopup();
  } else {
    window.close();
  }
};

// Analogiškai — `window.open` Electron'e sukurtų nevaldomą langą, kurio
// `windows.ts` singleton'as nežino ir kurio `dispose()` neliečia. Bridge'as
// nukreipia atidarymą per `windows.openBoard()`.
const openBoard = (): void => {
  if (window.sarka) {
    window.sarka.openBoard();
  } else {
    window.open('/', '_blank');
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QuickAddScreen now={new Date()} onOpenBoard={openBoard} onClose={close} />
  </StrictMode>,
);
