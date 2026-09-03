# Šarka Microsoft Store: dizaino specifikacija

**Data:** 2026-09-01
**Būsena:** patvirtinta, paruošta įgyvendinimo planui
**Apimtis:** trys posistemės viename dokumente — autentikacija, kalbos, pakavimas

## 1. Tikslas

Išleisti Šarką į Microsoft Store taip, kad ją galėtų įsidiegti nepažįstamas žmogus.
Šiandien programa tam netinka dėl trijų dalykų: serveris klauso `0.0.0.0` be jokios
autentikacijos, sąsaja yra tik lietuviška, o diegimo failas nepasirašytas ir nesupakuotas
Store formatu.

Naudotojas sąmoningai pasirinko **vieną produktą, ne atšaką**: Store versija pakeičia
dabartinę NSIS versiją tame pačiame kompiuteryje ir perima esamus duomenis. Todėl duomenų
katalogo klausimas yra didžiausia šio projekto rizika, ir jis sprendžiamas pirmas.

## 2. Anksčiau priimti priešingi sprendimai

Šis dokumentas atšaukia du anksčiau užrašytus sprendimus. Abu buvo teisingi savo kontekstui —
vieno naudotojo namų tinklui — ir abu nustoja galioti, kai programą įsidiegia svetimas žmogus
svetimame tinkle.

| Kas keičiama | Kur parašyta | Kas galioja dabar |
|---|---|---|
| „Autentikacijos nėra sąmoningai" | `README.md` skiltis „Saugumas namų tinkle", `CLAUDE.md` konvencijos | Serveris pagal nutylėjimą klauso tik `127.0.0.1`; tinklo prieiga įjungiama sąmoningai ir reikalauja PIN |
| „Viskas lietuviškai", įskaitant API `error.message` | `CLAUDE.md` konvencijos | Sąsaja dvikalbė (`lt`/`en`); klientas verčia pagal `error.code`, o `message` tampa angliška atsargine reikšme kūrėjui |

Abu dokumentai taisomi kartu su kodu, ne po jo.

## 3. Priimti sprendimai

| Klausimas | Sprendimas |
|---|---|
| Atšaka ar viena kodų bazė | Viena. Skirtumus lemia nustatymai, ne kompiliavimo vėliavos |
| Kas įleidžiama į API | `127.0.0.1` — visada; iš tinklo — tik su galiojančiu slapuku |
| Tinklo prieiga | Išjungta pagal nutylėjimą; įjungiama tik turint PIN; įsigalioja perkrovus |
| Slaptažodis | Vienas 4–8 skaitmenų PIN visai programai. Jokių paskyrų |
| Sesijos | HMAC pasirašytas slapukas, be sesijų lentelės |
| Kalbos | `lt` ir `en` viename pakete, nustatymas `system` pagal nutylėjimą |
| Pakavimas | `appx` (MSIX) taikinys šalia esamo `nsis`; pasirašo pati Store |
| Tapatybė | Tas pats produktas; Store versija perima esamus duomenis |
| Schemos migracija | Nereikalinga — `settings` lentelė yra raktas–reikšmė |

## 4. Autentikacija ir tinklo prieinamumas

### 4.1 Klausymosi adresas tampa nustatymu

Naujas nustatymas `lan: boolean`, numatytoji reikšmė `false`. `startServer()` prisiriša prie
`127.0.0.1`, kai jis išjungtas, ir prie `0.0.0.0`, kai įjungtas. Reikšmė skaitoma **tik
startuojant** — tas pats gyvavimo ciklas kaip `port`, tad nustatymų lange panaudojamas jau
esantis įspėjimas apie perkrovimą. LAN adresų sąrašas nustatymuose rodomas tik įjungus.

### 4.2 Įjungti tinklą be PIN neįmanoma

