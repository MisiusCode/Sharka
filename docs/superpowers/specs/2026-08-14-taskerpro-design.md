# TaskerPro — dizaino specifikacija

**Data:** 2026-08-14
**Būsena:** įgyvendinta; dalis sprendimų vėliau pakeista — žr. žemiau

> ## Vėlesni pakeitimai
>
> Šis dokumentas yra **2026-08-14 sprendimų įrašas**, ne dabartinės sistemos
> aprašas. Jis paliktas nepakeistas, kad matytųsi, kas ir kada buvo nuspręsta.
> Nuo tada trys sprendimai pakeisti atskiromis specifikacijomis:
>
> | Kas pakeista | Kur | Kas galioja dabar |
> |---|---|---|
> | Pasikartojančių užduočių nedarom (13 sk.) | `2026-08-17-pasikartojancios-uzduotys-design.md` | Yra: stulpelis `repeat`, savaitės arba mėnesio diena. Pažymėta atlikta užduotis peršoka į kitą kartą |
> | Grupavimas turi dvi reikšmes (7, 9 sk.) | `2026-08-17-ka-padariau-design.md` | Trys: `Datos \| Progresas \| Padaryta` |
> | Atsarginių kopijų nebuvo | `2026-08-17-atsargines-kopijos-design.md` | Kartą per parą bazė ir CSV į naudotojo nurodytą aplanką |
>
> Dėl `repeat` stulpelio `SCHEMA_VERSION` tapo 2 — tai pirmoji projekto
> migracija. Dabartinės sistemos aprašo ieškok `README.md`.

## 1. Tikslas

Mažų užduočių valdymo sistema vienam žmogui, dirbančiam prie Windows kompiuterio ir kartais prie planšetės. Pagrindinis reikalavimas — nauja užduotis sukuriama per porą sekundžių, nepaliekant to, ką darai: karštasis klavišas, tekstas, Enter. Antras reikalavimas — sistema pati primena, kas šiandien neatlikta.

Kompiuteris yra ir serveris, ir pagrindinis klientas. Planšetė jungiasi naršykle per namų WiFi.

## 2. Priimti sprendimai

| Klausimas | Sprendimas |
|---|---|
| Naudotojai | Vienas savininkas, keli įrenginiai. Jokių paskyrų, priskyrimų, dalinimosi |
| Hostingas | Kompiuteris namų tinkle. Jokio debesies, jokio išorinio tiekėjo |
| Prieiga | Tik namų tinklas (`http://<kompo-ip>:8080`). Jokio HTTPS, tunelių, VPN |
| Technologijos | Electron + Node.js, Express, SQLite (`better-sqlite3`) |
| Greitas įvedimas | Globalus hotkey **ir** tray ikona — tas pats langelis |
| Termino nurodymas | Čipai `Šiandien / Rytoj / Data…` + laiko laukelis + prioriteto taškai |
| Kolonos | `Šiandien / Rytoj / Per savaitę / Vėliau`, perjungiama į `Reikia padaryti / Vykdoma / Atlikta` |
| Užduotis be datos | Yra šiandienos užduotis. Neatlikta persiverčia į kitą dieną ir lieka „Šiandien" |
| Atliktos | Slepiamos, rodomos jungikliu „Rodyti atliktas" |
| Filtrai | Tik prioriteto. Datos filtro nėra — data jau yra grupavimas |
| Priminimai | Sisteminė dienos apžvalga + užduoties žadintuvas |
| Tema | Šviesi / Tamsi / Pagal sistemą |

## 3. Architektūra

Vienas Electron procesas, paleidžiamas kartu su Windows. Jame gyvena SQLite failas (`%APPDATA%/taskerpro/tasks.db`), Express serveris prie `0.0.0.0:8080`, tray ikona, globalus hotkey ir priminimų planuoklis.

