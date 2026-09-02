# Parduotuvės versija, 1 dalis: matavimas ir autentikacija — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serveris pagal nutylėjimą klauso tik `127.0.0.1`, o prieigą iš tinklo atrakina vieno PIN kodo sesija — kad programą galėtų įsidiegti svetimas žmogus svetimame tinkle.

**Architecture:** Viena tarpinė grandis prieš `/api/*` praleidžia loopback užklausas nepakeistas ir reikalauja pasirašyto slapuko iš visų kitų. PIN maiša (scrypt) guli `settings` lentelėje, o slapukas pasirašomas HMAC raktu, išvestu iš tos maišos — todėl sesijų lentelės nereikia, o PIN pakeitimas savaime atjungia visus įrenginius. Klausymosi adresas tampa `lan` nustatymu, skaitomu startuojant, kaip ir `port`.

**Tech Stack:** TypeScript (ESM), Express 5, better-sqlite3, React 19, Vitest + jsdom, supertest, Playwright, Electron 43.

**Spec:** `docs/superpowers/specs/2026-09-01-parduotuves-versija-design.md`

## Global Constraints

- **Viskas lietuviškai:** sąsajos tekstai, klaidų žinutės (taip pat ir API `error.message`), kodo komentarai ir commit'ai. Šis planas kalbų dar nekeičia — anglų kalba ateina 2 dalies plane (spec §5).
- **ESM:** reliatyvūs importai rašomi su `.js` galūne net iš `.ts` failų.
- **`core` moduliai, kuriuos importuoja `ui`, negali turėti Node builtinų vykdymo metu.** `core/settings.ts` yra būtent toks, tad `node:crypto` jame draudžiamas — visa kriptografija gyvena `core/pin.ts`, kurio `ui/` neimportuoja niekada (spec §4.3).
- **Schemos migracijos nereikia:** `settings` lentelė yra raktas–reikšmė, nauji raktai atsiranda su numatytosiomis reikšmėmis (spec §3).
- **TDD:** kiekvienas žingsnis rašo krentantį testą pirma, tada minimalų kodą.
- **Visi esami testai privalo likti žali:** 368 vienetiniai (`npm test`) ir 18 e2e (`npx playwright test`).
- **PIN formatas:** 4–8 skaitmenys, tik skaitmenys.
- **Slapuko galiojimas:** 30 parų. **Ribojimas:** 5 bandymai per 15 minučių, tada `429`.
- **e2e testai kreipiasi per `127.0.0.1`**, tad jie yra loopback ir dėl autentikacijos nesikeičia. Tinklo šaką dengia tik `tests/server/`.

---

### Task 1: MSIX matavimas (spec §9.1)

Šios užduoties rezultatas yra **atsakymas, ne paliekamas kodas**. Ji atsako į du spec §11 klausimus, nuo kurių priklauso 3 dalies (pakavimo) planas: ar supakuota programa mato `%APPDATA%/sarka`, ir ar veikia autostartas. Laikinas `appx` taikinys po matavimo pašalinamas.

**Files:**
- Modify (laikinai): `electron-builder.yml`
- Modify: `docs/superpowers/specs/2026-09-01-parduotuves-versija-design.md` (11 skyrius — įrašomi atsakymai)

**Interfaces:**
- Consumes: nieko.
- Produces: atsakymus spec 11 skyriuje. 3 dalies planas jais remsis; šio plano 2–11 užduotys nuo jų nepriklauso.

- [ ] **Step 1: Įsijungti Windows kūrėjo režimą ir pasitikrinti SDK**

```powershell
Get-WindowsDeveloperLicense
Get-Command makeappx.exe -ErrorAction SilentlyContinue
```

Jei `makeappx.exe` nerandamas, įdiegti Windows SDK (Visual Studio Installer → „Windows 11 SDK"). Be jo `appx` taikinys neveiks.

- [ ] **Step 2: Pridėti laikiną `appx` taikinį**

`electron-builder.yml`, `win:` skiltyje `target: nsis` pakeisti į sąrašą ir pridėti `appx:` bloką:

```yaml
win:
  target:
    - nsis
    - appx
  icon: src/desktop/assets/icon.png
appx:
  # LAIKINA. Tikrąsias reikšmes duos Partner Center 3 dalies plane;
  # matavimui svarbu tik tai, kad paketas susikurtų ir užsiregistruotų.
  identityName: SarkaMatavimas
  publisher: CN=Matavimas
  publisherDisplayName: Matavimas
  applicationId: Sarka
```

- [ ] **Step 3: Supakuoti**

```bash
npx electron-builder --win appx
```

Expected: `dist-installer/` atsiranda `.appx` failas ir paruošimo katalogas su `AppxManifest.xml`.

- [ ] **Step 4: Užregistruoti paketą iš katalogo**

Pasirašyto paketo diegti nereikia — kūrėjo režimu registruojamas pats katalogas:

```powershell
$manifest = Get-ChildItem dist-installer -Recurse -Filter AppxManifest.xml | Select-Object -First 1
$manifest.FullName
Add-AppxPackage -Register $manifest.FullName
```

- [ ] **Step 5: Išmatuoti duomenų katalogą**

Paleisti programą iš Start meniu, sukurti vieną užduotį, tada:

```powershell
Get-ChildItem "$env:APPDATA\sarka" -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
Get-ChildItem "$env:LOCALAPPDATA\Packages" -Filter "SarkaMatavimas*" -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter tasks.db -ErrorAction SilentlyContinue } |
  Select-Object FullName, Length, LastWriteTime
```

Užrašyti, kuriame kelyje `tasks.db` pasikeitė (`LastWriteTime`). Tai ir yra atsakymas: matomas senas katalogas ar nukreipta į paketo privatų katalogą.

- [ ] **Step 6: Išmatuoti autostartą**

Nustatymų lange perjungti autostartą ir patikrinti abu galimus registravimo būdus:

```powershell
Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue
Get-StartApps | Where-Object { $_.Name -like "*arka*" }
Get-AppxPackage SarkaMatavimas* | Select-Object -ExpandProperty PackageFullName
```

Užrašyti, ar `Run` raktas atsirado, ar jis virtualizuotas (nematomas), ar reikia `windows.startupTask` plėtinio.

- [ ] **Step 7: Išregistruoti ir atsukti laikiną konfigūraciją**

```powershell
Get-AppxPackage SarkaMatavimas* | Remove-AppxPackage
```

```bash
git checkout electron-builder.yml
```

- [ ] **Step 8: Įrašyti atsakymus į specifikaciją ir commit'inti**

Spec 11 skyriuje pirmus du punktus pakeisti išmatuotais atsakymais (kelias, `LastWriteTime`, autostarto elgesys), nurodant matavimo datą.

```bash
git add docs/superpowers/specs/2026-09-01-parduotuves-versija-design.md
git commit -m "Spec: išmatuoti supakuotos programos duomenų kelias ir autostartas"
```

---

### Task 2: `core/pin.ts` — PIN formatas ir maiša

**Files:**
- Create: `src/core/pin.ts`
- Test: `tests/core/pin.test.ts`

**Interfaces:**
- Consumes: nieko.
- Produces: `isValidPin(value: unknown): boolean`, `PinHash { hash: string; salt: string }`, `hashPin(pin: string): PinHash`, `verifyPin(pin: string, stored: PinHash): boolean`. Naudos 3, 5 ir 6 užduotys.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/pin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, verifyPin } from '../../src/core/pin.js';

