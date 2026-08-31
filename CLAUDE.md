# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Šarka — asmeninė užduočių sistema namų tinklui: vienas Electron procesas, kuriame gyvena
SQLite bazė, Express serveris ant `0.0.0.0`, tray ikona, globalus karštasis klavišas ir
priminimų planuoklis. Ta pati lenta atidaroma Electron lange ir planšetės naršyklėje.

## Komandos

    npm test                                  # visi vienetiniai ir integraciniai (Vitest, jsdom)
    npx vitest run tests/core/tasks.test.ts   # vienas failas
    npx vitest run -t "pradelsta"             # vienas testas pagal pavadinimo fragmentą
    npm run typecheck                         # tsc --noEmit
    npm run test:e2e                          # Playwright; pats susibuildina UI ir pakelia serverį
    npx playwright test -g "grupavimo"        # vienas e2e testas

    npm run app        # build + Electron (visa programa iš kodo)
    npm start          # tik serveris per tsx; statiką ima iš dist/ui, tad prieš tai reikia `npm run build:ui`
    npm run dev:ui     # Vite su karštu perkrovimu; /api proxy į 8080, tad kartu turi suktis `npm start`
    npm run dist       # NSIS diegimo failas į dist-installer/

`npm run build` = `tsc -p tsconfig.build.json` (core/server/desktop → `dist/`) + `vite build`
(penki HTML įėjimo taškai → `dist/ui/`) + `preload.cjs` bei `assets/` nukopijavimas.

## Architektūra

**Sluoksniai ir vienintelė kryptis, kuria leidžiama importuoti:**

- `src/core/` — visa dalykinė logika. Be Electron, be Express. Laikas imamas per įšvirkščiamą
  `Clock` (`core/clock.ts`), niekada `Date.now()` tiesiogiai — be to neįmanomi įdomiausi testai.
- `src/server/` — Express: REST, statika, SSE. **Tik transportas**: validacija ir HTTP kodai,
  jokių dalykinių taisyklių.
- `src/desktop/` — Electron klijai: tray, langai, hotkey, autostartas, žadintuvų eilė.
- `src/ui/` — React (penki ekranai: lenta, greitas įvedimas, žadintuvas, apžvalga, nustatymai).

**`ui/` importuoja tiesiai iš `core/`** (`buckets`, `completed`, `datetime`, `types`) — Vite juos
sudeda į naršyklės paketą. Todėl bet kuris `core` modulis, kurį naudoja `ui`, privalo likti be
Node builtinų ir be `better-sqlite3` vykdymo metu (tipai imami per `import type`).

**Duomenys eina tik per HTTP — ir Electron viduje.** Tray langelis, žadintuvas ir nustatymai
kreipiasi į tą patį `http://127.0.0.1:<portas>/api`, kaip ir planšetė. Atskiro IPC kelio prie
duomenų nėra; `preload.cjs` tiltas siauras sąmoningai (`popup:hide`, `board:open`,
`backup:pick`) ir yra vienintelis CJS failas projekte (Electron preload visada kraunamas kaip CJS).

**Dvi atskiros to paties failo bazės rankenos (WAL):** vieną atidaro `startServer()`, antrą —
`desktop/main.ts` planuokliams ir nustatymų sekyklei. Todėl `main.ts` išjungimo tvarka yra
subtili: `before-quit` sustabdo viską, kas liečia `db`, ir tik tada `db.close()`; `will-quit`
tvarko likusius langus ir hotkey. Prieš keičiant ten ką nors — perskaityk komentarus vietoje.

**Gyvi atnaujinimai:** po kiekvienos mutacijos serveris siunčia SSE `{type:'tasks-changed'}`, o
klientas persikrauna **visą** sąrašą. Diferencijuotų atnaujinimų nėra ir nereikia.

**Pollingas vietoj taimerių ir IPC:** priminimų planuoklis, kopijų planuoklis ir nustatymų
sekyklė `main.ts` — visi kas 15 s. `setTimeout` kiekvienai užduočiai neišgyvena kompiuterio
miego ir sisteminio laikrodžio pakeitimo.

**Kolonos skaičiuojamos kliente** (`core/buckets.ts`, `core/completed.ts`) iš to įrenginio
vietinės datos. Serveris apie kolonas nieko nežino.