**Esminis sprendimas:** tray langelis kreipiasi į tą patį HTTP API kaip ir planšetė, tik per `127.0.0.1`. Nėra atskiro IPC kelio prie duomenų. Viena duomenų prieigos implementacija, kurią naudoja visi klientai; tray langelis yra tiesiog dar vienas to paties web app'o ekranas.

### Moduliai

**`core/`** — dalykinė logika be Electron ir be Express. Testuojama paprastu Node be jokio lango.

- `db.ts` — schema, migracijos, ryšys
- `tasks.ts` — CRUD, kolonų priskyrimo taisyklės, rūšiavimas
- `settings.ts` — nustatymų skaitymas ir rašymas
- `reminders.ts` — planuoklis: žadintuvai ir dienos apžvalga
- `clock.ts` — įšvirkščiama laiko funkcija (žr. 12 sk.)

**`server/`** — Express: REST API, statiniai web UI failai, SSE srautas. Tik transportas; dalykinių taisyklių čia nėra.

**`desktop/`** — Electron klijai: tray, `globalShortcut`, langų kūrimas ir pozicionavimas, autostartas, vieno egzemplioriaus užraktas. Nieko nežino apie SQLite.

**`ui/`** — bendras front-end kodas: `board/`, `quick-add/`, `alarm/`, `settings/`. Bendri komponentai — užduoties kortelė, termino redagavimo eilutė (čipai + laikas + prioritetas), temos kintamieji.

### Gyvi atnaujinimai

`GET /api/events` — SSE srautas. Po kiekvieno pakeitimo serveris siunčia `{type:'tasks-changed'}`, o klientas persikrauna sąrašą. Duomenų kiekis mažas (šimtai užduočių), tad diferencijuoti pakeitimus neverta — vienas signalas panaikina visą sinchronizacijos klaidų klasę. Pažymėjus užduotį planšetėje, tray sąrašas atsinaujina iš karto ir atvirkščiai.

## 4. Duomenų modelis

