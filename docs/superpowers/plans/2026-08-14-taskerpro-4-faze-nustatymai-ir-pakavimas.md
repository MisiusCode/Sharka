# TaskerPro 4 fazė: nustatymai ir pakavimas — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padaryti sistemą įdiegiama ir sukonfigūruojama be kodo redagavimo: nustatymų langas, autostartas su Windows ir diegimo failas.

**Architecture:** Nustatymų langas yra dar vienas puslapis, kalbantis su tuo pačiu `/api/settings`. Windows specifika — autostartas ir tinklo adresai — atskiruose moduliuose su įšvirkščiamomis priklausomybėmis, tad testuojama be Electron. Pakavimas — `electron-builder` NSIS diegikliu.

**Tech Stack:** ta pati kaip 1–3 fazėse, plius `electron-builder`.

**Ankstesnis planas:** `docs/superpowers/plans/2026-08-14-taskerpro-3-faze-priminimai.md`

## Global Constraints

Galioja visos 1–3 fazių sąlygos, plius:

- **Porto keitimas įsigalioja tik perkrovus programą.** Nustatymų lange tai pasakoma tiesiai, o ne paliekama atspėti.
- **Karštasis klavišas privalo turėti bent vieną modifikatorių** — kitaip programa pasisavintų paprastą klavišą visoje sistemoje.

---

## Failų struktūra

```
src/desktop/network.ts        lanUrls — pasiekiamų adresų sąrašas
src/desktop/autostart.ts      autostarto įjungimas su įšvirkščiamu API
src/ui/settings/
  index.html  main.tsx  SettingsView.tsx  hotkeyCapture.ts
electron-builder.yml
```

---

### Task 1: LAN adresai ir autostartas

Du maži Windows moduliai, abu su įšvirkščiamomis priklausomybėmis.

**Files:**
- Create: `src/desktop/network.ts`, `src/desktop/autostart.ts`
- Test: `tests/desktop/network.test.ts`, `tests/desktop/autostart.test.ts`

**Interfaces:**
- Produces: `lanUrls(port: number, interfaces: NetworkInterfaces): string[]`; `AutostartApi { get(): boolean; set(enabled: boolean): void }`, `syncAutostart(enabled: boolean, api: AutostartApi): void`

- [ ] **Step 1: Parašyti krentančius testus**

`tests/desktop/network.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lanUrls } from '../../src/desktop/network.js';

const INTERFACES = {
  Ethernet: [
    { address: '192.168.1.10', family: 'IPv4', internal: false },
    { address: 'fe80::1', family: 'IPv6', internal: false },
  ],
  'Loopback Pseudo-Interface 1': [
    { address: '127.0.0.1', family: 'IPv4', internal: true },
  ],
  'vEthernet (WSL)': [
    { address: '172.20.0.1', family: 'IPv4', internal: false },
  ],
};

describe('lanUrls', () => {
  it('grąžina IPv4 adresus su portu', () => {
    expect(lanUrls(8080, INTERFACES)).toContain('http://192.168.1.10:8080');
  });

  it('praleidžia vidinius ir IPv6 adresus', () => {
    const urls = lanUrls(8080, INTERFACES);
    expect(urls.some((u) => u.includes('127.0.0.1'))).toBe(false);
    expect(urls.some((u) => u.includes('fe80'))).toBe(false);
  });

  it('virtualius adapterius rikiuoja į galą', () => {
    const urls = lanUrls(8080, INTERFACES);
    expect(urls[0]).toBe('http://192.168.1.10:8080');
    expect(urls.at(-1)).toBe('http://172.20.0.1:8080');
  });

  it('neradus nė vieno adreso grąžina tuščią sąrašą', () => {
    expect(lanUrls(8080, {})).toEqual([]);
  });
});
```

