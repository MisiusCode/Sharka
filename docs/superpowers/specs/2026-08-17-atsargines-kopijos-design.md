# TaskerPro: naktinės atsarginės kopijos — dizaino specifikacija

**Data:** 2026-08-17
**Būsena:** patvirtinta, paruošta įgyvendinimo planui

## 1. Problema

Visos užduotys gyvena viename faile `%APPDATA%\taskerpro\tasks.db`. Kopijų nėra nė vienos.

Kode yra `backupBeforeMigrate`, bet ji suveikia tik migruojant jau versijuotą bazę. Prie schemos versijos 1 sąlyga `from > 0 && from < SCHEMA_VERSION` netenkinama niekada. Funkcija **nėra sugedusi** — ji suveiks teisingai, kai atsiras versija 2 — bet ji miega ir niekada nebuvo kasdienė apsauga.

**Nuo ko saugomės:** miręs diskas arba sugadintas failas.

**Nuo ko NE:** netyčia ištrinta užduotis. Tam reikėtų šiukšliadėžės su atskira būsena; jos nestatom. Septynių dienų kopijų istorija duoda dalinę šalutinę naudą — ištrintą užduotį galima išsitraukti rankomis iš vakarykštės kopijos — bet tai nėra šios funkcijos tikslas ir taip nereklamuojama.

## 2. Sprendimas

Kartą per kalendorinę parą į naudotojo nurodytą aplanką rašomi **du failai**:

| Failas | Kam |
|---|---|
| `tasks-2026-08-17.db` | Visa bazė. Iš jos atkuriama viskas |
| `tasks-2026-08-17.csv` | Skaitoma žmogui ir Excel'iui, nereikalauja programos |

Laikomos septynios paskutinės poros; senesnės trinamos.

### Kodėl `VACUUM INTO`, ne failo kopijavimas

Bazė sukasi WAL režimu, tad dalis įrašytų duomenų gali gulėti `-wal` šoniniame faile. Paprastas `copyFileSync` jų nepaimtų ir duotų kopiją, kuri atrodo teisinga, bet yra pasenusi. `VACUUM INTO` grąžina nuoseklią visos bazės kopiją. Tas pats mechanizmas jau naudojamas `backupBeforeMigrate`.

`VACUUM INTO` nepavyksta, jei tikslinis failas jau yra, tad prieš rašant tos dienos failas pašalinamas — taip pakartotinis paleidimas tą pačią dieną nesulaužo kopijavimo.

### Kada

Kartą per kalendorinę parą, **pirma pasitaikiusia proga**. Jokio laiko nustatymo nėra: fiksuota valanda reikštų, kad nakčiai išjungtas kompiuteris kopiją praleidžia, o programa startuoja su Windows, tad pirma proga praktiškai yra netrukus po prisijungimo.

Sprendimas priimamas lyginant `last_backup` datą su šiandienos. Ta pati logika kaip dienos apžvalgos `last_digest`.

### Kur

Nustatymuose atsiranda **laisvai redaguojamas aplanko laukas** su parinkimo mygtuku.

Numatytoji reikšmė — `<dataDir>/backups` — veikia be jokios konfigūracijos ir apsaugo nuo sugadinto failo. Bet **nuo mirusio disko kopija šalia originalo neapsaugo.** Vienintelis būdas tai išspręsti — nurodyti sinchronizuojamą aplanką (OneDrive, Dropbox) arba tinklo diską. Nustatymų lange prie lauko rašoma viena eilutė, kuri tai pasako tiesiai.

## 3. CSV formatas

**Skirtukas — kabliataškis.** Lietuviškas Excel kablelį laiko dešimtainiu skyrikliu, tad kableliais atskirtas failas suvirstų į vieną stulpelį.

**Koduotė — UTF-8 su BOM.** Be BOM Excel iš „Nunešti baterijas į konteinerį" padaro „NuneÅ¡ti".

Antraštė ir stulpeliai:

```
Pavadinimas;Būsena;Prioritetas;Terminas;Priminimas;Sukurta;Atlikta
```

| Stulpelis | Iš ko | Pavyzdys |
|---|---|---|
| Pavadinimas | `title` | `Užsakyti vasarines padangas` |
| Būsena | `status` → lietuviškai | `Reikia padaryti` / `Vykdoma` / `Atlikta` |
| Prioritetas | `priority` → lietuviškai | `Aukštas` / `Vidutinis` / `Žemas` |
| Terminas | `due_at` arba tuščia | `2026-08-20T18:00` |
| Priminimas | `remind_at` arba tuščia | `2026-08-20T18:00` |
| Sukurta | `created_at` | `2026-08-14T10:00:00.000Z` |
| Atlikta | `completed_at` arba tuščia | `2026-08-15T09:12:00.000Z` |

Ekranavimas: laukas, kuriame yra kabliataškis, kabutė arba eilutės lūžis, gaubiamas kabutėmis, o kabutės viduje dvigubinamos. Užduočių pavadinimai yra laisvas tekstas, tad tai ne teorinis atvejis.

## 4. Rotacija — ir kodėl ji pavojinga

Aplanką nurodo naudotojas. Jis gali nurodyti aplanką, kuriame guli ir kiti jo failai.

