// Tipas bridge'ui, kurį `src/desktop/preload.cjs` skelbia per
// `contextBridge.exposeInMainWorld`. Neprivalomas (`?`), nes tas pats
// puslapis atidaromas ir paprastoje naršyklėje (pvz., `npm run dev:ui`) — ten
// preload skriptas nekraunamas ir `window.sarka` lieka `undefined`.
export {};

declare global {
  interface Window {
    sarka?: {
      hidePopup(): void;
      openBoard(): void;
      pickBackupDir?: () => Promise<string | null>;
    };
  }
}
