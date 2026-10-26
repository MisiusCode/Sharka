import { Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import { t, type Locale } from '../core/i18n.js';

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
  locale: Locale,
  handlers: TrayHandlers,
): Tray {
  const icon = nativeImage.createFromPath(join(appPath, 'dist/desktop/assets/icon.png'));
  const tray = new Tray(icon.resize({ width: 16, height: 16 }));

  tray.setToolTip(t(locale, 'app.name'));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t(locale, 'tray.newTask'), click: handlers.onQuickAdd },
      { label: t(locale, 'tray.openBoard'), click: handlers.onOpenBoard },
      {
        label: t(locale, 'tray.sound'),
        submenu: (
          [
            ['always', 'settings.soundAlways'],
            ['alarms', 'settings.soundAlarms'],
            ['off', 'settings.soundOff'],
          ] as const
        ).map(([value, key]) => ({
          label: t(locale, key),
          type: 'radio' as const,
          checked: sound === value,
          click: () => handlers.onSoundChange(value),
        })),
      },
      { label: t(locale, 'settings.title'), click: handlers.onSettings },
      { type: 'separator' },
      { label: t(locale, 'tray.quit'), click: handlers.onQuit },
    ]),
  );
  tray.on('click', handlers.onQuickAdd);

  return tray;
}
