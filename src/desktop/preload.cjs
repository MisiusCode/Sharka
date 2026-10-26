// Preload skriptas — vienintelis leidžiamas CommonJS failas šiame projekte,
// nes Electron preload procesai visada kraunami kaip CJS, nepaisant `"type":
// "module"` reikšmės package.json. Rankiniu būdu rašytas ir kopijuojamas per
// build žingsnį (žr. package.json `build` skriptą), o ne kompiliuojamas iš
// TypeScript — jam nereikia nieko daugiau nei šis siauras tiltas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sarka', {
  hidePopup: () => ipcRenderer.send('popup:hide'),
  openBoard: () => ipcRenderer.send('board:open'),
  pickBackupDir: () => ipcRenderer.invoke('backup:pick'),
});
