# TaskerPro: „Ką padariau" rodinys — dizaino specifikacija

**Data:** 2026-08-17
**Būsena:** patvirtinta, paruošta įgyvendinimo planui
**Eilė:** trečia, po atsarginių kopijų ir pasikartojančių užduočių

> **Pastaba dėl sprendimų.** Šios specifikacijos sprendimus priėmiau vienas — naudotojas paprašė dirbti be jo įvesties. Kiekvieną nemenką pasirinkimą pažymėjau kaip **[valdiklio sprendimas]** su motyvu, kad juos būtų galima peržiūrėti ir atmesti.

## 1. Problema

`completed_at` saugomas nuo pirmos projekto dienos ir **niekur nerodomas**. Lenta rodo tik tai, kas neatlikta, o atliktos slepiamos.

Pasekmė: įrankis nuolat rodo skolą ir niekada — nuveiktą darbą. Po produktyvios savaitės jis atrodo lygiai taip pat, kaip po tuščios. Duomenys tam yra, tik jų niekas neparodo.

## 2. Sprendimas: trečias grupavimo režimas, ne naujas langas

**[valdiklio sprendimas]** Rodinys tampa **trečia esamo perjungiklio reikšme**: `Datos | Progresas | Padaryta`.

Svarstyta ir atmesta:

- **Naujas langas / šeštas Vite įėjimas** — programa jau turi penkis puslapius ir keturis Electron langus. Šeštas kainuotų maršrutą, langą, tray meniu punktą ir savo gyvavimo ciklą tam, kas žiūrima kartą per savaitę.
- **Skydelis lentos šone** — atimtų plotį iš kolonų, kurios ir taip planšetėje slenkamos.

Trečias režimas nekainuoja beveik nieko: kolonos, kortelės, filtrai ir tempimo konteineris jau egzistuoja. Keičiasi tik tai, **kurios užduotys** ir **į kurias krūveles** dedamos.

## 3. Kolonos

Grupuojama pagal `completed_at` vietinę datą:

| Kolona | Kas patenka |
|---|---|
| Šiandien | `completed_at` data = šiandien |
| Vakar | šiandien − 1 |
| Šią savaitę | šiandien − 2 … šiandien − 7 |
| Anksčiau | viskas senesnio |

Slenkantis langas, kaip ir datų rodinyje — dėl tos pačios priežasties: kalendorinė savaitė pirmadienio rytą būtų beveik tuščia.

Rodomos **tik** užduotys su `status = 'done'`. Rūšiavimas kolonoje — `completed_at` mažėjimo tvarka: paskutinis darbas viršuje.

## 4. Suvestinė

**[valdiklio sprendimas]** Virš kolonų — viena eilutė: **„Per savaitę padaryta 23"**, skaičiuojant paskutines septynias dienas.

Vienas skaičius, ne grafikas. Grafikai, serijos ir produktyvumo balai buvo atmesti pradinėje specifikacijoje ir tebėra atmesti: jie paverčia įrankį vertintoju. Vienas skaičius pasako „nuveikei", ir to pakanka.

> **Papildyta 2026-08-18.** Vienas skaičius lieka vieninteliu skaičiumi, bet
> naudotojas paprašė būdo pasižiūrėti ir už nurodytą laikotarpį. Žr.
> `2026-08-18-statistika-design.md`. Grafikai, serijos ir produktyvumo balai
> tebėra atmesti — atšaukta tik ta dalis, kuri neleido pasirinkti laikotarpio.

## 5. Kas veikia nemokamai

Kortelė ta pati, tad be papildomo darbo veikia:

- **Varnelės nuėmimas** grąžina užduotį atgal į darbinę lentą (`status` → `todo`, `completed_at` nuvalomas — taisyklė jau egzistuoja `update()`)
- **Ištrynimas**
- **Pavadinimo redagavimas**
- **Prioriteto filtras** — galima žiūrėti, kiek svarbių dalykų padaryta

