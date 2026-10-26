import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTray, type TrayHandlers } from '../../src/desktop/tray.js';

// `tray.ts` importuoja `electron` tik dėl `Menu`, `Tray` ir `nativeImage` —
// realiame Electron procese jie egzistuoja, bet ne-Electron Node aplinkoje
// (kurioje sukasi Vitest) `electron` paketas šių eksportų neturi. Be šio
// netikro modulio bet koks `import { Tray } from 'electron'` mestų klaidą dar
// prieš pasiekiant patį testą. `vi.mock` kėlimas (hoisting) vyksta virš
// importų, tad naudojamus kintamuosius reikia deklaruoti per `vi.hoisted`.
const { buildFromTemplate, setToolTip, setContextMenu, on } = vi.hoisted(() => ({
  // Parametras liktas netipizuotas (`any[]`) sąmoningai: testai skaito
  // `mock.calls[0][0]` kaip meniu šablonų masyvą su laisva `label`/`submenu`
  // forma, o griežtas `Menu.buildFromTemplate` tipas čia nereikalingas.
  buildFromTemplate: vi.fn((_template: any[]) => ({})),
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  Menu: { buildFromTemplate },
  // Klasė, ne `vi.fn()` grąžinanti objektą — `tray.ts` kviečia `new Tray(...)`,
  // o strėlinė funkcija su `new` nesuderinama.
  Tray: class {
    setToolTip = setToolTip;
    setContextMenu = setContextMenu;
    on = on;
    getBounds = () => ({ x: 0, y: 0, width: 0, height: 0 });
  },
  nativeImage: {
    createFromPath: () => ({
      resize: () => ({}),
    }),
  },
}));

function fakeHandlers(): TrayHandlers {
  return {
    onQuickAdd: vi.fn(),
    onOpenBoard: vi.fn(),
    onSoundChange: vi.fn(),
    onSettings: vi.fn(),
    onQuit: vi.fn(),
  };
}

beforeEach(() => {
  buildFromTemplate.mockClear();
  setToolTip.mockClear();
});

describe('createTray — kalba', () => {
  it('angliškai meniu eilutės išverstos', () => {
    createTray('/app', 'alarms', 'en', fakeHandlers());

    const labels = buildFromTemplate.mock.calls[0][0].map((i: { label?: string }) => i.label);
    expect(labels).toContain('New task');
    expect(labels).toContain('Open board');
    expect(labels).toContain('Settings');
    expect(labels).toContain('Quit');
  });

  it('lietuviškai lieka kaip buvo', () => {
    createTray('/app', 'alarms', 'lt', fakeHandlers());

    const labels = buildFromTemplate.mock.calls[0][0].map((i: { label?: string }) => i.label);
    expect(labels).toContain('Nauja užduotis');
    expect(labels).toContain('Atidaryti lentą');
  });

  it('patarimas rodo programos vardą pagal kalbą', () => {
    createTray('/app', 'alarms', 'en', fakeHandlers());
    expect(setToolTip).toHaveBeenLastCalledWith('Sharka');

    createTray('/app', 'alarms', 'lt', fakeHandlers());
    expect(setToolTip).toHaveBeenLastCalledWith('Šarka');
  });

  it('garso submeniu ima tuos pačius raktus, kaip nustatymų ekranas', () => {
    createTray('/app', 'alarms', 'en', fakeHandlers());

    const garsas = buildFromTemplate.mock.calls[0][0]
      .find((i: { label?: string }) => i.label === 'Sound');
    expect(garsas.submenu.map((i: { label: string }) => i.label))
      .toEqual(['Always', 'Alarms only', 'Off']);
  });
});
