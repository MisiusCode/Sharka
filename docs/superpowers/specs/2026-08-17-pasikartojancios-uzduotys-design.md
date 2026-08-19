# TaskerPro: pasikartojančios užduotys — dizaino specifikacija

**Data:** 2026-08-17
**Būsena:** patvirtinta, paruošta įgyvendinimo planui
**Eilė:** įgyvendinama **po** atsarginių kopijų (`2026-08-17-atsargines-kopijos-design.md`) — priežastis 7 skyriuje

## 1. Problema

Pradinėje specifikacijoje pasikartojančios užduotys buvo sąmoningai išbrauktos. Tas sprendimas priimtas prieš pradedant naudoti sistemą, ir naudojimas jį paneigė: „išnešti šiukšles" antradieniais ir „sumokėti už internetą" 15 dieną yra tiksliai ta smulkių užduočių rūšis, kuriai visas įrankis ir skirtas. Dabar jas reikia kurti ranka kaskart.

## 2. Modelis: užduotis persistumia, o ne dauginasi

Pažymėjus pasikartojančią užduotį atlikta, ji **nepažymima atlikta**. Jos terminas peršoka į kitą kartą, būsena lieka `todo`. Naudotojui atrodo, kad jis ją atliko ir ji dingo iš šiandienos.

Alternatyva — kurti atskirą įrašą kiekvienam kartui — atmesta sąmoningai: savaitinė užduotis per metus pagimdytų 52 eilutes, o lenta yra skirta tam, kas dar nepadaryta, ne archyvui.

**Kaina, kurią priimam:** istorijos nėra. Būsimas „Ką padariau" rodinys pasikartojančių užduočių nerodys, nors jos ir sudarys didelę dalį realiai atlikto darbo. Tai žinoma ir priimta.

## 3. Duomenų modelis

Vienas naujas stulpelis lentelėje `tasks`:

```sql
repeat TEXT   -- NULL | 'w:2' | 'm:15'
```

| Reikšmė | Prasmė |
|---|---|
| `NULL` | Nesikartoja |
| `w:N` | Kas savaitę N-ą dieną. `N` = 1–7, pirmadienis = 1 (ISO) |
| `m:N` | Kas mėnesį N-ą dieną. `N` = 1–31 |

Daugiau nieko: jokios atskiros lentelės, jokių šablonų, jokių išimčių sąrašo.

**Kas N dienų ir „po savaitės nuo atlikimo" nekuriami.** Abu buvo apsvarstyti ir atmesti — reikia dviejų kalendorinių šablonų, ne keturių.

### Pasirinkus kartojimą, terminas nustatomas iškart

Pasikartojanti užduotis visada turi `due_at`. Pasirinkus šabloną, terminas iš karto perskaičiuojamas į artimiausią kitą kartą. Kartojimą nuėmus, užduotis lieka su savo esamu terminu ir tampa įprasta.

## 4. Kito karto skaičiavimas

`nextOccurrence(repeat, fromDate)` grąžina artimiausią datą **griežtai po** `fromDate`.

**`w:N`** — artimiausia data po `fromDate`, kurios ISO savaitės diena yra `N`. Jei `fromDate` pati yra ta diena, grąžinama po septynių dienų: ką tik atlikai, šiandien ji grįžti neturi.

**`m:N`** — artimiausia data po `fromDate`, kurios mėnesio diena yra `min(N, dienų tame mėnesyje)`. Jei ta data nėra po `fromDate`, imamas kitas mėnuo.

**Mėnesio pabaigos apkirpimas:** `m:31` vasarį duoda 28 arba 29 dieną, balandį — 30. Kitos prasmingos išeities nėra, ir tyliai praleisti mėnesį būtų blogiau.

### Skaičiuojama nuo šiandien, ne nuo saugomo termino

Tai ne smulkmena. Jei užduotis pradelsta tris savaites, o kitas kartas būtų skaičiuojamas nuo jos seno termino, ji vėl atsidurtų praeityje ir liktų raudona — pažymėjimas nieko nepakeistų. Skaičiuojant nuo šiandien, ji keliauja į artimiausią ateities antradienį.

## 5. Praleisti kartai lieka pradelsti

Neišneštos antradienio šiukšlės ketvirtadienį **vis dar kabo šiandienos stulpelyje raudonai**, su savo antradienio data. Praėjus trims savaitėms — vis dar ten, tris savaites pradelstos.

Automatinis peršokimas į kitą kartą būtų slėpimas: sistema apsimestų, kad nieko nepraleista. Priminimų įrankiui tai blogiausia įmanoma elgsena, ir tai prieštarautų sprendimui, kuriuo pradelstos apskritai rodomos šiandienos stulpelio viršuje.

**Vieno praleisto karto niekada nebūna daugiau nei vienas.** Užduotis viena, tad trys praleisti antradieniai duoda vieną pradelstą užduotį su seniausia data, ne tris.

## 6. Laikas ir priminimas

Turėjusi laiką užduotis jį išsaugo: „kas antradienį 18:00" po pažymėjimo vėl bus 18:00 kitą antradienį, o `remind_at` nustatomas į tą patį naują momentą. `reminded_at` nuvalomas, kad žadintuvas suveiktų iš naujo.

Be laiko — lieka be laiko, be žadintuvo.

## 7. Schemos versija ir ryšys su atsarginėmis kopijomis

`repeat` stulpelis yra **pirmas tikras schemos pakeitimas** nuo projekto pradžios. `SCHEMA_VERSION` tampa 2, ir atsiranda migracija.