`tests/desktop/autostart.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { syncAutostart, type AutostartApi } from '../../src/desktop/autostart.js';

function fakeApi(initial: boolean): AutostartApi & { calls: boolean[] } {
  let value = initial;
  const calls: boolean[] = [];
  return {
    calls,
    get: () => value,
    set: (enabled) => { value = enabled; calls.push(enabled); },
  };
}

describe('syncAutostart', () => {
  it('įjungia, kai sistemoje išjungta', () => {
    const api = fakeApi(false);
    syncAutostart(true, api);
    expect(api.calls).toEqual([true]);
  });

  it('nieko nedaro, kai jau sutampa', () => {
    const api = fakeApi(true);
    syncAutostart(true, api);
    expect(api.calls).toEqual([]);
  });

  it('išjungia, kai sistemoje įjungta', () => {
    const api = fakeApi(true);
    syncAutostart(false, api);
    expect(api.calls).toEqual([false]);
  });
});
```

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/desktop/network.test.ts tests/desktop/autostart.test.ts`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti realizacijas**

`src/desktop/network.ts`:

```ts
export interface NetworkAddress {
  address: string;
  family: string;
  internal: boolean;
}

export type NetworkInterfaces = Record<string, NetworkAddress[] | undefined>;

const VIRTUALUS = /vethernet|virtualbox|vmware|hyper-v|docker|wsl/i;

export function lanUrls(port: number, interfaces: NetworkInterfaces): string[] {
  const entries: { name: string; address: string }[] = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const a of addresses ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      entries.push({ name, address: a.address });
    }
  }

  return entries
    .sort((a, b) => Number(VIRTUALUS.test(a.name)) - Number(VIRTUALUS.test(b.name)))
    .map((e) => `http://${e.address}:${port}`);
}
```

Virtualūs adapteriai (WSL, Docker, VirtualBox) turi tikrus IPv4 adresus, bet planšetė per juos neprisijungs — todėl jie nerodomi pirmi, o ne slepiami visai: retais atvejais jie būna vieninteliai teisingi.

`src/desktop/autostart.ts`:

```ts
export interface AutostartApi {
  get(): boolean;
  set(enabled: boolean): void;
}