**Nustatymai skyla į du:** kas keičia sistemos elgseną ar yra ilgalaikis skonis — serveryje
(`core/settings.ts`, bendra visiems įrenginiams); kas yra momentinis žiūrėjimo būdas (prioriteto
filtras, „Rodyti atliktas") — `localStorage` (`ui/localPrefs.ts`).

## Dalykinės taisyklės, kurių negalima dubliuoti sąsajoje

Visos gyvena `core/` ir todėl nemokamai galioja lentai, tray langeliui, apžvalgai ir žadintuvui:

1. **`due_at IS NULL` reiškia „šiandien"**, ne „be datos". Data rašoma tik sąmoningai atidedant.
   Bedatė užduotis niekada nėra pradelsta.
2. **Laikas reiškia žadintuvą.** „Rytoj" — terminas; „Rytoj 18:00" — `remind_at` iššauks langą su
   garsu. `remind_at` laikomas atskirai nuo `due_at`, kad atidėjimas nekeistų paties termino.
3. **Pasikartojanti užduotis (`repeat`) pažymėta atlikta neužsidaro** — `core/tasks.ts` peršoka
   terminą į kitą kartą, `status` lieka `todo`, `completed_at` nenustatomas. Pasekmė: tokios
   užduotys niekada nepatenka į „Padaryta" rodinį.
4. **Pakeitus `remind_at` arba `due_at`, `reminded_at` nuvalomas** — kitaip kartą nutildyta ir į
   kitą dieną perkelta užduotis naujuoju laiku nebesuskambėtų.
5. **Rankinio rikiavimo nėra.** Rūšiuojama `due_at` → `priority` → `created_at`; tempimas keičia
   datą arba būseną, ne vietą sąraše.

Produkto ribos (ko nekurti: aprašymų, subužduočių, žymų, projektų, grafikų, modalų naujai
užduočiai) surašytos `docs/frontend-dizaino-promptas.md` — tai tiksliausias produkto taisyklių
šaltinis prieš liečiant `ui/`.

## Schemos migracijos

`core/db.ts`: `MIGRATIONS` masyvas ir `SCHEMA_VERSION`. Nauja migracija = **prirašyti eilutę į
masyvo galą ir padidinti versiją**; senų elementų keisti negalima. Migracija ir versijos įrašas
vykdomi vienoje transakcijoje, o prieš tai (tik jau egzistuojančiai bazei) daroma `tasks.db.bak`.

## Aplinkos kintamieji

- `SARKA_DATA` — duomenų katalogas vietoj `%APPDATA%/sarka`.
- `SARKA_PORT` — portas vietoj to, kuris bazėje (serveris jį skaito tik startuodamas; užimtą
  portą pakeičia gretimu, iki penkių bandymų).
- `SARKA_RESET=1` — **ištrina visą `SARKA_DATA` katalogą** paleidžiant. Veikia tik kartu su
  `SARKA_DATA` ir skirtas tik `start:test`. Niekada su tikru duomenų katalogu.

## Testavimas

Dirbama TDD principu. Visų keturių sluoksnių testai sukasi po Vitest/jsdom
(`tests/core|server|desktop|ui`), e2e — atskirai.

- `core/` — SQLite atmintyje (`:memory:`) ir `fixedClock`.
- `server/` — supertest prieš `createApp()` su įšvirkštomis saugyklomis.
- `desktop/` — moduliai priima Electron API per parametrus (`ShortcutApi`, `AutostartApi`,
  `ReminderWindowFactory`), tad testuose realaus Electron nėra; vienintelė išimtis —
  `reminderWindows.test.ts` su `vi.mock('electron')` dėl `screen`. Pats `main.ts` netestuojamas,
  nes tai tik surinkimas — visa logika, kurią verta tikrinti, iškelta į atskirus modulius.
- `tests/e2e/` — Playwright prieš gyvą serverį (`SARKA_DATA=.e2e`, portas 8099). **Visi testai
  dalijasi viena baze**, tad `afterEach` ištrina užduotis ir grąžina `grouping` į `date`; naujas
  testas privalo palikti būseną tokią, kokią rado.

## Konvencijos

- **Viskas lietuviškai:** sąsajos tekstai, klaidų žinutės (taip pat ir API `error.message`), kodo
  komentarai, commit'ai ir `docs/`. Kai kur lietuviški ir identifikatoriai.
- ESM visame projekte: reliatyvūs importai rašomi su `.js` galūne net iš `.ts` failų.
- Komentaruose fiksuojama **kodėl**, ypač ten, kur akivaizdus sprendimas būtų klaidingas
  (išjungimo tvarka, `blur` + tray paspaudimas, `npmRebuild: false`, CSV BOM, `/*splat` Express 5
  kelias). Šalinant tokį kodą pirma perskaityk komentarą — dauguma jų aprašo jau kartą įvykusią
  klaidą.
- **Autentikacijos nėra sąmoningai.** Tas pats atviras `PATCH /api/settings` keičia autostartą,
  portą, karštąjį klavišą ir kopijų aplanką, tad kliento pusės patikros nepakanka — nustatymų
  validacija privalo gyventi `core/settings.ts`.
- `electron-builder.yml` turi `npmRebuild: false` (better-sqlite3 yra N-API su plokščiais
  prebuild'ais). Nekeisti, kol neatsiras tikras ne-N-API natyvus modulis.
- Natyvūs `<input type="date">` (ir `datetime-local`, `month`) draudžiami: Chrome jiems ima
  naršyklės, o ne puslapio kalbą, tad planšetėje jie lieka angliški. Naudok `ui/components/DateField.tsx`.

## Dokumentai

`README.md` — dabartinės sistemos aprašas (įskaitant žinomus apribojimus ir atkūrimo iš kopijos
tvarką). `docs/superpowers/specs/` — sprendimų įrašai jų priėmimo momentu (senesni turi nuorodas
į vėlesnius, juos pakeitusius, tad specifikacija viena savaime nėra dabarties aprašas);
`docs/superpowers/plans/` — įgyvendinimo planai.
