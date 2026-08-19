# Šarka

Užduočių sistema namų tinklui: serveris, kanban lenta, Electron tray programa
su greitu įvedimu, priminimais ir nustatymų langu.

## Diegimas

Paimk `Sarka-Setup-1.0.0.exe` iš `dist-installer/` ir paleisk.
Programa startuoja kartu su Windows ir gyvena tray'uje prie laikroduko.

**Pirmą kartą** Windows paklaus leidimo įeinančiam tinklo ryšiui — atsakyk
„Leisti", kitaip planšetė neprisijungs.

## Naudojimas

- `Ctrl+Alt+Space` arba tray ikona — greitas užduoties įvedimas
- Tray meniu → Atidaryti lentą — kanban lenta
- Tray meniu → Garsas — priminimų garso perjungimas
- Tray meniu → Nustatymai — portas, klavišas, apžvalgos laikai, tema, kopijų
  aplankas
- **Grupavimo perjungiklis** lentos viršuje turi tris reikšmes:
  - **Datos** — `Šiandien / Rytoj / Per savaitę / Vėliau`. Kasdienis rodinys.
  - **Progresas** — `Reikia padaryti / Vykdoma / Atlikta`.
  - **Padaryta** — atliktos užduotys pagal atlikimo laiką
    (`Šiandien / Vakar / Šią savaitę / Anksčiau`), naujausia viršuje, o virš
    kolonų — viena eilutė „Per savaitę padaryta N". Šiame rodinyje kortelės
    **netempiamos**: atlikimo data pasako, kada iš tikrųjų padarei, ir tempimu
    ją keisti neturi prasmės. Nuėmus varnelę užduotis grįžta į darbinę lentą.
    Virš kolonų — laukai **Nuo** ir **Iki** bei mygtukas **„Peržiūrėti"**:
    nurodžius laikotarpį, kolonos pakeičiamos plokščiu sąrašu su antrašte
    „Padaryta: N", o „Grįžti" grąžina įprastą rodinį. Laikotarpis niekur
    nesaugomas — tai vienkartinė užklausa, kuri po perkrovimo grįžta į
    paskutines 30 dienų.