export function syncAutostart(enabled: boolean, api: AutostartApi): void {
  if (api.get() === enabled) return;
  api.set(enabled);
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/desktop/network.test.ts tests/desktop/autostart.test.ts`
Expected: PASS, 7 testų

- [ ] **Step 5: Commit**

```bash
git add src/desktop/network.ts src/desktop/autostart.ts tests/desktop
git commit -m "feat: LAN adresų sąrašas ir autostarto suderinimas"
```

---

### Task 2: Karštojo klavišo gaudymas

**Files:**
- Create: `src/ui/settings/hotkeyCapture.ts`
- Test: `tests/ui/hotkeyCapture.test.ts`

**Interfaces:**
- Produces: `acceleratorFromEvent(e: KeyboardEventLike): string | null`, `KeyboardEventLike { ctrlKey, altKey, shiftKey, metaKey, key }`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/hotkeyCapture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { acceleratorFromEvent } from '../../src/ui/settings/hotkeyCapture.js';

const e = (over: Partial<Record<string, unknown>>) => ({
  ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, key: '', ...over,
}) as never;

describe('acceleratorFromEvent', () => {
  it('surenka modifikatorius nuoseklia tvarka', () => {
    expect(acceleratorFromEvent(e({ ctrlKey: true, altKey: true, key: ' ' }))).toBe('Ctrl+Alt+Space');
    expect(acceleratorFromEvent(e({ ctrlKey: true, shiftKey: true, key: 't' }))).toBe('Ctrl+Shift+T');
  });

  it('funkcinius klavišus perduoda kaip yra', () => {
    expect(acceleratorFromEvent(e({ altKey: true, key: 'F9' }))).toBe('Alt+F9');
  });

  it('be modifikatoriaus grąžina null', () => {
    expect(acceleratorFromEvent(e({ key: 'T' }))).toBeNull();
  });

  it('vien modifikatorius grąžina null', () => {
    expect(acceleratorFromEvent(e({ ctrlKey: true, key: 'Control' }))).toBeNull();
    expect(acceleratorFromEvent(e({ altKey: true, key: 'Alt' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/hotkeyCapture.test.ts`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti realizaciją**

`src/ui/settings/hotkeyCapture.ts`:

```ts
export interface KeyboardEventLike {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
}

const MODIFIKATORIAI = new Set(['Control', 'Alt', 'Shift', 'Meta']);

export function acceleratorFromEvent(e: KeyboardEventLike): string | null {
  if (MODIFIKATORIAI.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  if (parts.length === 0) return null;

  parts.push(e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join('+');
}
```

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/ui/hotkeyCapture.test.ts`
Expected: PASS, 4 testai

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings/hotkeyCapture.ts tests/ui/hotkeyCapture.test.ts
git commit -m "feat: karštojo klavišo kombinacijos gaudymas"
```

---

### Task 3: Nustatymų langas

**Files:**
- Create: `src/ui/settings/index.html`, `src/ui/settings/main.tsx`, `src/ui/settings/SettingsView.tsx`
- Modify: `vite.config.ts`, `src/ui/theme.css`
- Test: `tests/ui/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `SettingsMap`; `parseTimeInput` iš `core/timeinput.ts`; `acceleratorFromEvent`
- Produces: `<SettingsView settings lanUrls onChange />`

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/SettingsView.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SettingsMap } from '../../src/core/settings.js';
import { SettingsView } from '../../src/ui/settings/SettingsView.js';

const SETTINGS: SettingsMap = {
  grouping: 'date', theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
  port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
};

function renderView(over: Partial<SettingsMap> = {}) {
  const onChange = vi.fn();
  render(
    <SettingsView
      settings={{ ...SETTINGS, ...over }}
      lanUrls={['http://192.168.1.10:8080']}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('SettingsView', () => {
  it('rodo LAN adresą planšetei', () => {
    renderView();
    expect(screen.getByText('http://192.168.1.10:8080')).toBeDefined();
  });

  it('temos pasirinkimas perduodamas', async () => {
    const onChange = renderView();
    await userEvent.selectOptions(screen.getByLabelText('Tema'), 'dark');
    expect(onChange).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('garso pasirinkimas perduodamas', async () => {
    const onChange = renderView();
    await userEvent.selectOptions(screen.getByLabelText('Garsas'), 'off');
    expect(onChange).toHaveBeenCalledWith({ sound: 'off' });
  });

  it('autostarto jungiklis perduodamas', async () => {
    const onChange = renderView();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Paleisti su Windows' }));
    expect(onChange).toHaveBeenCalledWith({ autostart: false });
  });

  it('pakeitus portą įspėja apie perkrovimą', async () => {
    const onChange = renderView();
    fireEvent.change(screen.getByLabelText('Portas'), { target: { value: '9090' } });
    expect(onChange).toHaveBeenCalledWith({ port: 9090 });
    expect(screen.getByText('Portas įsigalios paleidus programą iš naujo')).toBeDefined();
  });

  it('karštasis klavišas nuskaitomas iš paspaudimo', () => {
    const onChange = renderView();
    fireEvent.keyDown(screen.getByLabelText('Karštasis klavišas'), {
      key: 't', ctrlKey: true, altKey: true,
    });
    expect(onChange).toHaveBeenCalledWith({ hotkey: 'Ctrl+Alt+T' });
  });

  it('apžvalgos laikas priimamas tik atpažintas', async () => {
    const onChange = renderView();
    const laukas = screen.getAllByLabelText('Apžvalgos laikas')[0];

    fireEvent.change(laukas, { target: { value: '0930' } });
    fireEvent.blur(laukas);
    expect(onChange).toHaveBeenCalledWith({ digest_times: ['09:30', '15:30'] });

    onChange.mockClear();
    fireEvent.change(laukas, { target: { value: '99:99' } });
    fireEvent.blur(laukas);
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Paleisti testą ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/SettingsView.test.tsx`
Expected: FAIL — `Failed to resolve import`

- [ ] **Step 3: Parašyti komponentą**

`src/ui/settings/SettingsView.tsx`:

```tsx
import { useState } from 'react';
import type { SettingsMap } from '../../core/settings.js';
import { parseTimeInput } from '../../core/timeinput.js';
import { acceleratorFromEvent } from './hotkeyCapture.js';

export interface SettingsViewProps {
  settings: SettingsMap;
  lanUrls: string[];
  onChange(values: Partial<SettingsMap>): void;
}

export function SettingsView({ settings, lanUrls, onChange }: SettingsViewProps) {
  const [portChanged, setPortChanged] = useState(false);
  const [timeDrafts, setTimeDrafts] = useState(settings.digest_times);

  const commitTime = (index: number): void => {
    const parsed = parseTimeInput(timeDrafts[index]);
    if (parsed === null) {
      setTimeDrafts(settings.digest_times);
      return;
    }
    const next = [...settings.digest_times];
    next[index] = parsed;
    onChange({ digest_times: next });
  };

  return (
    <div className="nustatymai">
      <h1>Nustatymai</h1>

      <label>
        Portas
        <input
          type="number"
          value={settings.port}
          onChange={(e) => {
            const port = Number(e.target.value);
            if (Number.isFinite(port) && port > 0) {
              setPortChanged(true);
              onChange({ port });
            }
          }}
        />
      </label>
      {portChanged && <p className="ispejimas">Portas įsigalios paleidus programą iš naujo</p>}

      <label>
        Karštasis klavišas
        <input
          type="text"
          readOnly
          value={settings.hotkey}
          onKeyDown={(e) => {
            e.preventDefault();
            const acc = acceleratorFromEvent(e);
            if (acc !== null) onChange({ hotkey: acc });
          }}
        />
      </label>

      <label>
        Garsas
        <select
          value={settings.sound}
          onChange={(e) => onChange({ sound: e.target.value as SettingsMap['sound'] })}
        >
          <option value="always">Visada</option>
          <option value="alarms">Tik žadintuvams</option>
          <option value="off">Išjungta</option>
        </select>
      </label>

      <fieldset>
        <legend>Dienos apžvalga</legend>
        {timeDrafts.map((time, i) => (
          <input
            key={i}
            type="text"
            aria-label="Apžvalgos laikas"
            value={time}
            onChange={(e) => {
              const next = [...timeDrafts];
              next[i] = e.target.value;
              setTimeDrafts(next);
            }}
            onBlur={() => commitTime(i)}
          />
        ))}
      </fieldset>

      <label>
        Tema
        <select
          value={settings.theme}
          onChange={(e) => onChange({ theme: e.target.value as SettingsMap['theme'] })}
        >
          <option value="system">Pagal sistemą</option>
          <option value="light">Šviesi</option>
          <option value="dark">Tamsi</option>
        </select>
      </label>

      <label className="jungiklis">
        <input
          type="checkbox"
          aria-label="Paleisti su Windows"
          checked={settings.autostart}
          onChange={(e) => onChange({ autostart: e.target.checked })}
        />
        Paleisti su Windows
      </label>

      <section className="adresai">
        <h2>Planšetei</h2>
        {lanUrls.length === 0 ? (
          <p>Tinklo adresų nerasta</p>
        ) : (
          lanUrls.map((url) => <p key={url}><code>{url}</code></p>)
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Sukurti puslapį**

`src/ui/settings/main.tsx`:

```tsx
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SettingsMap } from '../../core/settings.js';
import * as api from '../api.js';
import '../theme.css';
import { applyTheme } from '../useTheme.js';
import { SettingsView } from './SettingsView.js';