`core/settings.ts` atmeta `lan: true`, kai PIN dar nenustatytas. Taisyklė gyvena ten dėl tos
pačios priežasties kaip `isValidHotkey`: ji privalo galioti bet kuriam klientui, ne tik
nustatymų ekranui.

### 4.3 PIN saugojimas

Du nauji nustatymų raktai: `pin_hash` ir `pin_salt` (scrypt). `GET /api/settings` jų
**negrąžina niekada** — vietoj jų atsakyme yra `has_pin: boolean`. PIN nustatomas atskiru
`PUT /api/pin`, o ne bendru `PATCH /api/settings`, kad joks būsimas naujas raktas negalėtų
netyčia apeiti slėpimo taisyklės.

PIN formatas (4–8 skaitmenys, tik skaitmenys) tikrinamas ten pat, kur ir maiša —
`core/pin.ts`, o ne maršrute: taisyklė galioja bet kuriam kvietėjui.

Maiša skaičiuojama **naujame `core/pin.ts`**, o ne `core/settings.ts`. Priežastis techninė ir
privaloma: `core/settings.ts` pasiekiamas iš `ui/`, tad `node:crypto` reikšminis importas jame
sugriautų naršyklės paketą (žr. `CLAUDE.md` taisyklę apie `core` modulius, kuriuos naudoja
`ui`). `core/pin.ts` iš `ui/` neimportuojamas niekada.

### 4.4 Sesijos be sesijų lentelės

`POST /api/session` su `{ pin }` patikrina PIN ir grąžina slapuką `HttpOnly; SameSite=Strict`.
Slapuko reikšmė — HMAC parašas, kurio raktas išvedamas iš `pin_hash`. Iš to plaukia dvi
savybės nemokamai: serverio perkrovimas prisijungusių įrenginių neišmeta, o pakeitus arba
pašalinus PIN visi įrenginiai atjungiami tą pačią akimirką. Sesijų lentelės nėra, tad nėra ir
migracijos.

Slapukas galioja 30 parų: planšetė stovi tame pačiame tinkle nuolat, tad dažnesnis PIN
klausimas būtų vien trukdis.

### 4.5 Kas tikrinama

Viena tarpinė grandis prieš `/api/*`:

1. Užklausa iš `127.0.0.1` arba `::1` — praleidžiama nepakeista.
2. Kitaip reikalingas galiojantis slapukas; jo nesant — `401 { error: { code: 'unauthorized' } }`.

Statiniai failai lieka atviri: juose nėra duomenų. `GET /api/events` eina per tą pačią grandį.
Visi penki Electron langai, tray langelis, žadintuvas ir apžvalga kreipiasi per `127.0.0.1`,
tad **nesikeičia nė vienas iš jų**.

### 4.6 Planšetės eiga

Naujo Vite įėjimo taško nereikia. Visos užklausos jau eina per `ui/api.ts`, tad gavus 401
lenta parodo PIN ekraną ir, sėkmingai prisijungus, pakartoja nutrūkusią užklausą. PIN
suvedamas vieną kartą kiekviename įrenginyje.

### 4.7 Piktnaudžiavimas

Keturių skaitmenų PIN yra 10 000 spėjimų, tad `POST /api/session` gauna ribojimą pagal
kreipėjo adresą (penki bandymai per 15 minučių, tada `429` iki lango pabaigos), laikomą
atmintyje. CSRF dengia `SameSite=Strict` kartu su jau esamu reikalavimu siųsti JSON.

## 5. Kalbos

### 5.1 Nustatymas