describe('isValidPin', () => {
  it('priima 4–8 skaitmenis', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
  });

  it('atmeta per trumpą, per ilgą, ne skaitmenis ir ne eilutę', () => {
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('')).toBe(false);
    expect(isValidPin(1234)).toBe(false);
    expect(isValidPin(null)).toBe(false);
  });
});

describe('hashPin ir verifyPin', () => {
  it('tas pats PIN su skirtingomis druskomis duoda skirtingas maišas', () => {
    const a = hashPin('1234');
    const b = hashPin('1234');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('teisingas PIN patvirtinamas, neteisingas — ne', () => {
    const stored = hashPin('4321');
    expect(verifyPin('4321', stored)).toBe(true);
    expect(verifyPin('1234', stored)).toBe(false);
  });

  // Sugadinta reikšmė bazėje neturi kelti išimties: `timingSafeEqual` meta,
  // kai buferių ilgiai skiriasi, o tokia klaida nukristų iš maršruto vidurio.
  it('sugadinta saugoma maiša grąžina false, o ne išimtį', () => {
    expect(verifyPin('4321', { hash: 'ab', salt: 'cd' })).toBe(false);
  });

  it('netinkamo formato PIN atmetamas netikrinant maišos', () => {
    const stored = hashPin('4321');
    expect(verifyPin('43', stored)).toBe(false);
  });
});
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/pin.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/pin.js"`.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/pin.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// DĖMESIO: šis modulis naudoja Node builtinus, tad jo NEGALIMA importuoti iš
// `ui/` — Vite bandytų `node:crypto` sudėti į naršyklės paketą ir buildas lūžtų.
// Būtent todėl maiša gyvena čia, o ne `core/settings.ts`, kurį `ui/` importuoja.

const PIN_RE = /^\d{4,8}$/;
const RAKTO_ILGIS = 32;

export interface PinHash {
  hash: string;
  salt: string;
}

export function isValidPin(value: unknown): boolean {
  return typeof value === 'string' && PIN_RE.test(value);
}

export function hashPin(pin: string): PinHash {
  const salt = randomBytes(16).toString('hex');
  return { hash: scryptSync(pin, salt, RAKTO_ILGIS).toString('hex'), salt };
}

export function verifyPin(pin: string, stored: PinHash): boolean {
  if (!isValidPin(pin)) return false;
  const laukiama = Buffer.from(stored.hash, 'hex');
  if (laukiama.length !== RAKTO_ILGIS) return false;
  const kandidatas = scryptSync(pin, stored.salt, RAKTO_ILGIS);
  return timingSafeEqual(kandidatas, laukiama);
}
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npx vitest run tests/core/pin.test.ts`
Expected: PASS (5 testai).

- [ ] **Step 5: Commit**

```bash
git add src/core/pin.ts tests/core/pin.test.ts
git commit -m "core/pin.ts: PIN formatas ir scrypt maiša"
```

---

### Task 3: Nustatymai — `lan`, `pin_hash`, `pin_salt`

**Files:**
- Modify: `src/core/settings.ts`
- Test: `tests/core/settings.test.ts` (papildoma)

**Interfaces:**
- Consumes: nieko iš 2 užduoties (kryžminė taisyklė tikrina tik `pin_hash !== null`).
- Produces: `SettingsMap` papildomas `lan: boolean`, `pin_hash: string | null`, `pin_salt: string | null`; naujas eksportuojamas tipas `PublicSettings = Omit<SettingsMap, 'pin_hash' | 'pin_salt'> & { has_pin: boolean }`. Naudos 6, 7, 10 ir 11 užduotys.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/core/settings.test.ts` gale, esamo `describe` viduje:

```ts
  it('nauji raktai turi numatytąsias reikšmes', () => {
    const store = createSettingsStore(db);
    const all = store.getAll();
    expect(all.lan).toBe(false);
    expect(all.pin_hash).toBeNull();
    expect(all.pin_salt).toBeNull();
  });

  // Ši taisyklė gyvena core dėl tos pačios priežasties kaip `isValidHotkey`:
  // ji privalo galioti bet kuriam klientui, ne tik nustatymų ekranui.
  it('lan be PIN atmetamas', () => {
    const store = createSettingsStore(db);
    expect(() => store.patch({ lan: true })).toThrow(/PIN/);
    expect(store.getAll().lan).toBe(false);
  });

  it('lan su jau nustatytu PIN priimamas', () => {
    const store = createSettingsStore(db);
    store.patch({ pin_hash: 'aa', pin_salt: 'bb' });
    expect(store.patch({ lan: true }).lan).toBe(true);
  });

  it('lan ir PIN tame pačiame patch praeina', () => {
    const store = createSettingsStore(db);
    expect(store.patch({ lan: true, pin_hash: 'aa', pin_salt: 'bb' }).lan).toBe(true);
  });

  it('lan išjungti galima ir be PIN', () => {
    const store = createSettingsStore(db);
    store.patch({ pin_hash: 'aa', pin_salt: 'bb', lan: true });
    store.patch({ pin_hash: null, pin_salt: null, lan: false });
    expect(store.getAll().lan).toBe(false);
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: FAIL — `expect(all.lan).toBe(false)` gauna `undefined`.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/core/settings.ts`: į `SettingsMap` sąsają pridėti tris laukus:

```ts
  lan: boolean;
  pin_hash: string | null;
  pin_salt: string | null;
```

Į `SETTING_DEFAULTS` — jų reikšmes:

```ts
  // Tinklo prieiga išjungta pagal nutylėjimą: svetimame tinkle atviras serveris
  // yra pavojus, o namų tinkle tai vieno jungiklio kaina (spec §4.1).
  lan: false,
  pin_hash: null,
  pin_salt: null,
```

Į `VALIDATORS`:

```ts
  lan: (v) => typeof v === 'boolean',
  pin_hash: (v) => v === null || typeof v === 'string',
  pin_salt: (v) => v === null || typeof v === 'string',
```

Po `KEYS` deklaracijos pridėti viešą tipą:

```ts
// Ką grąžina API: PIN maiša ir druska nekeliauja pas klientą niekada, o vietoj
// jų atsiranda vienas loginis laukas (spec §4.3).
export type PublicSettings = Omit<SettingsMap, 'pin_hash' | 'pin_salt'> & { has_pin: boolean };
```

`patch()` viduje, po esamo raktų ir validatorių ciklo, prieš `write(...)`:

```ts
      // Kryžminė taisyklė: įjungti tinklo prieigą be PIN neįmanoma. Tikrinam
      // prieš rašymą ir įskaitom tą patį patch'ą — PIN ir `lan` gali ateiti
      // kartu (nustatymų ekranas siunčia būtent taip).
      if (values.lan === true) {
        const busimasHash = values.pin_hash !== undefined ? values.pin_hash : getAll().pin_hash;
        if (busimasHash === null) {
          throw new Error('Tinklo prieigai pirma nustatyk PIN kodą');
        }
      }
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npx vitest run tests/core/settings.test.ts`
Expected: PASS (visi, įskaitant 5 naujus).

- [ ] **Step 5: Commit**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "Nustatymai: lan, pin_hash, pin_salt ir taisyklė, kad tinklui reikia PIN"
```

---

### Task 4: `server/auth.ts` — grynosios funkcijos

**Files:**
- Create: `src/server/auth.ts`
- Test: `tests/server/auth.test.ts`

**Interfaces:**
- Consumes: `Clock` iš `src/core/clock.ts` (`fixedClock` testams).
- Produces: `SESSION_COOKIE: 'sarka_session'`, `isLoopback(address: string | undefined): boolean`, `parseCookies(header: string | undefined): Record<string, string>`, `signSession(key: string, expiresAt: number): string`, `verifySession(key: string, value: string | undefined, now: number): boolean`, `SESSION_TRUKME_MS` (30 parų milisekundėmis), `createThrottle(clock: Clock, max?: number, windowMs?: number): Throttle` su `Throttle { blocked(addr: string): boolean; fail(addr: string): void; reset(addr: string): void }`. `fixedClock(iso)` turi `set(iso)` ir `advance(ms)` — testai naudoja `set`. Naudos 5 ir 6 užduotys.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/server/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/core/clock.js';
import {
  createThrottle, isLoopback, parseCookies, signSession, verifySession,
} from '../../src/server/auth.js';

describe('isLoopback', () => {
  it('atpažįsta visas tris loopback formas', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    // Node IPv4 adresą per IPv6 lizdą pateikia būtent taip.
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
  });

  it('svetimą adresą ir tuštumą atmeta', () => {
    expect(isLoopback('192.168.1.14')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
    // Klastotė, prasidedanti tais pačiais simboliais.
    expect(isLoopback('127.0.0.1.evil.lt')).toBe(false);
  });
});

describe('parseCookies', () => {
  it('išskiria reikšmes ir praleidžia šiukšles', () => {
    expect(parseCookies('a=1; sarka_session=xyz')).toEqual({ a: '1', sarka_session: 'xyz' });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });
});

describe('signSession ir verifySession', () => {
  const RAKTAS = 'maisa';
  const DABAR = 1_000_000;

  it('savo paties parašą priima', () => {
    expect(verifySession(RAKTAS, signSession(RAKTAS, DABAR + 1000), DABAR)).toBe(true);
  });

  it('kitu raktu pasirašytą atmeta — tai ir yra PIN pakeitimo atjungimas', () => {
    expect(verifySession('kita-maisa', signSession(RAKTAS, DABAR + 1000), DABAR)).toBe(false);
  });

  it('pasibaigusį ir sugadintą atmeta', () => {
    expect(verifySession(RAKTAS, signSession(RAKTAS, DABAR - 1), DABAR)).toBe(false);
    expect(verifySession(RAKTAS, 'nesamone', DABAR)).toBe(false);
    expect(verifySession(RAKTAS, undefined, DABAR)).toBe(false);
    // Galiojimo laiko pakeitimas be naujo parašo.
    const [, sig] = signSession(RAKTAS, DABAR + 1000).split('.');
    expect(verifySession(RAKTAS, `${DABAR + 99999}.${sig}`, DABAR)).toBe(false);
  });
});

describe('createThrottle', () => {
  it('užrakina po penkių nesėkmių ir atleidžia pasibaigus langui', () => {
    const clock = fixedClock('2026-09-02T10:00:00.000Z');
    const throttle = createThrottle(clock, 5, 15 * 60 * 1000);

    for (let i = 0; i < 5; i += 1) {
      expect(throttle.blocked('1.2.3.4')).toBe(false);
      throttle.fail('1.2.3.4');
    }
    expect(throttle.blocked('1.2.3.4')).toBe(true);

    // Kitas adresas nenukenčia.
    expect(throttle.blocked('5.6.7.8')).toBe(false);

    clock.set('2026-09-02T10:15:01.000Z');
    expect(throttle.blocked('1.2.3.4')).toBe(false);
  });

  it('sėkmingas prisijungimas nuvalo skaitiklį', () => {
    const clock = fixedClock('2026-09-02T10:00:00.000Z');
    const throttle = createThrottle(clock, 5, 15 * 60 * 1000);
    for (let i = 0; i < 4; i += 1) throttle.fail('1.2.3.4');
    throttle.reset('1.2.3.4');
    for (let i = 0; i < 4; i += 1) throttle.fail('1.2.3.4');
    expect(throttle.blocked('1.2.3.4')).toBe(false);
  });
});
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/server/auth.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/server/auth.js"`.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/server/auth.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../core/clock.js';

export const SESSION_COOKIE = 'sarka_session';

// 30 parų: planšetė stovi tame pačiame tinkle nuolat, tad dažnesnis PIN
// klausimas būtų vien trukdis (spec §4.4).
export const SESSION_TRUKME_MS = 30 * 24 * 60 * 60 * 1000;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.has(address);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (header === undefined || header === '') return result;
  for (const dalis of header.split(';')) {
    const lygybe = dalis.indexOf('=');
    if (lygybe === -1) continue;
    const raktas = dalis.slice(0, lygybe).trim();
    if (raktas === '') continue;
    result[raktas] = dalis.slice(lygybe + 1).trim();
  }
  return result;
}

export function signSession(key: string, expiresAt: number): string {
  const parasas = createHmac('sha256', key).update(String(expiresAt)).digest('hex');
  return `${expiresAt}.${parasas}`;
}

export function verifySession(key: string, value: string | undefined, now: number): boolean {
  if (value === undefined) return false;
  const [galiojaIki, parasas] = value.split('.');
  if (galiojaIki === undefined || parasas === undefined) return false;
  const laikas = Number(galiojaIki);
  if (!Number.isFinite(laikas) || laikas <= now) return false;

  const laukiamas = Buffer.from(createHmac('sha256', key).update(galiojaIki).digest('hex'), 'hex');
  const gautas = Buffer.from(parasas, 'hex');
  if (gautas.length !== laukiamas.length) return false;
  return timingSafeEqual(gautas, laukiamas);
}

export interface Throttle {
  blocked(addr: string): boolean;
  fail(addr: string): void;
  reset(addr: string): void;
}

// Atmintyje, ne bazėje: užraktas galioja 15 minučių, o programos perkrovimas
// yra retesnis įvykis nei tas langas. Bazėje jis kainuotų migraciją ir rašymą
// į diską kiekvienam neteisingam spėjimui.
export function createThrottle(
  clock: Clock,
  max = 5,
  windowMs = 15 * 60 * 1000,
): Throttle {
  const bandymai = new Map<string, { count: number; iki: number }>();

  return {
    blocked(addr) {
      const irasas = bandymai.get(addr);
      if (irasas === undefined) return false;
      if (clock.now().getTime() >= irasas.iki) {
        bandymai.delete(addr);
        return false;
      }
      return irasas.count >= max;
    },
    fail(addr) {
      const dabar = clock.now().getTime();
      const irasas = bandymai.get(addr);
      if (irasas === undefined || dabar >= irasas.iki) {
        bandymai.set(addr, { count: 1, iki: dabar + windowMs });
        return;
      }
      irasas.count += 1;
    },
    reset(addr) {
      bandymai.delete(addr);
    },
  };
}
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npx vitest run tests/server/auth.test.ts`
Expected: PASS (8 testai).

- [ ] **Step 5: Commit**

```bash
git add src/server/auth.ts tests/server/auth.test.ts
git commit -m "server/auth.ts: slapuko parašas, loopback atpažinimas ir bandymų ribojimas"
```

---

### Task 5: Grandis prieš `/api/*`

**Files:**
- Modify: `src/server/app.ts`
- Test: `tests/server/auth.test.ts` (papildoma)

**Interfaces:**
- Consumes: 4 užduoties funkcijas; 3 užduoties `pin_hash`.
- Produces: `AppDeps` papildomas `clock: Clock` ir neprivalomu `trustRequest?: (req: Request) => boolean`. **Testai perduoda savo `trustRequest`, nes supertest visada jungiasi per loopback ir tinklo šakos kitaip pasiekti neįmanoma.** Naudos 6 užduotis.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/server/auth.test.ts` gale:

```ts
import request from 'supertest';
import { openDb } from '../../src/core/db.js';
import { createSettingsStore } from '../../src/core/settings.js';
import { createTaskStore } from '../../src/core/tasks.js';
import { createApp } from '../../src/server/app.js';
import { createEventHub } from '../../src/server/events.js';
import { hashPin } from '../../src/core/pin.js';

function aplinka(options: { trusted: boolean; pin?: string }) {
  const db = openDb(':memory:');
  const settings = createSettingsStore(db);
  if (options.pin !== undefined) {
    const { hash, salt } = hashPin(options.pin);
    settings.patch({ pin_hash: hash, pin_salt: salt, lan: true });
  }
  const clock = fixedClock('2026-09-02T10:00:00.000Z');
  const app = createApp({
    tasks: createTaskStore(db, clock),
    settings,
    events: createEventHub(),
    clock,
    trustRequest: () => options.trusted,
  });
  return { app, settings, clock, db };
}

describe('API grandis', () => {
  it('loopback praleidžiamas be jokio slapuko', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    await request(app).get('/api/tasks').expect(200);
  });

  it('svetimas adresas be slapuko gauna 401', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    const res = await request(app).get('/api/tasks').expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('svetimas adresas su galiojančiu slapuku įleidžiamas', async () => {
    const { app, settings, clock } = aplinka({ trusted: false, pin: '1234' });
    const slapukas = signSession(
      settings.getAll().pin_hash!,
      clock.now().getTime() + 1000,
    );
    await request(app)
      .get('/api/tasks')
      .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
      .expect(200);
  });

  // Be PIN tinklo prieigos įjungti neįmanoma, tad svetimas adresas šiuo atveju
  // negali atsirasti teisėtai — bet jei atsirastų, jį atmetam, o ne įleidžiam.
  it('svetimas adresas atmetamas ir tada, kai PIN visai nenustatytas', async () => {
    const { app } = aplinka({ trusted: false });
    await request(app).get('/api/tasks').expect(401);
  });

  it('SSE srautas eina per tą pačią grandį', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    await request(app).get('/api/events').expect(401);
  });
});
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/server/auth.test.ts`
Expected: FAIL — `createApp` nepriima `clock`/`trustRequest`, o `/api/tasks` grąžina 200 visiems.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/server/app.ts` — papildyti importus ir `AppDeps`:

```ts
import type { Clock } from '../core/clock.js';
import { isLoopback, parseCookies, SESSION_COOKIE, verifySession } from './auth.js';

export interface AppDeps {
  tasks: TaskStore;
  settings: SettingsStore;
  events: EventHub;
  clock: Clock;
  uiDir?: string;
  // Testai perduoda savo tikrinimą: supertest visada jungiasi per loopback,
  // tad tinklo šaka kitaip nepasiekiama.
  trustRequest?: (req: express.Request) => boolean;
}
```

`createApp` viduje, iškart po `app.use(express.json())`:

```ts
  const trustRequest = deps.trustRequest ?? ((req: express.Request) => isLoopback(req.socket.remoteAddress));

  // Statika lieka atvira — joje nėra duomenų. Saugom tik /api (spec §4.5).
  app.use('/api', (req, res, next) => {
    // Prisijungimas privalo būti pasiekiamas be sesijos, kitaip PIN suvesti
    // nebūtų iš kur.
    if (req.path === '/session') { next(); return; }
    if (trustRequest(req)) { next(); return; }

    const { pin_hash } = deps.settings.getAll();
    const slapukas = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (pin_hash !== null && verifySession(pin_hash, slapukas, deps.clock.now().getTime())) {
      next();
      return;
    }
    res.status(401).json({ error: { code: 'unauthorized', message: 'Reikia prisijungti' } });
  });
```

- [ ] **Step 4: Sutvarkyti esamus `createApp` kvietėjus**

`src/server/index.ts` — `createApp({...})` gauna `clock: systemClock` (jis ten jau importuotas).
`tests/server/api.test.ts` ir `tests/server/events.test.ts` — kiekvienas `createApp({...})` gauna `clock: fixedClock('2026-09-02T10:00:00.000Z')`. Importą pridėti, jei jo nėra.

- [ ] **Step 5: Paleisti visus testus**

Run: `npm test`
Expected: PASS — 368 seni + nauji.

- [ ] **Step 6: Commit**

```bash
git add src/server/app.ts src/server/index.ts tests/server/
git commit -m "Grandis prieš /api: loopback praleidžiamas, tinklas reikalauja slapuko"
```

---

### Task 6: `POST /api/session`, `PUT /api/pin` ir nustatymų slėpimas

**Files:**
- Create: `src/server/routes/auth.ts`
- Modify: `src/server/app.ts`, `src/server/routes/settings.ts`
- Test: `tests/server/auth.test.ts` (papildoma)

**Interfaces:**
- Consumes: 2, 3, 4 užduočių eksportus; 5 užduoties `trustRequest`.
- Produces: `sessionRouter(deps)` ir `pinRouter(deps)`; `GET /api/settings` atsakymas tampa `PublicSettings`. Naudos 8, 10 ir 11 užduotys.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/server/auth.test.ts` gale:

```ts
describe('prisijungimas ir PIN', () => {
  it('teisingas PIN grąžina slapuką, kuris atrakina API', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    const res = await request(app).post('/api/session').send({ pin: '1234' }).expect(200);

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');

    await request(app).get('/api/tasks').set('Cookie', cookie).expect(200);
  });

  it('neteisingas PIN grąžina 401, o po penkių bandymų — 429', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/session').send({ pin: '9999' }).expect(401);
    }
    await request(app).post('/api/session').send({ pin: '9999' }).expect(429);
    // Užrakintas ir teisingas PIN nepraeina — kitaip ribojimas nieko neduotų.
    await request(app).post('/api/session').send({ pin: '1234' }).expect(429);
  });

  it('PIN pakeitimas nuvertina senus slapukus', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    const res = await request(app).post('/api/session').send({ pin: '1234' }).expect(200);
    const senas = res.headers['set-cookie'][0];

    await request(app).put('/api/pin').send({ pin: '5678' }).expect(204);

    const { app: tinklas } = aplinka({ trusted: false, pin: '1234' });
    await request(tinklas).get('/api/tasks').set('Cookie', senas).expect(401);
  });

  it('GET /api/settings negrąžina maišos, o rodo has_pin', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    const res = await request(app).get('/api/settings').expect(200);
    expect(res.body.pin_hash).toBeUndefined();
    expect(res.body.pin_salt).toBeUndefined();
    expect(res.body.has_pin).toBe(true);
  });

  it('PATCH /api/settings atsisako liesti PIN raktus', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    const res = await request(app).patch('/api/settings').send({ pin_hash: 'xx' }).expect(400);
    expect(res.body.error.code).toBe('protected_setting');
  });

  it('netinkamo formato PIN atmetamas', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    await request(app).put('/api/pin').send({ pin: '12' }).expect(400);
  });

  it('PIN pašalinimas išjungia ir tinklo prieigą', async () => {
    const { app, settings } = aplinka({ trusted: true, pin: '1234' });
    await request(app).put('/api/pin').send({ pin: null }).expect(204);
    expect(settings.getAll().pin_hash).toBeNull();
    expect(settings.getAll().lan).toBe(false);
  });
});
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/server/auth.test.ts`
Expected: FAIL — `POST /api/session` grąžina 404.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/server/routes/auth.ts`:

```ts
import { Router } from 'express';
import type { Clock } from '../../core/clock.js';
import { hashPin, isValidPin, verifyPin } from '../../core/pin.js';
import type { SettingsStore } from './settings.js';
import { ApiError } from './tasks.js';
import { SESSION_COOKIE, SESSION_TRUKME_MS, signSession, type Throttle } from '../auth.js';

export interface AuthDeps {
  settings: SettingsStore;
  clock: Clock;
  throttle: Throttle;
}

export function sessionRouter(deps: AuthDeps): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const adresas = req.socket.remoteAddress ?? 'nezinomas';
    if (deps.throttle.blocked(adresas)) {
      throw new ApiError(429, 'too_many_attempts', 'Per daug bandymų. Pabandyk po 15 minučių');
    }

    const { pin } = (req.body ?? {}) as { pin?: unknown };
    const { pin_hash, pin_salt } = deps.settings.getAll();
    const tinka = typeof pin === 'string'
      && pin_hash !== null
      && pin_salt !== null
      && verifyPin(pin, { hash: pin_hash, salt: pin_salt });

    if (!tinka) {
      deps.throttle.fail(adresas);
      throw new ApiError(401, 'invalid_pin', 'Neteisingas PIN');
    }

    deps.throttle.reset(adresas);
    const galiojaIki = deps.clock.now().getTime() + SESSION_TRUKME_MS;
    res.cookie(SESSION_COOKIE, signSession(pin_hash, galiojaIki), {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: SESSION_TRUKME_MS,
    });
    res.status(200).json({ ok: true });
  });

  return router;
}

export function pinRouter(deps: AuthDeps): Router {
  const router = Router();

  // PUT, o ne PATCH /api/settings: taip nė vienas būsimas nustatymų raktas
  // negali netyčia apeiti slėpimo taisyklės (spec §4.3).
  router.put('/', (req, res) => {
    const { pin } = (req.body ?? {}) as { pin?: unknown };

    if (pin === null) {
      // Pašalinus PIN tinklo prieiga privalo nukristi kartu — kitaip liktų
      // atviras serveris be jokio užrakto.
      deps.settings.patch({ pin_hash: null, pin_salt: null, lan: false });
      res.status(204).end();
      return;
    }

    if (!isValidPin(pin)) {
      throw new ApiError(400, 'invalid_pin', 'PIN turi būti 4–8 skaitmenys');
    }

    const { hash, salt } = hashPin(pin as string);
    deps.settings.patch({ pin_hash: hash, pin_salt: salt });
    res.status(204).end();
  });

  return router;
}
```

`src/server/routes/settings.ts` — slėpimas ir apsaugoti raktai:

```ts
import type { PublicSettings, SettingsMap } from '../../core/settings.js';

const APSAUGOTI = ['pin_hash', 'pin_salt'] as const;

function viesi(all: SettingsMap): PublicSettings {
  const { pin_hash, pin_salt, ...likusi } = all;
  return { ...likusi, has_pin: pin_hash !== null && pin_salt !== null };
}
```

`GET` grąžina `res.json(viesi(settings.getAll()))`; `PATCH` pradžioje:

```ts
    for (const raktas of APSAUGOTI) {
      if (raktas in ((req.body ?? {}) as Record<string, unknown>)) {
        throw new ApiError(400, 'protected_setting', 'PIN keičiamas per /api/pin');
      }
    }
```
o atsakymas — `res.json(viesi(settings.patch(...)))`.

`src/server/app.ts` — sumontuoti prieš ir po grandies:

```ts
  const throttle = createThrottle(deps.clock);
  app.use('/api/session', sessionRouter({ settings: deps.settings, clock: deps.clock, throttle }));
  // ...čia esanti grandis...
  app.use('/api/pin', pinRouter({ settings: deps.settings, clock: deps.clock, throttle }));
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npx vitest run tests/server/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Paleisti visus testus ir tipų patikrą**

Run: `npm test && npm run typecheck`
Expected: abu švarūs.

- [ ] **Step 6: Commit**

```bash
git add src/server/ tests/server/auth.test.ts
git commit -m "Prisijungimo ir PIN maršrutai; nustatymuose PIN maiša nebematoma"
```

---

### Task 7: Klausymosi adresas iš `lan` nustatymo

**Files:**
- Modify: `src/server/index.ts`
- Test: `tests/server/listen.test.ts` (papildoma)

**Interfaces:**
- Consumes: 3 užduoties `lan`.
- Produces: `listenWithFallback(app, startPort, attempts, host = '127.0.0.1')`.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/server/listen.test.ts` gale:

```ts
  it('be host argumento prisiriša tik prie loopback', async () => {
    const app = express();
    const { server, port } = await listenWithFallback(app, 0, 1);
    const address = server.address();
    expect(typeof address === 'object' && address !== null ? address.address : '')
      .toBe('127.0.0.1');
    expect(port).toBeGreaterThan(0);
    server.close();
  });

  it('gavęs 0.0.0.0 prisiriša prie visų sąsajų', async () => {
    const app = express();
    const { server } = await listenWithFallback(app, 0, 1, '0.0.0.0');
    const address = server.address();
    expect(typeof address === 'object' && address !== null ? address.address : '')
      .toBe('0.0.0.0');
    server.close();
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/server/listen.test.ts`
Expected: FAIL — pirmas testas gauna `0.0.0.0`.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/server/index.ts`:

```ts
export function listenWithFallback(
  app: Express,
  startPort: number,
  attempts: number,
  host = '127.0.0.1',
): Promise<{ server: Server; port: number }> {
```

viduje `const server = app.listen(port, host);`, o `startServer()` gale:

```ts
  // `lan` skaitomas TIK startuojant — lygiai kaip `port`. Gyvo perjungimo nėra,
  // ir nustatymų langas apie tai įspėja (spec §4.1).
  const host = settings.getAll().lan ? '0.0.0.0' : '127.0.0.1';
  return listenWithFallback(app, port, 5, host);
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npx vitest run tests/server/listen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts tests/server/listen.test.ts
git commit -m "Serveris pagal nutylėjimą klauso tik 127.0.0.1"
```

---

### Task 8: `ui/api.ts` — 401 tampa atpažįstamas

**Files:**
- Modify: `src/ui/api.ts`
- Test: `tests/ui/api.test.ts` (papildoma)

**Interfaces:**
- Consumes: 6 užduoties maršrutus.
- Produces: `class UnauthorizedError extends Error`, `login(pin: string): Promise<void>`, `fetchSettings(): Promise<PublicSettings>`, `setPin(pin: string | null): Promise<void>`. Naudos 9 ir 10 užduotys.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/api.test.ts` gale:

```ts
  it('401 verčiamas atpažįstama klaida, o ne bendra žinute', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'unauthorized', message: 'Reikia prisijungti' } }),
    }) as unknown as typeof fetch;

    await expect(fetchTasks()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('login siunčia PIN į /api/session', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    globalThis.fetch = spy as unknown as typeof fetch;

    await login('1234');

    expect(spy).toHaveBeenCalledWith('/api/session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ pin: '1234' }),
    }));
  });
```

Importuoti `UnauthorizedError` ir `login` failo viršuje.

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/api.test.ts`
Expected: FAIL — `UnauthorizedError` neeksportuojamas.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/ui/api.ts`:

```ts
// Atskira klasė, ne žinutės tikrinimas: lenta pagal ją nusprendžia rodyti PIN
// ekraną vietoj klaidos juostos.
export class UnauthorizedError extends Error {
  constructor() {
    super('Reikia prisijungti');
    this.name = 'UnauthorizedError';
  }
}
```

`send()` viduje, prieš esamą `if (!res.ok)`:

```ts
  if (res.status === 401) throw new UnauthorizedError();
```

Failo gale:

```ts
export const login = (pin: string): Promise<void> => send('/api/session', 'POST', { pin });
export const setPin = (pin: string | null): Promise<void> => send('/api/pin', 'PUT', { pin });
```

`fetchSettings` grąžinamą tipą pakeisti į `Promise<PublicSettings>` ir importuoti `PublicSettings` vietoj `SettingsMap` (`import type`).

Tas pats tipas persiduoda toliau, ir be jo `npm run typecheck` lūžta: `src/ui/components/Board.tsx` būseną `useState<SettingsMap | null>(null)` pakeisti į `useState<PublicSettings | null>(null)` ir pataisyti to failo `import type` eilutę.

- [ ] **Step 4: Paleisti testus ir tipų patikrą**

Run: `npx vitest run tests/ui/api.test.ts && npm run typecheck`
Expected: abu švarūs.

- [ ] **Step 5: Commit**

```bash
git add src/ui/api.ts tests/ui/api.test.ts
git commit -m "ui/api.ts: UnauthorizedError, login ir setPin"
```

---

### Task 9: PIN ekranas ir jo integracija į lentą

**Files:**
- Create: `src/ui/components/PinGate.tsx`
- Modify: `src/ui/components/Board.tsx`, `src/ui/theme.css`
- Test: `tests/ui/PinGate.test.tsx`, `tests/ui/Board.test.tsx` (papildoma)

**Interfaces:**
- Consumes: 8 užduoties `login`, `UnauthorizedError`.
- Produces: `PinGate({ onUnlocked }: { onUnlocked(): void })`.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/PinGate.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinGate } from '../../src/ui/components/PinGate.js';
import * as api from '../../src/ui/api.js';

describe('PinGate', () => {
  it('teisingas PIN praneša tėvui', async () => {
    vi.spyOn(api, 'login').mockResolvedValue();
    const onUnlocked = vi.fn();
    render(<PinGate onUnlocked={onUnlocked} />);

    await userEvent.type(screen.getByLabelText('PIN kodas'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    expect(api.login).toHaveBeenCalledWith('1234');
    expect(onUnlocked).toHaveBeenCalled();
  });

  it('neteisingas PIN parodo serverio žinutę ir tėvo nekviečia', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new Error('Neteisingas PIN'));
    const onUnlocked = vi.fn();
    render(<PinGate onUnlocked={onUnlocked} />);

    await userEvent.type(screen.getByLabelText('PIN kodas'), '9999');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    expect(await screen.findByText('Neteisingas PIN')).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});
```

`tests/ui/Board.test.tsx` gale:

```tsx
  it('gavusi 401 lenta rodo PIN ekraną vietoj užduočių', async () => {
    vi.spyOn(api, 'fetchTasks').mockRejectedValue(new api.UnauthorizedError());
    render(<Board now={new Date('2026-09-02T10:00:00')} />);
    expect(await screen.findByLabelText('PIN kodas')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/PinGate.test.tsx tests/ui/Board.test.tsx`
Expected: FAIL — `PinGate` neegzistuoja.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/ui/components/PinGate.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import * as api from '../api.js';

export function PinGate({ onUnlocked }: { onUnlocked(): void }) {
  const [pin, setPin] = useState('');
  const [klaida, setKlaida] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      await api.login(pin);
      setPin('');
      onUnlocked();
    } catch (err) {
      setKlaida((err as Error).message);
    }
  };

  return (
    <form className="pin-ekranas" onSubmit={(e) => void submit(e)}>
      <h1>Šarka</h1>
      <label>
        PIN kodas
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-label="PIN kodas"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setKlaida(null); }}
        />
      </label>
      <button type="submit">Prisijungti</button>
      {klaida !== null && <p className="klaida" role="alert">{klaida}</p>}
    </form>
  );
}
```

`src/ui/components/Board.tsx` — būsena ir atšaka:

```tsx
  const [reikiaPin, setReikiaPin] = useState(false);
```

`reload` gaudyklėje (ir toje pačioje vietoje, kur dabar `setError`):

```tsx
    } catch (err) {
      if (err instanceof api.UnauthorizedError) { setReikiaPin(true); return; }
      setError((err as Error).message);
    }
```

Prieš pagrindinį `return`:

```tsx
  if (reikiaPin) {
    return <PinGate onUnlocked={() => { setReikiaPin(false); void reload(); }} />;
  }
```

`src/ui/theme.css` — pridėti `.pin-ekranas` stilių prie kitų ekranų blokų:

```css
/* PIN ekranas rodomas vietoj visos lentos, tad jis centruojamas lange. */
.pin-ekranas {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.pin-ekranas h1 { margin: 0; font-size: 20px; font-weight: 650; }
.pin-ekranas label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.pin-ekranas input { font: inherit; font-size: 18px; letter-spacing: .3em; text-align: center; }
```

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npx vitest run tests/ui/PinGate.test.tsx tests/ui/Board.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/PinGate.tsx src/ui/components/Board.tsx src/ui/theme.css tests/ui/
git commit -m "PIN ekranas: gavusi 401 lenta prašo kodo ir po jo persikrauna"
```

---

### Task 10: Nustatymų langas — PIN ir tinklo jungiklis

**Files:**
- Modify: `src/ui/settings/SettingsView.tsx`
- Test: `tests/ui/SettingsView.test.tsx` (papildoma)

**Interfaces:**
- Consumes: 8 užduoties `setPin`; 6 užduoties `has_pin`.
- Produces: nieko naujo.

- [ ] **Step 1: Parašyti krentantį testą**

`tests/ui/SettingsView.test.tsx` gale:

Faile jau yra fikstūra `SETTINGS` ir pagalbinė `renderView(over: Partial<SettingsMap> = {})`, grąžinanti `onChange`. Pirma jas perstatom į naują tipą, tada rašom testus.

Fikstūros tipą `SettingsMap` pakeisti į `PublicSettings`, pridėti du laukus ir `renderView` parametrą perrašyti į `Partial<PublicSettings>`:

```tsx
import type { PublicSettings } from '../../src/core/settings.js';
import * as api from '../../src/ui/api.js';

const SETTINGS: PublicSettings = {
  grouping: 'date', theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
  port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
  backup_dir: '', last_backup: null, last_backup_error: null,
  lan: false, has_pin: false,
};

function renderView(over: Partial<PublicSettings> = {}) {
```

Nauji testai `describe('SettingsView', ...)` gale:

```tsx
  it('be PIN tinklo jungiklis neaktyvus ir paaiškina kodėl', () => {
    renderView({ has_pin: false, lan: false });
    expect(screen.getByLabelText('Leisti prieigą iš tinklo')).toBeDisabled();
    expect(screen.getByText(/pirma nustatyk PIN/i)).toBeDefined();
  });

  it('turint PIN jungiklis veikia ir įspėja apie perkrovimą', async () => {
    const onChange = renderView({ has_pin: true, lan: false });

    await userEvent.click(screen.getByLabelText('Leisti prieigą iš tinklo'));

    expect(onChange).toHaveBeenCalledWith({ lan: true });
  });

  it('įjungtas tinklas įspėja, kad reikia perkrauti', () => {
    renderView({ has_pin: true, lan: true });
    expect(screen.getByText(/paleidus programą iš naujo/i)).toBeDefined();
  });

  it('PIN išsaugomas per setPin', async () => {
    vi.spyOn(api, 'setPin').mockResolvedValue();
    renderView({ has_pin: false });

    await userEvent.type(screen.getByLabelText('Naujas PIN'), '4321');
    await userEvent.click(screen.getByRole('button', { name: 'Išsaugoti PIN' }));

    expect(api.setPin).toHaveBeenCalledWith('4321');
  });
```

- [ ] **Step 2: Paleisti ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/SettingsView.test.tsx`
Expected: FAIL — nėra tokio jungiklio.

- [ ] **Step 3: Parašyti minimalų kodą**

`src/ui/settings/SettingsView.tsx` — pirma props tipe `settings: SettingsMap` pakeisti į `settings: PublicSettings` (importas `import type { PublicSettings }`), tada prieš `<section className="adresai">` įdėti:

```tsx
      <label>
        Naujas PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Naujas PIN"
          value={pinDraft}
          onChange={(e) => setPinDraft(e.target.value)}
        />
      </label>
      <button type="button" onClick={() => void api.setPin(pinDraft).then(() => setPinDraft(''))}>
        Išsaugoti PIN
      </button>
      {settings.has_pin && (
        <button type="button" onClick={() => void api.setPin(null)}>Pašalinti PIN</button>
      )}

      <label className="jungiklis">
        <input
          type="checkbox"
          aria-label="Leisti prieigą iš tinklo"
          checked={settings.lan}
          disabled={!settings.has_pin}
          onChange={(e) => onChange({ lan: e.target.checked })}
        />
        Leisti prieigą iš tinklo
      </label>
      {!settings.has_pin && <p className="uzuomina">Tinklo prieigai pirma nustatyk PIN kodą.</p>}
      {settings.lan && <p className="uzuomina">Įsigalioja paleidus programą iš naujo.</p>}
```

Būsena failo viršuje: `const [pinDraft, setPinDraft] = useState('');`

LAN adresų sąrašą (`<section className="adresai">`) apgaubti `{settings.lan && (...)}` — išjungus tinklą tie adresai nieko nereiškia.

- [ ] **Step 4: Paleisti ir įsitikinti, kad praeina**

Run: `npx vitest run tests/ui/SettingsView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Paleisti viską**

Run: `npm test && npm run typecheck && npx playwright test`
Expected: vienetiniai ir tipai švarūs; 18 e2e praeina nepakeisti (jie kreipiasi per loopback).

- [ ] **Step 6: Commit**

```bash
git add src/ui/settings/SettingsView.tsx tests/ui/SettingsView.test.tsx
git commit -m "Nustatymai: PIN valdymas ir tinklo prieigos jungiklis"
```

---

### Task 11: Dokumentai — atšaukti „autentikacijos nėra"

**Files:**
- Modify: `README.md`, `CLAUDE.md`
- Test: nėra (dokumentai)

**Interfaces:**
- Consumes: 2–10 užduočių elgseną.
- Produces: nieko.

- [ ] **Step 1: Perrašyti README skiltį „Saugumas namų tinkle"**

Pakeisti teiginį, kad autentikacijos nėra, į dabartinę tvarką: serveris pagal nutylėjimą klauso tik `127.0.0.1`; tinklo prieiga įjungiama nustatymuose ir reikalauja PIN; PIN pakeitimas atjungia visus įrenginius; pakeitimas įsigalioja paleidus programą iš naujo. Palikti įspėjimą, kad tinkle, kuriuo nepasitiki, prieigos geriau neįjungti.

- [ ] **Step 2: Papildyti README skiltį „Naudojimas"**

Įrašyti, kad planšetė pirmą kartą paprašo PIN, o kodas nustatomas tray meniu → Nustatymai.

- [ ] **Step 3: Pataisyti CLAUDE.md konvenciją**

Punktą „Autentikacijos nėra sąmoningai" pakeisti tuo, kas galioja dabar: loopback praleidžiamas be klausimų; tinklo užklausoms reikia pasirašyto slapuko; PIN maiša niekada negrįžta per API; nustatymų validacija ir toliau privalo gyventi `core/settings.ts`. Pridėti eilutę, kad `core/pin.ts` naudoja `node:crypto` ir todėl `ui/` jo neimportuoja niekada.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Dokumentai: autentikacija nebėra „sąmoningai nėra\""
```

---

## Kas lieka kitiems planams

- **2 dalis (spec §5):** `core/i18n.ts`, dvikalbė sąsaja, klaidų vertimas pagal `error.code`, 465 lietuviškų literalų perkėlimas testuose į `data-testid`.
- **3 dalis (spec §6–7):** tikroji `appx` konfigūracija su Partner Center tapatybe, `privateNetworkClientServer`, autostarto šaka ir duomenų katalogo sprendimas pagal 1 užduoties matavimą.