- **Pasikartojanti užduotis** (kortelėje pažymėta ženklu ↻): pažymėjus ją
  atlikta, ji **neužsidaro** — terminas peršoka į artimiausią kitą kartą, o pati
  užduotis lieka „Reikia padaryti". Kartojimas pasirenkamas termino
  redaktoriuje: savaitės diena (kas pirmadienį … kas sekmadienį) arba mėnesio
  diena iš sąrašo (1, 5, 10, 15, 20, 25 arba paskutinė mėnesio diena).
  Pasirinkus šabloną terminas iškart perskaičiuojamas į artimiausią kitą kartą.
  Terminą galima pakeisti rankiniu būdu (data, čipas „Rytoj" ir pan.) — tai
  sankcionuotas būdas vienkart praleisti kartą, neatšaukiant paties kartojimo.

- **Kortelės valdikliai atsiranda užvedus pele**: ištrynimo × ir brūkšnys,
  atveriantis termino redaktorių užduočiai be datos. Bedatė užduotis yra
  šiandienos darbas, tad daugumoje kortelių datos nėra — nuolat rodomas
  brūkšnys keturiasdešimtyje eilučių tiesiog triukšmautų. Jutikliniame ekrane,
  kur užvesti nėra kaip, abu matomi visada.
- **Terminą nuo žadintuvo skiria varpelio ženklas.** „Rugpjūčio 20" yra
  terminas; „🔔 rugpjūčio 20, 18:00" reiškia, kad 18:00 iššoks langas su garsu.
- **Datos laukelis savas, ne naršyklės.** Datą galima arba surinkti ranka
  formatu `yyyy-mm-dd`, arba pasirinkti kalendoriuje — mėnesiai lietuviški,
  savaitė prasideda pirmadieniu. Natyvus `<input type="date">` čia netiktų:
  Chrome jam ima naršyklės, o ne puslapio kalbą, tad planšetėje jis liktų
  angliškas, kad ir kokia būtų programos kalba.

**Iš planšetės:** tray meniu → Nustatymai, ten rodomas adresas, kurį reikia
suvesti planšetės naršyklėje. Planšetėje taikiniai savaime didesni — sąsaja
mato, kad pelės nėra, ir eilutes bei mygtukus paaugina pirštui.

Duomenys laikomi `%APPDATA%/sarka/tasks.db`.

**Atėjusiems iš TaskerPro:** pirmą kartą pasileidusi Šarka pati perkelia seną
`%APPDATA%/taskerpro` aplanką į `%APPDATA%/sarka` su visomis atsarginėmis
kopijomis. Perkeliama tik tada, kai naujoje vietoje duomenų dar nėra; nepavykus
(pvz., failas užrakintas dar veikiančios senos programos) niekas neištrinama —
programa toliau dirba iš seno aplanko ir bando vėl kitą paleidimą.

**Atsarginė kopija:** daroma automatiškai kartą per parą — žr. „Atsarginės
kopijos" skiltį žemiau.

**Portas:** nustatymų lange pakeistas portas įsigalioja tik paleidus programą
iš naujo — serveris jį nuskaito iš duomenų bazės tik startuodamas, gyvo
persijungimo nėra.

### Aplinkos kintamieji

- `SARKA_DATA` — perkelia duomenų katalogą iš numatytosios vietos
  (`%APPDATA%/sarka`) į nurodytą kelią.
- `SARKA_PORT` — priverstinai naudoja nurodytą portą vietoj to, kuris
  saugomas duomenų bazėje.
- `SARKA_RESET` — kai lygu `1` **ir** kartu nurodytas `SARKA_DATA`,
  paleidimo metu visiškai ištrina to katalogo turinį prieš startuojant.
  Skirta tik testams (žr. `start:test`) — niekada nenaudok šito su tikru
  duomenų katalogu, nes tai negrįžtamai sunaikina visas užduotis.

## Kūrimas

    npm install
    npm run app     # paleidžia iš kodo
    npm test        # vienetiniai ir integraciniai testai
    npm run test:e2e
    npm run dist    # supakuoja diegimo failą

    npm run dev:ui   # Vite su karštu perkrovimu, /api nukreipiamas į 8080

## Saugumas namų tinkle

Serveris klausosi `0.0.0.0` ir **neturi autentikacijos** — tai sąmoningas
sprendimas vienam naudotojui namų tinkle. Nuo 4 fazės tas pats atviras
`PATCH /api/settings` gali keisti ne tik užduotis, bet ir nustatymus, liečiančius
operacinę sistemą: autostartą (įrašas Windows registre), globalų karštąjį klavišą
ir portą. Nuo atsarginių kopijų funkcijos šis paviršius auga kokybiškai: tas
pats neautentifikuotas endpointas gali pakeisti ir `backup_dir` — svetimas
įrenginys tavo WiFi tinkle per 15 sekundžių gali nukreipti pilną užduočių bazės
kopiją į savo pasiekiamą tinklo aplanką arba tyliai išjungti kopijas, įrašęs
`last_backup` kaip šiandienos datą. Praktiškai tai reiškia, kad bet kuris
įrenginys tavo WiFi tinkle gali pakeisti šiuos nustatymus. Jei tinkle yra
įrenginių, kuriais nepasitiki, programos ten neleisk.

## Atsarginės kopijos

Kartą per parą į nustatymuose nurodytą aplanką įrašoma visa bazė
(`tasks-2026-08-17.db`) ir jos CSV kopija. Laikomos septynios paskutinės.

CSV skirtas skaityti Excel'iu: skirtukas — kabliataškis, koduotė — UTF-8 su BOM.
Stulpeliai: `Pavadinimas`, `Būsena`, `Prioritetas`, `Terminas`, `Priminimas`,
`Sukurta`, `Atlikta`, `Kartojimas`. Būsenos ir prioritetai jame lietuviški.

**Numatytasis aplankas yra šalia duomenų bazės, ir tai apsaugo tik nuo sugadinto
failo.** Nuo mirusio disko apsaugo tik kopija kitoje vietoje — nurodyk OneDrive,
Dropbox ar tinklo disko aplanką nustatymuose.

Atkūrimas: išjunk programą, kataloge `%APPDATA%\sarka\` ištrink
`tasks.db-wal` bei `tasks.db-shm`, jei jie yra (bazė veikia WAL režimu — švarus
išjungimas šiuos failus pašalina pats, bet atkūrimo prireikia būtent tada, kai
paskutinis išjungimas nebuvo švarus; likęs senas `-wal` failas bus pritaikytas
ant naujai atkurtos bazės ir gali ją sugadinti), tada nukopijuok pasirinktą
`tasks-YYYY-MM-DD.db` vietoje `%APPDATA%\sarka\tasks.db` ir paleisk iš
naujo. Atkūrimo mygtuko sąsajoje sąmoningai nėra — jis prireikia kartą per
gyvenimą, o klaidingai paspaustas sunaikintų dabartinius duomenis.

## Žinomi apribojimai

- **Portą pakeitus reikia paleisti programą iš naujo.** Serveris jį perskaito iš
  duomenų bazės startuojant; gyvo perjungimo nėra. Nustatymų langas apie tai
  įspėja.
- **Nustatymų pakeitimai nepasiekia jau atidarytų langų.** Pakeitus temą lenta
  persidažys tik ją perkrovus; tray meniu garso varnelė lieka sena, nors pats
  garsas persijungia iš karto. Sprendžiama uždarius ir atidarius langą.
- **Diegimo failas atsiranda tik paleidus `npm run dist`** — katalogas
  `dist-installer/` nėra saugomas repozitorijoje.
- **Pasikartojančios užduotys neturi istorijos.** Tai viena užduotis, kuri
  kilnojasi į priekį, o ne eilė atskirų kartų — praėjusių kartų sąrašo nėra
  (sąmoningas sprendimas). Ją ištrynus dingsta ir visi būsimi kartai, ne tik
  artimiausias.
- **„Padaryta" rodinys nerodo pasikartojančių užduočių.** Jos niekada nelieka
  atliktos — pažymėtos jos peršoka į kitą kartą, tad atlikimo laikas joms
  nefiksuojamas. Tai reiškia, kad reguliariausiai daromi darbai savaitės
  suvestinėje nesimatys. Tas pats galioja ir laikotarpio peržiūrai.
- **Jungiklis „Rodyti atliktas" „Padaryta" rodinyje neveikia.** Ten atliktos
  rodomos visada — kitaip rodinys būtų tuščias. Jungiklis lieka matomas, bet
  jo perjungimas šiame režime nieko nekeičia.
- **Apie vidurnaktį atlikta užduotis gali pakliūti į vakarykštį stulpelį.**
  Atlikimo laikas saugomas UTC, o kolonos skaičiuojamos pagal vietinę datą, tad
  tarp 00:00 ir 02:00 (žiemą) arba 03:00 (vasarą) atliktos užduotys „Padaryta"
  rodinyje rodomos viena diena anksčiau. Poslinkis yra vienos dienos ir liečia
  tik istorinį rodinį, tad laiko juostų konvertavimas sąmoningai nedaromas.