`locale: 'lt' | 'en' | 'system'`, numatytoji `system`. Tai tiksliai `theme` nustatymo
atitikmuo — ta pati trijų reikšmių forma, ta pati vieta serveryje, tad tray meniu ir dialogai
irgi jį gauna. Kalba iš `system` išvedama naršyklėje per `navigator.language`, o `main.ts` —
per `app.getPreferredSystemLanguages()[0]`. **Ne** `app.getLocale()`: `main.ts` pats nustato
`app.commandLine.appendSwitch('lang', 'lt')`, o `getLocale()` grąžina PROGRAMOS kalbą — būtent
tą, kurią nustato šis jungiklis — tad ji visada būtų `lt`, nepriklausomai nuo tikros sistemos
kalbos. `getPreferredSystemLanguages()` jungiklio nepaiso. Tas pats šaltinis galioja ir CSV
eksportui: kopijų planuoklis sukasi `main.ts` procese, tad nustatymui esant `system` antraštė
rašoma pagal `app.getPreferredSystemLanguages()[0]`, o ne pagal tai, kokia kalba tuo metu
atidaryta planšetė.

Įspėjimas 2b daliai: Electron lange `navigator.language` seka tą patį `--lang` jungiklį, tad
darbalaukio programoje juo remtis sistemos kalbai nustatyti negalima — jis irgi visada
grąžintų `lt`. Naršyklės (planšetės) pusėje problemos nėra, nes ten jungiklio nėra.

### 5.2 Žodynas

Naujas `core/i18n.ts`: `Locale` tipas, `MESSAGES: Record<Locale, Record<MessageKey, string>>`
ir `t(locale, key, params?)`. Modulis privalo likti be Node builtinų — jį importuoja `ui/`.

Į raktus keliauja: `BUCKET_LABELS`, `COMPLETED_LABELS`, būsenų ir prioritetų pavadinimai
(`Board.tsx` ir `core/backup.ts` turi po savo kopiją — jos suliejamos), `repeatLabel()`,
mėnesių lentelės (vardininkas ir kilmininkas), savaitės dienos, visi JSX tekstai, tray meniu,
`dialog` pranešimai, žadintuvo ir apžvalgos langai, nustatymų ekranas.

### 5.3 Klaidos verčiamos pagal kodą, ne pagal tekstą

API jau grąžina `{ error: { code, message } }`. Klientas verčia pagal `code`; `message` lieka
angliška atsarginė reikšmė nežinomiems kodams. Serveryje jokio vertimo nėra. Pasekmė: kodų
sąrašas tampa sutartimi — esamų kodų pervadinti nebegalima.

### 5.4 Datos

`DateField` lieka: natyvus `<input type="date">` ir toliau paklūsta naršyklės, o ne puslapio
kalbai, tad problema, dėl kurios jis atsirado, niekur nedingo. Pridedamos angliškos mėnesių
lentelės.

**Savaitė abiejose kalbose prasideda pirmadieniu.** `monthGrid` poslinkis yra pirmadieninis ir
padengtas testais; kalbai priklausoma savaitės pradžia įvestų kintamąjį į vienintelę vietą,
kur klaida būtų tyli (data nuslystų per dieną), o nauda būtų nulinė britams ir lietuviams.

### 5.5 CSV

Antraštė ir būsenų bei prioritetų pavadinimai imami pagal aktyvią kalbą eksporto metu. Jau
sukurti failai nesikeičia. BOM ir kabliataškis lieka — jie egzistuoja dėl Excel, ne dėl kalbos.

### 5.6 Kas liko 2 dalies b etapui (radinių sąrašas iš 2a peržiūros)

Šio poskyrio radiniai — 2a dalies peržiūros metu; peržiūros darbo erdvė po jos ištrinama, tad
tai vienintelė vieta, kur jie išliks:

1. **`Column.tsx` testo id sudaromas iš IŠVERSTOS etiketės**
   (``data-testid={`kolona-${label}`}``), tad patys id yra lietuviškas tekstas —
   vien `tests/e2e/board.spec.ts` turi apie 15 tokių selektorių. Pakeitimas į stabilų raktą
   (``kolona-${id}``) yra viena eilutė, bet išsišakoja per kiekvieną selektorių, tad tai turi
   būti PIRMAS 2b plano žingsnis, prieš imantis likusios sąsajos.
