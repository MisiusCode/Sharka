# TaskerPro: laikotarpio peržiūra — dizaino specifikacija

**Data:** 2026-08-18
**Būsena:** patvirtinta, paruošta įgyvendinimo planui
**Eilė:** ketvirta, po atsarginių kopijų, pasikartojančių užduočių ir „Padaryta" rodinio

## 1. Problema

„Padaryta" rodinys atsako į klausimą „ką nuveikiau pastarosiomis dienomis" — jo kolonos slenkančios, ir viskas, kas senesnio nei savaitė, sukrenta į vieną „Anksčiau" krūvą. Klausimo „ką nuveikiau liepą" užduoti negalima.

## 2. Anksčiau priimtas priešingas sprendimas

Šis projektas statistikos atsisakė tris kartus:

- `docs/frontend-dizaino-promptas.md`, skiltyje „Ko nedaryti" — *„Statistika, grafikai, „produktyvumo" balai, serijos. Niekas neprašė…"*;
- `2026-08-17-ka-padariau-design.md` 4 skyriuje — *„Vienas skaičius, ne grafikas… jie paverčia įrankį vertintoju"*;
- to paties dokumento 10 skyriuje — grafikai, serijos ir produktyvumo balai išvardyti tarp to, ko sąmoningai nedarom.

**Naudotojas šį sprendimą atšaukė 2026-08-18.** Atšaukiama tik dalis: atsiranda būdas pasižiūrėti, kas padaryta per nurodytą laikotarpį. Grafikai, serijos, produktyvumo balai ir palyginimai su praėjusiu laikotarpiu **lieka atmesti** — argumentas prieš juos nepasikeitė.

Dokumentai, kuriuose parašyta priešingai, taisomi kartu su kodu (3 užduotis).

## 3. Sprendimas: antra „Padaryta" rodinio būsena

Rodinys „Padaryta" įgyja dvi būsenas:

| Būsena | Kas rodoma |
|---|---|
| **Kasdienė** (numatytoji) | Keturios slenkančios kolonos `Šiandien / Vakar / Šią savaitę / Anksčiau` ir eilutė „Per savaitę padaryta N" |
| **Laikotarpio peržiūra** | Vienas plokščias sąrašas ir antraštė „Padaryta: N" |

Virš rodinio — laukai `Nuo` ir `Iki` bei mygtukas **„Peržiūrėti"**. Paspaudus jį kolonos pakeičiamos sąrašu; šalia antraštės atsiranda **„Grįžti"**, grąžinantis kolonas.

### Kodėl laikotarpis pakeičia kolonas, o ne jas filtruoja

Kolonos ir laikotarpis matuoja tą patį dalyką — kada užduotis atlikta. Filtruojant liepos intervalu viskas sukristų į „Anksčiau", o trys kolonos liktų tuščios. Toks rodinys meluotų apie savo paties struktūrą.

### Kodėl ne naujas langas ir ne ketvirtas perjungiklio režimas

Programa turi penkis puslapius ir keturis Electron langus; šeštas kainuotų maršrutą, langą, tray meniu punktą ir savo gyvavimo ciklą tam, kas žiūrima kartą per mėnesį. Ketvirtas perjungiklio režimas irgi netinka: tai ne kita užduočių skalė, o klausimas apie tą patį „Padaryta" rinkinį.

## 4. Sąrašo turinys

Eilutėje: **atlikimo data, pavadinimas, prioriteto juostelė**. Rūšiavimas — naujausia viršuje.

Eilutė nėra kortelė. Kortelė turi varnelę, ištrynimą ir redagavimą vietoje; čia žiūrima, o ne dirbama, tad eilutė yra tekstas, ne valdiklis. Tai kartu reiškia, kad istorijos iš šio rodinio pakeisti negalima — ta pati priežastis, dėl kurios „Padaryta" rodinyje išjungtas tempimas.

Antraštėje — **vienas skaičius**: „Padaryta: 23".

## 5. Laikotarpis

Du datos laukai. Numatytasis — **paskutinės 30 dienų** (`šiandien − 29` … `šiandien`, imtinai iš abiejų pusių), kad atsivertus iškart kažką rodytų.

**Niekur nesaugoma.** Laikotarpis nėra nustatymas, o vienkartinė užklausa: uždarius lentą jis grįžta į numatytąjį. Todėl nereikia nei naujo nustatymų rakto, nei jo validatoriaus, nei sinchronizacijos tarp kompiuterio ir planšetės.