**Tempimas šiame rodinyje išjungiamas.** [valdiklio sprendimas] Tempti atliktą užduotį iš „Vakar" į „Šiandien" reikštų perrašyti istoriją — data pasakoja, kada iš tikrųjų padarei, ir keisti ją tempimu neturi prasmės.

## 6. Ko šis rodinys nerodys

**Pasikartojančių užduočių.** Jos niekada nelieka atliktos — persistumia į kitą kartą, tad `completed_at` joms nenustatomas.

Tai reiškia, kad būtent tai, ką darai reguliariausiai, apžvalgoje nesimatys. Kaina žinoma ir priimta sprendžiant dėl kartojimo modelio (`2026-08-17-pasikartojancios-uzduotys-design.md`, 2 skyrius).

**[valdiklio sprendimas]** Įrašoma į README kaip žinomas apribojimas, o ne tyliai. Naudotojas, matantis „padaryta 3" po savaitės, kurioje išnešė šiukšles ir sumokėjo sąskaitas, turi suprasti, kodėl.

## 7. Duomenys ir API

**Jokių pakeitimų.** `completed_at` jau saugomas, `GET /api/tasks` jau grąžina visas užduotis, filtravimas vyksta kliente — kaip ir esamuose rodiniuose.

**Žinoma riba:** visos užduotys keliauja per tinklą kiekvieno perkrovimo metu. Vienam žmogui su smulkiomis užduotimis tai tūkstančiai eilučių po kelerių metų — priimtina. Kai taps neriimtina, sprendimas bus puslapiavimas serveryje, ne šio rodinio perdarymas.

## 8. Nustatymai ir kiti langai

`grouping` įgyja trečią reikšmę `completed`. Validatorius `core/settings.ts` papildomas.

**Tray langelis ir dienos apžvalga ignoruoja `completed` ir naudoja `date`.** [valdiklio sprendimas] Greito įvedimo langelis ir rytinė apžvalga egzistuoja tam, kas dar nepadaryta; parodyti juose atliktų sąrašą būtų klaida, net jei naudotojas lentą paliko apžvalgos režime. Viena eilutė kiekviename — `grouping === 'completed' ? 'date' : grouping`.

## 9. Testai

**Kolonų priskyrimas** (grynos funkcijos, kaip `dateBucketOf`):
- šiandien / vakar / prieš tris dienas / prieš mėnesį patenka į savo kolonas
- neatlikta užduotis nepatenka niekur
- riba: prieš lygiai 7 dienas — „Šią savaitę"; prieš 8 — „Anksčiau"
- rūšiavimas: naujausias atlikimas viršuje

**Suvestinė:** skaičiuoja tik paskutines septynias dienas; nulis rodomas kaip „Per savaitę padaryta 0", ne slepiamas

**Lenta:**
- perjungus į „Padaryta" rodomos tik atliktos
- varnelės nuėmimas grąžina užduotį ir ji dingsta iš šio rodinio
- tempimas šiame rodinyje neveikia
- prioriteto filtras veikia

**Kiti langai:** esant `grouping = 'completed'`, tray langelis ir dienos apžvalga rodo datų grupavimą

## 10. Ko sąmoningai nedarom

- Grafikų, serijų, produktyvumo balų
- Eksporto iš šio rodinio — CSV kopija (atsarginių kopijų funkcija) jau turi `Atlikta` stulpelį
- Laiko sekimo ar trukmės
- Archyvo su savo saugojimo taisyklėmis
- Pasikartojančių užduočių atlikimų istorijos — tam reikėtų atskiros lentelės, o modelis sąmoningai jos neturi

> **Pakeista 2026-08-18.** Šio sąrašo pirmas punktas galiojo tik iš dalies:
> grafikų, serijų ir balų nėra ir nebus, bet laikotarpio peržiūra atsirado.