2. **`--lang` tvarkos problema:** `main.ts` jungiklį nustato prieš `app.whenReady()`, bet
   nustatymų bazė atidaroma tik jo viduje. Kad Chromium'o paties piešiami meniu sektų
   pasirinktą kalbą, 2b turi perskaityti `locale` PRIEŠ `whenReady()`, ne po jo.
3. **Dubliuotų etikečių lentelių yra penkios, ne dvi**, kaip teigė ankstesnė šio poskyrio
   redakcija (§5.2 minėjo tik `Board.tsx` ir `core/backup.ts`, kurios ir buvo sulietos šioje —
   2a — dalyje). Liko keturios kitos, kurias reikės pakeisti `core/i18n.ts` kvietimais 2b
   dalyje: `GroupedList.tsx` (savas `STATUS_LABELS`), `DueEditor.tsx` (savas prioritetų
   sąrašas), `FilterBar.tsx` (savas prioritetų sąrašas), ir `DueEditor.tsx`'o penkiolika
   kartojimo `<select>` parinkčių — kurios yra jau KETVIRTA kartojimo pavadinimų frazuotė,
   nesutampanti su likusiomis trimis: `m:31` ten rodomas kaip „Paskutinę mėnesio dieną", o
   `repeatLabel('lt', 'm:31')` sako „kas 31 dieną".
4. **Reikalingas `useLocale()` hook'as**, pagal esamą `useTheme.ts` / `applyTheme` pavyzdį, o
   ne kalbos „pratempimas" per props nuo `Board` iki `DateField` ir kitų lapų komponentų.

## 6. Pakavimas į MSIX

`electron-builder.yml` gauna `appx` taikinį šalia esamo `nsis`; abu iš to paties `dist/`.
Store paketą pasirašo pati, tad kodo pasirašymo sertifikato nereikia — tai ir yra priežastis
rinktis MSIX, o ne teikti esamą `.exe` (jis šiandien nepasirašytas, o Azure Artifact Signing
individualiems kūrėjams Europos Sąjungoje neprieinamas).

- Naujas skriptas `npm run dist:store`. Reikalauja Windows SDK toje mašinoje, kur buildinama.
- Deklaruojama `privateNetworkClientServer` galimybė — be jos planšetė neprisijungtų net
  įjungus `lan`. Loopback veikia be jokių gudrybių: `appx` taikinys gamina **full-trust**
  paketą, ne AppContainer, tad UWP loopback draudimas negalioja.
- Ugniasienės prašymas pirmo paleidimo metu lieka toks pat.
- Store sąrašui reikia privatumo politikos nuorodos, amžiaus vertinimo ir dviejų kalbų aprašų
  su ekrano nuotraukomis.

### 6.1 Autostartas

`app.setLoginItemSettings` rašo į `HKCU\...\Run`, o supakuotoms programoms registras
virtualizuojamas. MSIX programos vietoj to deklaruoja `windows.startupTask` plėtinį, o
naudotojas jį valdo Windows „Paleidimo programos" sąraše. `syncAutostart` gauna supakuoto
paleidimo šaką; tikslus elgesys patvirtinamas 9.1 užduotimi.

## 7. Duomenų katalogas — didžiausia rizika

Naudotojas pasirinko, kad Store versija **perimtų esamus duomenis**. Nežinoma, ar supakuota
programa mato `%APPDATA%/sarka/tasks.db` tiesiogiai, ar MSIX nukreipia rašymą į paketo privatų
katalogą.

Todėl pirmoji įgyvendinimo užduotis yra ne kodas, o matavimas (9.1). Nuo jo rezultato
priklauso viena iš dviejų šakų:

| Rezultatas | Ką darom |
|---|---|
| Senas katalogas matomas ir rašomas | Nedarom nieko — atnaujinimas vyksta vietoje |
| Kelias nukreipiamas | `resolveDataDir` gauna trečią šaką tuo pačiu principu kaip `taskerpro→sarka`: radus seną bazę, kai naujoje vietoje jos dar nėra, ji **kopijuojama, ne perkeliama** (senoji programa gali likti įdiegta), o nesėkmė nieko netrina |