## 6. Duomenys ir API

**Jokių pakeitimų.** `completed_at` jau saugomas, `GET /api/tasks` jau grąžina visas užduotis, filtruojama kliente — kaip ir visuose esamuose rodiniuose.

Ta pati žinoma riba, kaip ir „Padaryta" rodinyje: visos užduotys keliauja per tinklą kiekvieno perkrovimo metu. Kai tai taps nepriimtina, sprendimas bus puslapiavimas serveryje, ne šio rodinio perdarymas.

## 7. Kur gyvena logika

**`src/core/completed.ts`** — praplečiamas, o ne kuriamas naujas modulis. Priežastis: naujoms funkcijoms reikia to paties privataus `completedDate` pagalbininko, kuris skaito `completed_at` ir tikrina būseną. Atskiras failas priverstų jį eksportuoti vien tam, kad būtų kirsta failo riba. Modulis yra ~60 eilučių; papildomos ~25 jo neišpučia.

Naujos funkcijos:

- `defaultRange(today: string): { from: string; to: string }`
- `isValidRange(from: string, to: string): boolean` — abi datos neturi būti tuščios ir `from <= to`. Tuščią eilutę tikrinti privaloma: `<input type="date">` ištrynus reikšmę duoda `''`, o `'' <= '2026-08-18'` leksikografiškai yra `true`, tad vien palyginimo nepakaktų
- `completedBetween(tasks: Task[], from: string, to: string): Task[]` — atliktos, kurių atlikimo data patenka į intervalą imtinai, surikiuotos naujausia viršuje

Importų riba nesikeičia: tik `./datetime.js` ir `./types.js`.

**`src/ui/components/Board.tsx`** — laikotarpio eilutė, mygtukai ir sąrašas. Būsena vietinė (`useState`), ne nustatymuose.

## 8. Kraštiniai atvejai

| Atvejis | Elgsena |
|---|---|
| Tuščias rezultatas | „Per šį laikotarpį nieko nepadaryta." Vienas sakinys, be iliustracijų |
| `Nuo` vėlesnė už `Iki` | „Pradžios data vėlesnė už pabaigos." Mygtukas neaktyvus; jokio klaidos lango |
| Tuščias datos laukas | Mygtukas neaktyvus |
| Pasikartojančios užduotys | Nesimato — joms `completed_at` nefiksuojamas. Tas pats apribojimas kaip visame „Padaryta" rodinyje |
| Perjungus grupavimą į `Datos` ar `Progresas` | Laikotarpio peržiūra išjungiama; grįžus į „Padaryta" rodomos kolonos |

## 9. Testai

**Grynos funkcijos:**
- `defaultRange` grąžina 30 dienų intervalą, kurio pabaiga — šiandien
- `completedBetween` įtraukia kraštines datas (`from` ir `to` dienos) ir neįtraukia dienos prieš `from` bei po `to`
- neatliktos užduotys nepatenka; nenuoseklios (`status='todo'` su užpildytu `completed_at`) irgi ne
- rūšiavimas naujausia viršuje
- `isValidRange` atmeta `from > to`, atmeta tuščią eilutę bet kurioje pusėje, priima lygias datas

**Lenta:**
- paspaudus „Peržiūrėti" kolonos dingsta, atsiranda sąrašas ir „Padaryta: N"
- „Grįžti" grąžina kolonas
- tuščias intervalas rodo paaiškinimą, ne tuščią ekraną
- `Nuo > Iki` — mygtukas neaktyvus ir rodomas paaiškinimas
- perjungus grupavimą ir grįžus rodomos kolonos, ne senas sąrašas

## 10. Ko sąmoningai nedarom

- Grafikų, diagramų, procentų, progreso juostų
- Palyginimo su praėjusiu laikotarpiu („15 % daugiau nei liepą")
- Serijų, vidurkių, produktyvumo balų
- Eksporto iš šio rodinio — CSV su stulpeliu `Atlikta` jau yra atsarginėse kopijose
- Suskirstymo pagal prioritetą — apsvarstyta ir atmesta: antraštėje užtenka vieno skaičiaus, o prioritetai matomi pačiame sąraše
- Paruoštų laikotarpio mygtukų („7 dienos", „Šis mėnuo") — apsvarstyta ir atmesta, nes prašyta „mygtukas ir viskas"
- Laikotarpio įsiminimo tarp paleidimų
