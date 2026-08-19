import { Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';

export interface TrayHandlers {
  onQuickAdd(): void;
  onOpenBoard(): void;
  onSoundChange(value: 'always' | 'alarms' | 'off'): void;
  onSettings(): void;
  onQuit(): void;
}

export function createTray(
  appPath: string,
  sound: 'always' | 'alarms' | 'off',
  handlers: TrayHandlers,
): Tray {
  const icon = nativeImage.createFromPath(join(appPath, 'dist/desktop/assets/icon.png'));
  const tray = new Tray(icon.resize({ width: 16, height: 16 }));

  tray.setToolTip('Šarka');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Nauja užduotis', click: handlers.onQuickAdd },
      { label: 'Atidaryti lentą', click: handlers.onOpenBoard },
      {
        label: 'Garsas',
        submenu: (
          [
            ['always', 'Visada'],
            ['alarms', 'Tik žadintuvams'],
            ['off', 'Išjungta'],
          ] as const
        ).map(([value, label]) => ({
          label,
          type: 'radio' as const,
          checked: sound === value,
          click: () => handlers.onSoundChange(value),
        })),
      },
      { label: 'Nustatymai', click: handlers.onSettings },
      { type: 'separator' },
      { label: 'Išjungti', click: handlers.onQuit },
    ]),
  );
  tray.on('click', handlers.onQuickAdd);

  return tray;
}