```sql
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,              -- uuid v4
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'todo',  -- todo | doing | done
  priority      INTEGER NOT NULL DEFAULT 2,    -- 1 aukštas, 2 vidutinis, 3 žemas
  due_at        TEXT,                          -- ISO 8601 vietinis laikas arba NULL
  due_has_time  INTEGER NOT NULL DEFAULT 0,    -- 0 = tik data, 1 = data + laikas
  remind_at     TEXT,                          -- NULL = be žadintuvo
  reminded_at   TEXT,                          -- kada suveikė; NULL = dar ne
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT
  -- PAKEISTA: vėliau pridėtas `repeat TEXT` (NULL | 'w:N' | 'm:N'),
  -- dėl kurio SCHEMA_VERSION tapo 2. Žr. pasikartojančių užduočių specifikaciją.
);

CREATE INDEX idx_tasks_due ON tasks(due_at);
CREATE INDEX idx_tasks_remind ON tasks(remind_at) WHERE remind_at IS NOT NULL;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### Trys taisyklės, išplaukiančios iš schemos

**Nėra rankinio rikiavimo kolonoje.** Kortelės rūšiuojamos automatiškai: `due_at` didėjimo tvarka (NULL — gale), tada `priority` (1 pirmas), tada `created_at`. Tempimas keičia datą arba būseną, ne vietą sąraše. Todėl `sort_order` stulpelio nėra.

Šalutinis efektas, kurio ir norima: „Šiandien" kolonoje pradelstos užduotys (praėjusi data) atsiduria viršuje, po jų šiandienos datuotos, gale — bedatės.

**`due_at IS NULL` reiškia „šiandien".** Data rašoma tik tada, kai užduotis atidedama į ateitį. Todėl raudona „pradelsta" žymė lieka prasminga: ji rodoma tik toms, kurios turėjo realų terminą ir jį praleido. Bedatė užduotis niekada nėra pradelsta — ji tiesiog vis dar šiandienos darbas.

**Laikas reiškia žadintuvą.** Nurodei „Rytoj 18:00" — `due_at` ir `remind_at` nustatomi kartu, `due_has_time = 1`. Nurodei tik „Rytoj" — `remind_at` lieka `NULL`, skambučio nebus. `remind_at` laikomas atskirai nuo `due_at`, kad atidėjimas 10 minučių nekeistų paties termino.

### Nustatymų raktai

Serveryje (bendri visiems įrenginiams):

| Raktas | Reikšmės | Numatytoji |
|---|---|---|
| `grouping` | `date` \| `status` | `date` |
| `theme` | `light` \| `dark` \| `system` | `system` |
| `sound` | `always` \| `alarms` \| `off` | `alarms` |
| `digest_times` | JSON masyvas `"HH:MM"` | `["10:00","15:30"]` |
| `port` | sveikasis | `8080` |
| `hotkey` | Electron akceleratorius | `Ctrl+Alt+Space` |
| `autostart` | `true` \| `false` | `true` |
| `last_digest` | ISO laiko žyma | — |
| `schema_version` | sveikasis | — |

`localStorage` kiekviename įrenginyje (trumpalaikė peržiūros būsena): prioriteto filtras, „Rodyti atliktas".

Skirstymo principas: kas keičia sistemos elgseną arba yra ilgalaikis skonio dalykas — serveryje; kas yra momentinis žiūrėjimo būdas — įrenginyje.

## 5. API

Visi atsakymai — JSON. Klaidos: `{ error: { code, message } }` su atitinkamu HTTP kodu.

| Metodas | Kelias | Paskirtis |
|---|---|---|
| `GET` | `/api/tasks` | Visos užduotys. Kiekis mažas, filtruojama kliente |
| `POST` | `/api/tasks` | `{ title, due_at?, due_has_time?, priority? }` |
| `PATCH` | `/api/tasks/:id` | Bet kuris laukas: `title`, `status`, `priority`, `due_at`, `due_has_time`, `remind_at` |
| `DELETE` | `/api/tasks/:id` | Ištrina galutinai |
| `POST` | `/api/tasks/:id/snooze` | `{ minutes }` → `remind_at = dabar + minutes`, `reminded_at = NULL` |
| `GET` | `/api/settings` | Visi serverio nustatymai |
| `PATCH` | `/api/settings` | Dalinis atnaujinimas |
| `GET` | `/api/events` | SSE srautas |

**Šoniniai efektai, vykdomi serveryje:**

- `status` pakeitus į `done` — nustatomas `completed_at`, o `reminded_at` užpildomas, kad žadintuvas nebeskambėtų
- `status` pakeitus iš `done` — `completed_at` nuvalomas
- **Pakeitus `remind_at` arba `due_at`, `reminded_at` nuvalomas.** Be šios taisyklės kartą nutildyta („Uždaryti") užduotis, perkelta į kitą dieną, naujuoju laiku nebesuskambėtų
- Bet kuris pakeitimas nustato `updated_at` ir siunčia SSE signalą

## 6. Grupavimas, tempimas, filtrai

Kolonos skaičiuojamos **kliente** iš `due_at` pagal to įrenginio vietinę datą. Kompiuteris ir planšetė yra toje pačioje laiko juostoje, o skaičiavimas kliente reiškia, kad kiekvienas įrenginys naudoja savo „šiandien" — tai teisinga elgsena apie vidurnaktį.

### Datos rodinys

| Kolona | Kas patenka | Ką priskiria įtempus |
|---|---|---|
| Šiandien | `due_at IS NULL` arba termino data ≤ šiandien | jei turi laiką — šiandien tuo pačiu laiku; jei ne — `due_at = NULL`, `remind_at = NULL` |
| Rytoj | šiandien + 1 | šiandien + 1, laikas išsaugomas |
| Per savaitę | šiandien + 2 … šiandien + 7 | šiandien + 7, laikas išsaugomas |
| Vėliau | šiandien + 8 ir toliau | šiandien + 8, laikas išsaugomas |

Savaitė skaičiuojama slenkamai, ne kalendoriškai. Tai sąmoningas pasirinkimas: kalendorinė savaitė reikštų, kad šeštadienį ir sekmadienį kolona būtų tuščia ir į ją nebūtų galima nieko įmesti, tad reikėtų tuščių intervalų tikrinimo ir kolonų pilkinimo. Slenkant nė viena kolona niekada nebūna negalima.

Perkeliant užduotį, turinčią laiką, `remind_at` juda kartu su `due_at` — išlaikoma ta pati valanda naują dieną.

### Progreso rodinys

Kolonos `Reikia padaryti / Vykdoma / Atlikta`, atitinkančios `status` reikšmes `todo / doing / done`. Tempimas keičia tik `status`. Datos lieka matomos ant kortelių.

### Perjungiklis

Viena juosta lentos viršuje: `Datos | Progresas`. Pasirinkimas saugomas serveryje (`grouping`), tad kompiuteris ir planšetė visada rodo tą patį rodinį. Tray langelio sąrašas naudoja tą patį nustatymą.

> **Pakeista.** Perjungiklis turi tris reikšmes — pridėta `Padaryta`. Tray langelis ir dienos apžvalga naujosios reikšmės nepaiso ir grįžta prie `Datos`, nes jie skirti tam, kas dar nepadaryta. Žr. `2026-08-17-ka-padariau-design.md`.

### Filtrai

- **Prioritetas** — trys čipai (aukštas / vidutinis / žemas), galima pažymėti kelis; nepažymėtas nė vienas reiškia „visi"
- **Rodyti atliktas** — jungiklis. Išjungtas (numatytoji) — datos rodinyje atliktos nematomos. Įjungus jos pasirodo savo datos kolonoje, perbrauktos ir pilkos. Progreso rodinyje kolona „Atlikta" rodoma visada.

Datos filtro nėra sąmoningai: datos rodinyje jis dubliuotų kolonas, o progreso rodinyje datos matomos ant kortelių.

## 7. Greitas įvedimas

Langelis iškviečiamas dviem būdais — globaliu karštuoju klavišu (numatytasis `Ctrl+Alt+Space`) arba paspaudus tray ikoną. Abu atidaro tą patį langą.

**Langas:** berėmis, ~380×480, `alwaysOnTop`, `skipTaskbar`, pozicionuojamas virš tray srities apatiniame dešiniajame kampe. Užsidaro praradus fokusą arba paspaudus Esc — kaip ir Windows laikrodžio iškrentantis langas.

**Turinys iš viršaus į apačią:**

1. Įvedimo laukas su automatiniu fokusu
2. Viena eilutė: čipai `Šiandien | Rytoj | Data…` (Šiandien pažymėtas iš anksto), laiko laukelis `🕐 --:--`, trys prioriteto taškai
3. Slenkamas užduočių sąrašas su sekcijų antraštėmis pagal aktyvų grupavimą. Eilutėje: varnelė, pavadinimas, prioriteto žymė; užvedus pele — × ištrynimui
4. Nuoroda „Atidaryti lentą" — atidaro Electron langą su ta pačia lenta

**Elgsena:**

- **Enter išsaugo ir uždaro langą.** Norint įvesti antrą užduotį — hotkey paspaudžiamas iš naujo. Tai vienas klavišo paspaudimas daugiau, bet nulis taisyklių, kurias reikėtų prisiminti
- Čipas `Šiandien` reiškia `due_at = NULL`
- `Data…` atidaro kompaktišką kalendorių
- Laikas įvedamas laisvai: `18`, `18:00`, `1800` — visi atpažįstami kaip 18:00
- **Įvedus vien laiką be datos** imama šiandiena; jei ta valanda jau praėjo — rytdiena
- Tuščias pavadinimas neišsaugomas

## 8. Priminimai

Dviejų rūšių. Tik antroji reikalauja ką nors nustatyti prie užduoties.

### Dienos apžvalga (sisteminė)

10:00 iššoka langas su šios dienos užduočių sąrašu — visos „Šiandien" kolonos užduotys, kurios neatliktos. Varneles galima dėti tiesiog tame lange. 15:30 langas grįžta, jei kas nors dar liko, ir rodo tik likusias. Nieko nelikę — nepasirodo išvis.

Laikai redaguojami nustatymuose (`digest_times`) — masyve gali būti vienas ar keli. Taisyklė bendra: kiekvienu nurodytu laiku rodomos visos tuo metu neatliktos šios dienos užduotys. Todėl pirmoji apžvalga rodo visą dieną, o vėlesnės savaime rodo tik tai, kas liko. Apžvalga nesikartoja kas 10 minučių — ji rodoma tik nustatytais laikais.

**Praleistos apžvalgos pagavimas:** planuoklis lygina dabartį su `last_digest`. Jei šiandienos apžvalgos laikas jau praėjo, o `last_digest` už jį ankstesnis, apžvalga parodoma pabudus. Taip apžvalga nedingsta, jei kompiuteris 10:00 miegojo.

### Užduoties žadintuvas

Skirtas užduotims, kurioms nurodytas konkretus laikas (`remind_at IS NOT NULL`).

- Suveikia nurodytu metu. Nepaliestas langas po 60 sekundžių užsidaro pats ir grįžta po 10 minučių — ir taip, kol paspaudžiamas mygtukas. Automatinis užsidarymas naudoja tą pačią atidėjimo logiką kaip mygtukas „Atidėti 10 min" (`remind_at = dabar + 10 min`, `reminded_at = NULL`), tad atskiros kartojimo mechanikos nereikia
- Mygtukai: **Atlikta** (`status = done`, žadintuvas nunyksta), **Atidėti 10 min** (`remind_at = dabar + 10 min`, `reminded_at = NULL`), **Uždaryti** (`reminded_at` lieka užpildytas, tad daugiau nebeskambės, bet užduotis lieka lentoje)
- Suveikus kelioms iš karto — eilė: rodomas vienas langas, kitas pasirodo uždarius ankstesnį
- Pažymėjus užduotį atlikta bet kur (taip pat ir planšetėje) žadintuvas nunyksta

**Langas:** berėmis, `alwaysOnTop`, apatiniame dešiniajame kampe virš užduočių juostos — toje pačioje vietoje kaip greito įvedimo langelis. Rodo pavadinimą, laiką ir prioritetą. Jei priminimas vėluoja (kompiuteris miegojo), rodomas prierašas „vėluoja 40 min".

### Garsas

Vienas nustatymas su trimis reikšmėmis:

- **Visada** — skamba ir dienos apžvalga, ir žadintuvas
- **Tik žadintuvams** (numatytoji) — apžvalga pasirodo tyliai, konkretaus laiko žadintuvas skamba
- **Išjungta** — jokio garso

Perjungiamas vienu spustelėjimu iš tray meniu, tad vakare nutildyti — vienas veiksmas. Pačiame žadintuvo lange yra atskiras mygtukas einamajam skambučiui nutildyti, nekeičiant nustatymo. Garso failas vienas, įpakuotas į programą, grojamas ratu iki atsakymo.

### Planuoklis

`core/reminders.ts` tikrina kas 15 sekundžių:

1. Užduotys, kurių `remind_at <= dabar`, `reminded_at IS NULL` ir `status != 'done'` → į žadintuvo eilę, nustatomas `reminded_at`
2. Ar atėjo dienos apžvalgos laikas ir ar ji dar nerodyta (`last_digest`)

Periodinis tikrinimas pasirinktas vietoj `setTimeout` kiekvienai užduočiai sąmoningai: kompiuteris užmiega, budinamas, keičiasi sisteminis laikrodis, o taimeriai tokių įvykių neišgyvena. Kaina — priminimas gali vėluoti iki 15 sekundžių, o tai žadintuvui nesvarbu.

## 9. Lenta

Ta pati lenta veikia Electron lange kompiuteryje ir planšetės naršyklėje — tas pats kodas, tas pats URL.

**Viršutinė juosta:** grupavimo perjungiklis `Datos | Progresas` (**pakeista:** dabar trys reikšmės, pridėta `Padaryta`), trys prioriteto čipai, jungiklis „Rodyti atliktas".

**Kortelė:** pavadinimas, prioriteto juostelė kairiajame krašte, datos/laiko žymė (rodoma tik jei `due_at` nėra `NULL`), varnelė ir ×. Paspaudus pavadinimą jis redaguojamas vietoje — Enter išsaugo, Esc atšaukia, jokio modalinio lango. Paspaudus datos žymę (arba jos vietą, jei datos nėra) atsiveria ta pati čipų eilutė kaip tray langelyje — tas pats bendras `ui/` komponentas.

**Planšetėje** kolonos slenkamos horizontaliai, po vieną beveik per visą plotį. Tempimas pirštu veikia.

**Vizualiai:** jokių šešėlių ir apvalinimų perteklaus, sistemos šriftas. **Spalva lentoje naudojama tik vienam dalykui — prioritetui** (raudona / geltona / pilka juostelė), plius raudonas tekstas pradelstoms. Viskas kita — pilkų atspalviai. Taip lenta perskaitoma iš karto, be legendos.

**Tema:** spalvos aprašomos CSS kintamaisiais, nustatymas `Šviesi / Tamsi / Pagal sistemą` (numatytoji — pagal sistemą, per `prefers-color-scheme`). Galioja visiems ekranams: lentai, tray langeliui, žadintuvui, nustatymams. Prioriteto spalvos abiejose temose parenkamos taip, kad kontrastas liktų skaitomas.

## 10. Nustatymai

Atskiras langas, iškviečiamas iš tray meniu:

- Portas
- Karštojo klavišo kombinacija
- Garsas (Visada / Tik žadintuvams / Išjungta)
- Dienos apžvalgos laikai
- Tema
- Autostartas su Windows
- **Rodomi šio kompiuterio LAN adresai su portu** — kad būtų ką suvesti planšetėje

Tray meniu greitiesiems veiksmams: „Nauja užduotis", „Atidaryti lentą", garso perjungimas, „Nustatymai", „Išjungti".

## 11. Klaidų valdymas

**Portas užimtas** — bandomas kitas, iki penkių kartų. Nepavykus rodomas tray pranešimas su nuoroda į nustatymus. Pakeitus portą nustatymuose programa turi būti paleista iš naujo; nustatymų lange tai pasakoma tiesiai.

**Karštasis klavišas užimtas kitos programos** — `globalShortcut.register` grąžina `false`. Tokiu atveju rodomas tray pranešimas „Kombinacija užimta, pasirink kitą" su nuoroda į nustatymus. Programa vis tiek veikia — tray ikona lieka.

**Windows ugniasienė** — pirmą kartą paleidus sistema paprašys leidimo įeinančiam ryšiui. Be jo planšetė neprisijungs, tad diegimo instrukcijoje tai nurodoma atskirai.

**SQLite rašymo klaida** — matoma sąsajoje, ne tik žurnale. Žurnalas rašomas į `%APPDATA%/taskerpro/logs/`, rotuojamas.

**Nutrūkęs ryšys** (planšetė prarado WiFi arba kompiuteris užmigo) — lentoje juosta „Nėra ryšio su serveriu". SSE jungiasi iš naujo didėjančiu intervalu nuo 1 iki 30 sekundžių. **Veiksmai be ryšio atmetami su pranešimu, o ne kaupiami eilėje** — offline režimo sąmoningai nėra, tad tylus veiksmų kaupimas tik meluotų apie tai, kas išsaugota.

**Antras programos paleidimas** — vieno egzemplioriaus užraktas; naujas procesas tiesiog parodo tray langelį ir baigia darbą.

**Migracijos** — schemos versija laikoma `settings` lentelėje, migracijos vykdomos startuojant. Prieš vykdant daroma `tasks.db.bak` kopija.

## 12. Testavimas

Dirbama TDD principu. Svarbiausia prielaida: `core/` moduliuose laikas imamas per įšvirkščiamą laikrodžio funkciją, o ne `Date.now()` tiesiogiai. Be to nė vienas iš įdomiausių testų neįmanomas.

**`core/` vienetiniai** (Vitest, SQLite atmintyje):

- Kolonų priskyrimas kraštinėse datose: mėnesio riba, vasario 29, vasaros ir žiemos laiko persukimas, vidurnaktis
- Tempimo → datos priskyrimo taisyklės, įskaitant laiko ir `remind_at` išsaugojimą
- Rūšiavimas kolonoje: pradelstos viršuje, bedatės gale
- Planuoklis: suveikimas, atidėjimas, kartojimas kas 10 minučių, praleistų priminimų pagavimas po miego, žadintuvo nunykimas pažymėjus atlikta
- `reminded_at` nuvalymas pakeitus `remind_at` arba `due_at`: nutildyta ir į kitą dieną perkelta užduotis privalo suskambėti naujuoju laiku
- Dienos apžvalgos formavimas 10:00 ir 15:30, tuščios apžvalgos praleidimas, praleistos apžvalgos pagavimas per `last_digest`
- Užduočių CRUD ir šoniniai efektai (`completed_at`, `updated_at`)
- Laiko įvesties atpažinimas: `18`, `18:00`, `1800`; praėjusi valanda → rytdiena

**`server/` integraciniai** (supertest): REST maršrutai, validacija, SSE signalo išsiuntimas po kiekvieno pakeitimo.

**Lenta** (Playwright su paruošta DB): grupavimo perjungimas, prioriteto filtrai, „Rodyti atliktas", tempimas tarp kolonų, redagavimas vietoje, tema.

**`desktop/`** — rankinis patikros sąrašas: tray ikona ir meniu, hotkey, langų pozicijos ant skirtingų ekrano raiškų, fokuso praradimo elgsena, autostartas, ugniasienės pranešimas. Electron langų automatizavimas kainuotų daugiau, nei duotų.

## 13. Ko sąmoningai nedarom

- Autentikacijos. Namų tinklas, vienas naudotojas — serveris pasiekiamas visiems tinkle esantiems įrenginiams, ir tai priimta sąmoningai
- Offline režimo planšetėje
- ~~Pasikartojančių užduočių~~ — **sprendimas atšauktas 2026-08-17.** Naudojimas
  jį paneigė: „išnešti šiukšles antradieniais" yra tiksliai ta smulkių užduočių
  rūšis, kuriai visas įrankis skirtas. Žr. `2026-08-17-pasikartojancios-uzduotys-design.md`
- Subužduočių, žymų, priedų, komentarų, aprašymo laukų
- Kelių naudotojų, užduočių priskyrimo
- Sinchronizacijos į debesį, mobilios programėlės
- Rankinio kortelių rikiavimo kolonoje
- Prieigos iš už namų tinklo ribų

## 14. Fazės

1. **`core` + `server` + lenta naršyklėje** — jau veikianti sistema: užduotys kuriamos, grupuojamos, filtruojamos, pasiekiamos iš planšetės
2. **Electron apvalkalas** — tray ikona, globalus hotkey, greito įvedimo langelis, lentos langas
3. **Priminimai** — planuoklis, žadintuvo langas, dienos apžvalga, garso valdymas
4. **Nustatymų langas, autostartas, diegimo failo pakavimas**

Kiekviena fazė baigiasi kažkuo, kuo galima naudotis.

> **Pakeista.** Keturios fazės įgyvendintos 2026-08-14…17. Po jų, jau naudojant
> sistemą, pridėtos dar trys funkcijos, kiekviena su savo specifikacija ir planu:
> atsarginės kopijos, pasikartojančios užduotys ir „Padaryta" rodinys — būtent
> tokia eile, nes kopijos turėjo egzistuoti anksčiau už pirmąją schemos
> migraciją, o „Padaryta" rodinys turėjo žinoti, kad pasikartojančių jame nebus.