Prieš bet kokį kopijavimą pasinaudojama esama `tasks.db.bak` tvarka.

## 8. Testai

Visi 368 vienetiniai ir 18 e2e testų privalo likti žali.

**Autentikacija** — `core/pin.ts` maišos ir tikrinimo testai; `core/settings.ts` testas, kad
`lan: true` be PIN atmetamas; supertest testai grandžiai: loopback praleidžiamas, svetimas
adresas be slapuko gauna 401, blogas PIN po penkių bandymų gauna 429, PIN pakeitimas
nuvertina seną slapuką. **Šitie testai neša pagrindinį svorį**, nes Playwright kreipiasi per
`127.0.0.1` ir tinklo šakos iš principo nepasiekia.

**Kalbos** — testas, kad abiejų kalbų raktų aibės sutampa (trūkstamas vertimas = raudonas
testas); po vieną testą kiekvienai kalbai mėnesių pavadinimams ir CSV antraštei; e2e kalbos
perjungimui.

**Esamų testų perrašymas** — 465 lietuviški literalai 36 failuose ieško elementų pagal matomą
tekstą. Jie pereina prie `data-testid`, kad kitas vertimas nieko nebelaužtų. Matomo teksto
tikrinimas lieka tik ten, kur tekstas ir yra testo dalykas.

## 9. Etapai

Eilė parinkta pagal riziką, ne pagal patogumą.

1. **9.1 Matavimas (spike).** Sukonfigūruoti minimalų `appx` taikinį (laikinas, be Store
   tapatybės — ją 9.4 pakeis Partner Center reikšmėmis), supakuoti, įdiegti ir atsakyti į du
   klausimus: kur atsiduria `tasks.db` ir ar veikia autostartas. Rezultatas — atsakymas, ne
   paliekamas kodas.
2. **9.2 Autentikacija.** 4 skyrius. Naudinga iškart ir dabartiniam namų diegimui.
3. **9.3 Kalbos.** 5 skyrius kartu su testų perrašymu.
4. **9.4 Store paketas ir sąrašas.** 6 skyrius, duomenų šaka pagal 9.1 rezultatą.

Kiekvienas etapas baigiasi kažkuo, ką galima paleisti.

## 10. Ko sąmoningai nedarom

- **Paskyrų, naudotojų lentelės, slaptažodžių.** Vienas PIN vienai programai.
- **HTTPS.** Namų tinklas be sertifikatų valdymo; PIN sprendžia tą grėsmę, kurią realu spręsti.
- **Atskiros Store atšakos.** Sprendimas priimtas sąmoningai: du medžiai reikštų dvigubą
  taisymą kiekvienai klaidai.
- **Bandomojo laikotarpio ar licencijų kodo.** Tuo rūpinasi Store.
- **Automatinio atsinaujinimo (`electron-updater`).** MSIX atnaujina Store.
- **Kalbos kiekviename įrenginyje atskirai.** Kalba yra ilgalaikis skonis, tad ji serveryje —
  kaip ir tema.

## 11. Neatsakyti klausimai

- Ar supakuota programa mato `%APPDATA%/sarka` (7 skyrius). Atsako 9.1.
- Ar `app.setLoginItemSettings` supakuotam paleidimui veikia, ar reikia `windows.startupTask`
  (6.1). Atsako 9.1.
- Kaip Store peržiūra vertina programą, kuri klauso įeinančių tinklo ryšių. Numatoma atsakyti
  sąraše: funkcija išjungta pagal nutylėjimą, įjungiama tik su PIN.
- Ar Partner Center priskirta paketo tapatybė leidžia rodomą pavadinimą „Šarka" su diakritiku.