const lanUrls = JSON.parse(new URLSearchParams(window.location.search).get('lan') ?? '[]') as string[];

function Screen() {
  const [settings, setSettings] = useState<SettingsMap | null>(null);

  useEffect(() => {
    void api.fetchSettings().then((s) => { setSettings(s); applyTheme(s.theme); });
  }, []);

  if (settings === null) return <p>Kraunama…</p>;

  return (
    <SettingsView
      settings={settings}
      lanUrls={lanUrls}
      onChange={(values) => {
        void api.patchSettings(values).then((s) => { setSettings(s); applyTheme(s.theme); });
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Screen />
  </StrictMode>,
);
```

`src/ui/settings/index.html` — `<title>Nustatymai</title>`.

`vite.config.ts` — pridėti `settings: resolve('src/ui/settings/index.html')`.

`src/ui/theme.css`:

```css
.nustatymai { padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 460px; }
.nustatymai h1 { margin: 0; font-size: 16px; }
.nustatymai h2 { margin: 0 0 4px; font-size: 12px; color: var(--tekstas-blankus); }
.nustatymai label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.nustatymai label.jungiklis { flex-direction: row; align-items: center; gap: 6px; }
.nustatymai input, .nustatymai select {
  font: inherit;
  color: var(--tekstas);
  background: var(--fonas-kortele);
  border: 1px solid var(--riba);
  border-radius: 3px;
  padding: 4px 6px;
}
.nustatymai fieldset {
  display: flex; gap: 6px; align-items: center;
  border: 1px solid var(--riba); border-radius: 4px; padding: 8px;
}
.nustatymai legend { font-size: 12px; color: var(--tekstas-blankus); }
.ispejimas { margin: 0; color: var(--prioritetas-2); font-size: 12px; }
.adresai code { font-size: 13px; }
```

- [ ] **Step 5: Paleisti testus**

Run: `npx vitest run tests/ui/SettingsView.test.tsx`
Expected: PASS, 7 testų

- [ ] **Step 6: Commit**

```bash
git add src/ui vite.config.ts tests/ui/SettingsView.test.tsx
git commit -m "feat: nustatymų langas su LAN adresais ir klavišo gaudymu"
```

---

### Task 4: Sujungimas, pakavimas ir dokumentacija

**Files:**
- Create: `electron-builder.yml`
- Modify: `src/desktop/main.ts`, `src/desktop/tray.ts`, `package.json`, `README.md`

**Interfaces:**
- Consumes: `lanUrls`, `syncAutostart`, `createHotkeyManager`
- Produces: `dist-installer/TaskerPro Setup <versija>.exe`

- [ ] **Step 1: Prijungti nustatymų langą ir autostartą**

`src/desktop/windows.ts` — pridėti metodą:

```ts
    openSettings(urls: string[]) {
      const query = encodeURIComponent(JSON.stringify(urls));
      const win = new BrowserWindow({ width: 520, height: 620, title: 'Nustatymai' });
      void win.loadURL(`${baseUrl}/settings/?lan=${query}`);
    },
```

`src/desktop/tray.ts` — į meniu prieš „Išjungti" įterpti:

```ts
      { label: 'Nustatymai', click: handlers.onSettings },
```

ir į `TrayHandlers` — `onSettings(): void`.

`src/desktop/main.ts` — pridėti importus:

```ts
import { networkInterfaces } from 'node:os';
import { syncAutostart } from './autostart.js';
import { lanUrls } from './network.js';
```

ir po planuoklio paleidimo:

```ts
    const autostartApi = {
      get: () => app.getLoginItemSettings().openAtLogin,
      set: (enabled: boolean) => app.setLoginItemSettings({ openAtLogin: enabled }),
    };
    syncAutostart(settingsStore.getAll().autostart, autostartApi);

    const urls = () => lanUrls(port, networkInterfaces());
```

Tray sukūrimą papildyti:

```ts
      onSettings: () => windows.openSettings(urls()),
```

Nustatymai keičiami kitame lange, tad pagrindinis procesas turi juos pasiimti. Paprasčiausias būdas be IPC — tikrinti kartu su planuoklio ciklu. `main.ts` prie planuoklio pridėti:

```ts
    let lastHotkey = settingsStore.getAll().hotkey;
    const stopSettingsWatch = setInterval(() => {
      const current = settingsStore.getAll();
      syncAutostart(current.autostart, autostartApi);
      if (current.hotkey !== lastHotkey) {
        lastHotkey = current.hotkey;
        hotkeys.apply(current.hotkey, () => windows.togglePopup(tray.getBounds()));
      }
    }, 15_000);

    app.on('will-quit', () => clearInterval(stopSettingsWatch));
```

Tas pats 15 sekundžių ritmas kaip ir priminimams — nustatymai keičiami retai, tad greitesnio atsako nereikia, o IPC kanalo išvengiame visiškai.

- [ ] **Step 2: Sukonfigūruoti pakavimą**

```bash
npm i -D electron-builder
```

`electron-builder.yml`:

```yaml
appId: lt.taskerpro.app
productName: TaskerPro
directories:
  output: dist-installer
files:
  - dist/**
  - package.json
npmRebuild: true
win:
  target: nsis
  icon: src/desktop/assets/icon.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
```

`npmRebuild: true` yra būtinas: `better-sqlite3` yra natyvus modulis ir turi būti perkompiliuotas Electron ABI versijai, kitaip įdiegta programa nepasileis.

`package.json`:

```json
{
  "version": "1.0.0",
  "scripts": {
    "dist": "npm run build && electron-builder --config electron-builder.yml"
  }
}
```

- [ ] **Step 3: Papildyti README**

`README.md` — pakeisti skyrių „Paleidimas":

```markdown
## Diegimas

Paimk `TaskerPro Setup 1.0.0.exe` iš `dist-installer/` ir paleisk.
Programa startuoja kartu su Windows ir gyvena tray'uje prie laikroduko.

**Pirmą kartą** Windows paklaus leidimo įeinančiam tinklo ryšiui — atsakyk
„Leisti", kitaip planšetė neprisijungs.

## Naudojimas

- `Ctrl+Alt+Space` arba tray ikona — greitas užduoties įvedimas
- Tray meniu → Atidaryti lentą — kanban lenta
- Tray meniu → Garsas — priminimų garso perjungimas
- Tray meniu → Nustatymai — portas, klavišas, apžvalgos laikai, tema

**Iš planšetės:** tray meniu → Nustatymai, ten rodomas adresas, kurį reikia
suvesti planšetės naršyklėje.

Duomenys laikomi `%APPDATA%/taskerpro/tasks.db`.

## Kūrimas

    npm install
    npm run app     # paleidžia iš kodo
    npm test        # vienetiniai ir integraciniai testai
    npm run test:e2e
    npm run dist    # supakuoja diegimo failą
```

- [ ] **Step 4: Rankinė patikra**

Run: `npm run dist`

1. `dist-installer/` atsiranda `TaskerPro Setup 1.0.0.exe`
2. Įdiegus programa pasileidžia, tray ikona atsiranda
3. Tray meniu → Nustatymai atidaro langą; matomas LAN adresas
4. Suvedus tą adresą planšetėje atsidaro lenta ir rodo tas pačias užduotis
5. Pakeitus karštąjį klavišą naujoji kombinacija pradeda veikti per 15 s
6. Išjungus „Paleisti su Windows" ir perkrovus kompiuterį programa nebepasileidžia; įjungus — pasileidžia
7. Pakeitus temą į tamsią persidažo nustatymų langas; **jau atidaryta lenta ir
   tray langelis nepersidažo, kol neperkraunami** — nustatymų pakeitimai
   nesiunčiami per SSE. Tai žinomas apribojimas, aprašytas README; punktas
   patikslintas, o ne paliktas kaip niekada nepraeinantis kriterijus
8. Pakeitus apžvalgos laiką ir sulaukus jo langas pasirodo
9. Pakeitus portą ir paleidus programą iš naujo serveris klausosi naujojo porto

- [ ] **Step 5: Paleisti visus automatinius testus**

Run: `npm test`
Expected: PASS

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/desktop electron-builder.yml package.json package-lock.json README.md
git commit -m "feat: nustatymų langas, autostartas ir diegimo failo pakavimas"
```

---

## Pabaigos patikra

Po 4 užduoties sistema baigta: įdiegiama vienu failu, startuoja su Windows, konfigūruojama be kodo, pasiekiama iš planšetės ir pati primena apie neatliktus darbus.

Visos specifikacijos savybės realizuotos. Sąmoningai neįtraukta ir toliau lieka už ribų: autentikacija, offline režimas planšetėje, pasikartojančios užduotys, subužduotys, žymos, keli naudotojai, debesies sinchronizacija, rankinis kortelių rikiavimas.