**Todėl rotacija trina TIK failus, atitinkančius `tasks-YYYY-MM-DD.db` ir `tasks-YYYY-MM-DD.csv`.** Niekada nieko kito, jokio „išvalyti aplanką", jokio trynimo pagal laiko žymą. Klaida čia reikštų svetimų failų praradimą — tai būtų blogiau už pačią problemą, kurią sprendžiam.

Laikomos septynios naujausios datos. Nustatoma pagal failo pavadinime esančią datą, ne pagal failų sistemos laiką: sinchronizuojami aplankai laiko žymas keičia.

## 5. Kai nepavyksta

Aplanko gali nebūti, jis gali būti tik skaitymui, OneDrive gali būti atjungtas, diskas pilnas.

Tokiu atveju kopija praleidžiama, o klaidos pranešimas išsaugomas į `last_backup_error`. Nustatymų lange prie aplanko lauko rodoma paskutinės kopijos būsena: `Paskutinė kopija: 2026-08-17` arba `Paskutinė kopija: nepavyko 2026-08-17 — kelias nerastas`.

**Tylėti negalima.** Nematomas gedimas čia yra blogiausias įmanomas rezultatas: manytum, kad esi apsaugotas, ir sužinotum tiesą tą dieną, kai kopijos prireiks.

Nepavykus `last_backup` **neatnaujinamas**, tad kita proga bandoma iš naujo. Bet klaida nekartojama į žurnalą kas 15 sekundžių — rašoma tik tada, kai pranešimas pasikeičia.

## 6. Nustatymų raktai

Prie esamų pridedami trys:

| Raktas | Reikšmė | Numatytoji |
|---|---|---|
| `backup_dir` | tekstas, aplanko kelias | `<dataDir>/backups` |
| `last_backup` | `YYYY-MM-DD` arba `null` | `null` |
| `last_backup_error` | tekstas arba `null` | `null` |

`backup_dir` validuojamas kaip netuščias tekstas. Kelio egzistavimas **netikrinamas rašant nustatymą** — naudotojas gali nurodyti dar neprijungtą tinklo diską, ir tai jo teisė; egzistavimas tikrinamas kopijavimo metu, o gedimas rodomas.

## 7. Architektūra

Naujas failas `src/core/backup.ts` su aiškiai atskirtomis grynomis ir nešvariomis dalimis:

**Grynos, testuojamos be disko:**

- `tasksToCsv(tasks: Task[]): string` — antraštė, ekranavimas, lietuviški pavadinimai, BOM
- `backupNames(date: string): { db: string; csv: string }`
- `expiredBackups(existing: string[], keep: number): string[]` — kurias datas trinti, gavus esamų failų sąrašą

**Liečiančios diską:**

- `writeBackup(db, dir, date): void` — sukuria aplanką, pašalina tos dienos failus, `VACUUM INTO`, įrašo CSV
- `pruneBackups(dir, keep): void` — trina tik savo šabloną atitinkančius failus

**Planuoklis:** `createBackupScheduler({ db, tasks, settings, clock })` su `tick()` ir `start(intervalMs)` — ta pati forma kaip `createReminderScheduler`, ta pati praleistų progų logika.

### Vieta išjungimo tvarkoje

Planuoklis skaito duomenų bazę, tad jo intervalas **privalo būti sustabdytas `before-quit` tvarkyklėje, prieš `db.close()`**, kartu su priminimų planuokliu ir nustatymų sekykle.

Tai užrašoma atskirai, nes „liečia bazę po jos uždarymo" šioje kodo bazėje pasirodė **tris kartus**: priminimų planuoklyje, nustatymų sekyklėje ir žadintuvo lange. Kiekvieną kartą tai buvo ta pati klaida, padaryta iš naujo. Ketvirto karto nereikia.

## 8. Testai

**Grynos funkcijos** (be disko):
- CSV: antraštė, lietuviškos būsenų ir prioritetų reikšmės, BOM, tuščios reikšmės termino ir atlikimo laukuose
- CSV ekranavimas: pavadinimas su kabliataškiu, su kabutėmis, su eilutės lūžiu
- Rotacija: iš dešimties datų grąžina tris seniausias; ignoruoja svetimus failus aplanke; nesikabina prie failų sistemos laiko žymų

**Diską liečiančios** (laikinas katalogas):
- `writeBackup` sukuria abu failus, o `.db` atsidaro kaip veikianti bazė su tomis pačiomis užduotimis
- pakartotinis paleidimas tą pačią dieną perrašo, o ne krenta
- `pruneBackups` netrina svetimo failo, padėto tame pačiame aplanke

**Planuoklis** (įšvirkščiamas laikrodis):
- kopija po pirmo tikrinimo naują dieną; ne antrą kartą tą pačią parą
- praleista para pagaunama pabudus
- nepavykus `last_backup` nekeičiamas, o `last_backup_error` užpildomas
- nepavykus planuoklis nemeta išimties į `setInterval`

## 9. Ko sąmoningai nedarom

- Šiukšliadėžės ištrintoms užduotims
- Atkūrimo iš kopijos mygtuko sąsajoje — atkuriama pakeičiant `tasks.db` failą ranka, ir tai aprašoma README
- Kopijų šifravimo ar suspaudimo
- Kelių kopijų aplankų vienu metu
- Kopijavimo dažnio nustatymo — kartą per parą pakanka įrankiui, kuriame per dieną atsiranda kelios užduotys