Dėl to pirmą kartą suveiks `backupBeforeMigrate` — funkcija, kuri iki šiol miegojo, nes sąlyga `from > 0 && from < SCHEMA_VERSION` prie vienos versijos netenkinama niekada.

**Todėl atsarginių kopijų funkcija įgyvendinama pirma.** Tada šis pakeitimas tampa jos realiu bandymu: pirmą kartą paleidus naują versiją su esama baze, šalia `tasks.db` turi atsirasti `tasks.db.bak`. Jei neatsiranda — kopijų mechanizmas neveikia, ir tai sužinom migracijos metu, o ne tada, kai jos prireiks.

Migracija yra viena eilutė (`ALTER TABLE tasks ADD COLUMN repeat TEXT`), tad rizika pati savaime maža — bet būtent todėl ji ir tinka kaip pirmas bandymas.

## 8. Kur gyvena logika

**`src/core/repeat.ts`** — grynas modulis, importuojamas ir naršyklės paketo:

- `nextOccurrence(repeat: string, fromDate: string): string`
- `isValidRepeat(value: unknown): boolean`
- `repeatLabel(repeat: string): string` — „kas antradienį", „kas 15 dieną"

Importuoja tik `./datetime.js`. Jokių Node modulių — sąsaja jį naudos etiketėms rodyti.

**`src/core/tasks.ts`** — persistūmimas įgyvendinamas `update()` viduje, prie esamų šoninių efektų.

Tai svarbus sprendimas: **nė vienas langas apie kartojimą nežino.** Lenta, tray langelis, dienos apžvalga ir žadintuvas visi kviečia tą patį `PATCH { status: 'done' }`, ir visi keturi gauna teisingą elgseną nemokamai. Jei logika būtų sąsajoje, ją reikėtų kartoti keturis kartus ir trys iš jų anksčiau ar vėliau prasilenktų.

**`src/server/routes/tasks.ts`** — `repeat` validuojamas per `isValidRepeat`, netinkamas duoda 400 `invalid_repeat`.

## 9. Sąsaja

**Termino redaktoriuje** (`DueEditor`) šalia datos čipų atsiranda kartojimo pasirinkimas: nesikartoja / savaitės diena / mėnesio diena, su atitinkamu skaičiaus pasirinkimu. Pasirinkus — terminas iškart perskaičiuojamas.

**Kortelėje — ženklas `↻`, ne tekstas ir ne spalva.**

Be jokio žymėjimo pažymėjimas atrodytų kaip klaida: užduotis dingsta iš šiandienos, bet kitą savaitę vėl išnyra. Tad ženklas būtinas.

Bet **spalva čia netinka**. Lentoje spalva jau turi vieną prasmę — prioritetą — ir tai vienintelis dalykas, leidžiantis atskirti svarbų nuo eilinio neskaitant teksto. Pridėjus jai antrą reikšmę, abi taptų sunkiau skaitomos, o prikrauta lenta yra būtent tas atvejis, kuriam visa ši sistema egzistuoja.

**Tekstinė etiketė kortelėje irgi netinka:** „kas antradienį" yra dvylika simbolių šalia pavadinimo, o kortelė ir taip talpina varnelę, prioriteto juostelę, datą ir ištrynimą.

Todėl — mažas `↻` ženklas prie datos žymės. Jis atpažįstamas iš formos, neužima pločio ir nesikiša į spalvų prasmę. Pilna etiketė („kas antradienį") rodoma užvedus pele ir termino redaktoriuje, kur vietos yra.

**Ištrynimas ištrina visam laikui.** „Ištrinti tik šį kartą" nėra, nes atskirų kartų ir nėra — yra viena užduotis, kuri juda.

## 10. Testai

**`nextOccurrence`** — čia visa esmė:
- `w:2`, kai šiandien antradienis → po septynių dienų, ne šiandien
- `w:2`, kai šiandien trečiadienis → kitas antradienis
- `m:15`, kai šiandien 10 → tas pats mėnuo; kai šiandien 20 → kitas mėnuo
- `m:31` vasarį → 28 arba 29 (keliamieji metai tikrinami atskirai)
- `m:31` balandį → 30
- perėjimas per metų ribą: gruodžio 28, `w:1` → sausio data

**`update` persistūmimas:**
- pažymėjus atlikta pasikartojanti lieka `todo`, o terminas peršoka
- `completed_at` nenustatomas
- laikas ir `remind_at` išsaugomi; `reminded_at` nuvalomas
- tris savaites pradelsta po pažymėjimo atsiduria **ateityje**, ne praeityje
- nepasikartojanti elgiasi kaip anksčiau (regresijos sargas)

**Migracija:**
- esama v1 bazė po atidarymo turi `repeat` stulpelį ir nepraranda užduočių
- prieš migraciją atsiranda `tasks.db.bak` su senuoju turiniu

**Validacija:** `w:0`, `w:8`, `m:0`, `m:32`, `d:3`, `w:`, tuščia eilutė, ne tekstas — visi atmetami.

## 11. Ko sąmoningai nedarom

- Kas N dienų ir „po N dienų nuo atlikimo" šablonų
- Kelių kartojimo taisyklių vienai užduočiai
- Išimčių („kas antradienį, išskyrus švenčių dienas")
- Pabaigos datos („kartok iki gruodžio")
- Atskirų kartų istorijos ar praleistų kartų skaičiavimo
- „Praleisti šį kartą" mygtuko — tam pakanka pakeisti terminą ranka
