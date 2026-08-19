# Promptas dizaino Claude: Šarkos lentos frontendas

> Nukopijuok viską žemiau nuo linijos ir pateik dizaino Claude.

---

Esi produkto dizaineris ir front-end inžinierius. Sukurk **modernų web frontendą asmeninei užduočių lentai**. Grąžink vieną savarankišką HTML failą — apie jį žemiau.

## Kam tai skirta

Vienam žmogui. Ne komandai, ne klientams, ne SaaS produktui.

Jis naudoja lentą dviejose vietose:

- **Prie kompiuterio**, plačiame monitoriuje, dienos eigoje. Čia jis dirba: kuria užduotis, tempia jas, žymi atliktas.
- **Ant planšetės virtuvėje ar prie lovos**, dažnai stovinčios ant stalelio. Čia jis daugiausia **žiūri** — pameta akį, kas šiandien liko — ir retkarčiais bakstelėja varnelę pirštu.

Iš to plaukia trys dalykai, kuriuos dizainas turi gerbti:

1. **Nėra jokių bendradarbiavimo elementų.** Jokių avatarų, priskyrimų, komentarų, „@paminėjimų", aktyvumo srautų, dalinimosi mygtukų. Jų nėra ir nebus.
2. **Planšetėje viskas turi būti perskaitoma iš metro atstumo** ir pasiekiama pirštu, ne pelės tikslumu.
3. **Naujos užduoties sukūrimas turi trukti porą sekundžių.** Tai svarbiausias veiksmas visoje sistemoje. Jei naudotojui reikia atidaryti modalą, užpildyti keturis laukus ir paspausti „Išsaugoti" — dizainas nepavyko.

Sąsajos kalba — **lietuvių**. Visi tekstai, mygtukai, tuščios būsenos.

> **Nenaudok `<input type="date">`.** Chrome jam ima naršyklės, o ne puslapio kalbą: `<html lang="lt">` jo nepaveikia, tad planšetėje laukas ir jo kalendorius lieka angliški, o savaitė prasideda sekmadieniu. Datos laukelį piešk pats — tekstinį, formatu `yyyy-mm-dd`, su savo kalendoriumi (mėnesiai lietuviškai, savaitė nuo pirmadienio). Tas pats galioja `type="datetime-local"` ir `type="month"`.

## Duomenų tiesa

Užduotis yra štai kas ir nieko daugiau:

```
id            unikalus identifikatorius
title         tekstas — vienintelis privalomas laukas
status        'todo' | 'doing' | 'done'
priority      1 (aukštas) | 2 (vidutinis) | 3 (žemas)
due_at        null  ARBA  '2026-08-20'  ARBA  '2026-08-20T18:00'
due_has_time  ar terminas turi valandą
remind_at     kada suskambės žadintuvas (arba null)
completed_at  kada pažymėta atlikta
repeat        null  ARBA  'w:2' (kas antradienį)  ARBA  'm:15' (kas 15 dieną)
```

**Nėra** aprašymo laukelio, subužduočių, žymų, priedų, projektų ar kategorijų. Nekurk jų — sistema jų nepalaiko, ir tai sąmoningas sprendimas.

### Penkios taisyklės, be kurių dizainas meluos

Šitos nėra techninės smulkmenos — jos yra pati produkto logika. Jei dizainas joms prieštarauja, jis vaizduoja kitą programą.

**1. `due_at = null` reiškia „šiandien", o ne „be datos".**
Užduotis be datos yra šiandienos darbas. Neatlikta ji persiverčia į kitą dieną ir vėl yra „šiandien" — amžinai, kol nepadaroma. Data rašoma **tik** tada, kai naudotojas sąmoningai atideda į ateitį. Todėl daugumos kortelių datos žymės apskritai neturės, ir tai normalu, ne trūkumas.

**2. Laikas reiškia žadintuvą.**
„Rytoj" — tiesiog terminas. „Rytoj 18:00" — 18:00 iššoks langas su garsu. Tai skirtingi dalykai, ir kortelė turi leisti juos atskirti iš pirmo žvilgsnio. Dabartinė versija prie datos su laiku piešia varpelio ženkliuką ir nuspalvina žymę akcento spalva; tavo sprendimas gali būti kitoks, bet vien valanda tekste per silpna — ji perskaitoma tik įsižiūrėjus.

**3. Savaitė slenkanti, ne kalendorinė.**
Keturios datos kolonos: **Šiandien / Rytoj / Per savaitę / Vėliau**. „Per savaitę" yra šiandien+2 iki šiandien+7 dienų, ne „iki sekmadienio". Todėl nė viena kolona niekada nebūna tuščia dėl savaitės dienos.

**4. Pradelstos gyvena „Šiandien" stulpelyje.**
Nėra atskiros „Pradelsta" kolonos. Užduotis, turėjusi realų terminą ir jį praleidusi, rodoma šiandienos stulpelio viršuje ir vizualiai pažymėta. Užduotis be datos **niekada** nėra pradelsta — ji tiesiog vis dar šiandienos darbas.

**5. Pasikartojanti užduotis pažymėta atlikta neužsidaro.**
Jei `repeat` nėra `null`, varnelė ją ne uždaro, o **perkelia**: terminas peršoka į artimiausią kitą kartą, būsena lieka „reikia padaryti", `completed_at` nenustatomas. Naudotojui atrodo, kad ji dingo iš šiandienos ir grįš kitą savaitę.

Todėl kortelė **privalo** kažkaip parodyti, kad ji pasikartojanti — antraip varnelės paspaudimas atrodo kaip programos klaida. Dabartinė versija naudoja mažą `↻` ženklą prie datos; tavo sprendimas gali būti kitoks, bet be jokio žymėjimo dizainas bus melagingas.

Pasekmė, kurią irgi reikia gerbti: pasikartojančios užduotys **niekada nepatenka** į „Padaryta" rodinį, nes atlikimo laikas joms nefiksuojamas.

### Rūšiavimas kolonoje

Pirma pagal terminą (be datos — gale), tada pagal prioritetą, tada pagal sukūrimo laiką. Rankinio kortelių tampymo eilės tvarkos nėra. Tempimas keičia **datą arba būseną**, ne vietą sąraše.

## Ką ekranas privalo padaryti

- **Sukurti užduotį per porą sekundžių.** Įvedimo laukas visada matomas, be modalo. Įrašai tekstą, spaudi Enter — užduotis atsiranda „Šiandien". Šalia turi būti greitas būdas nurodyti terminą (šiandien / rytoj / konkreti data), laiką ir prioritetą, jei to reikia — bet nieko iš to nurodyti **neprivaloma**.
- **Perjungti grupavimą** tarp trijų reikšmių. Tas pats užduočių rinkinys, trys skalės:
  - **Datos** — `Šiandien / Rytoj / Per savaitę / Vėliau`
  - **Progresas** — `Reikia padaryti / Vykdoma / Atlikta`
  - **Padaryta** — **tik atliktos**, pagal atlikimo laiką: `Šiandien / Vakar / Šią savaitę / Anksčiau`, naujausia viršuje. Virš kolonų — viena eilutė „Per savaitę padaryta 23".
- **Peržiūrėti laikotarpį.** „Padaryta" rodinyje virš kolonų — du datos laukai (`Nuo`, `Iki`, numatytieji: paskutinės 30 dienų) ir mygtukas „Peržiūrėti". Paspaudus jį keturios kolonos pakeičiamos vienu plokščiu sąrašu (atlikimo data, pavadinimas, prioritetas; naujausia viršuje) su antrašte „Padaryta: N"; „Grįžti" grąžina kolonas. Sąrašo eilutė yra tekstas, ne kortelė — čia žiūrima, o ne dirbama, tad varnelės, ištrynimo ir redagavimo joje nėra.
- **Nurodyti kartojimą** termino redaktoriuje: nesikartoja / savaitės diena / mėnesio diena. Pasirinkus, terminas iškart perskaičiuojamas į artimiausią kitą kartą.
- **Filtruoti pagal prioritetą** — trys būsenos, galima kelias vienu metu. Datos filtro nėra: data jau *yra* grupavimas. Filtras veikia ir „Padaryta" rodinyje.
- **Slėpti atliktas** pagal nutylėjimą datų rodinyje, su jungikliu joms parodyti. Progreso rodinyje jos visada matomos savo kolonoje. „Padaryta" rodinyje jungiklis prasmės neturi — ten rodomos tik atliktos.
- **Tempti korteles tarp kolonų** — ir pele, ir **pirštu planšetėje**. Tempimas į „Rytoj" nustato rytdienos datą; į progreso koloną — keičia būseną. **„Padaryta" rodinyje tempimo nėra**: atlikimo data pasako, kada iš tikrųjų padarei, ir tempti kortelę iš „Vakar" į „Šiandien" reikštų perrašyti istoriją.
- **Redaguoti pavadinimą vietoje**, be modalinio lango. Paspaudus datos žymę — atsiverti terminą ir prioritetą.
- **Pažymėti atlikta ir ištrinti** vienu veiksmu iš kortelės.
- **Šviesi ir tamsi tema.** Tamsi nėra papildoma funkcija — planšetė dažnai stovi tamsiame kambaryje vakare.

## Laisvė ir vienintelė riba

Dabartinė versija (2026-08-19, dizaino kalba „Švelnus") atrodo taip: rėmelių beveik nėra — riba tarp elementų brėžiama pakopa ir tarpu, ne linija. Kortelė laikosi minkštu šešėliu ant šviesios kolonos plokštės, apvalinimai 10–14 px, visi mygtukai yra apvalūs lustai, o pažymėjimas — švelnus indigo potepis. Prioritetas rodomas įtraukta suapvalinta juostele kortelės kairėje. Judesys trumpas, 120 ms.

**Nesijausk įpareigotas to laikytis.** Naudok spalvų paletę, tarpus, tipografiją, gilumą, judesį, apvalinimus — ką laikai teisinga. Noriu, kad tai atrodytų kaip įrankis, kurį smagu atsidaryti, o ne kaip įmonės vidinė sistema. Jei matai geresnę kryptį nei dabartinė — siūlyk ją.

Bet yra viena riba, kuri nesiderasi:

> **Lenta su keturiasdešimčia užduočių turi likti perskaitoma per sekundę.**

Tai vienintelis dalykas, dėl kurio šis įrankis egzistuoja. Jei dėl grožio kortelės išaugo taip, kad tilptų šešios, arba spalvų tiek, kad prioritetas nebeišsiskiria — dizainas pralaimėjo, kad ir kaip gražiai atrodytų ekrano nuotraukoje su trimis užduotimis. **Testuok savo dizainą pilna lenta, ne tuščia.**

Prioritetas turi likti atpažįstamas neskaitant teksto. Kaip tai pasieksi — spalva, svoriu, ženklu, padėtimi — tavo sprendimas.

## Ko nedaryti

Šitie dalykai atrodo „modernūs", bet šiam produktui kenkia:

- **Modalai naujai užduočiai.** Įvedimas turi būti vietoje.
- **Ilgos animacijos.** Viskas, kas ilgiau nei ~200 ms, kasdienėje eigoje ima erzinti.
- **Tuščias „hero" plotas viršuje.** Ekrano viršus yra brangiausia vieta; ten turi būti užduotys arba įvedimas.
- **Šoninė navigacija.** Yra vienas ekranas. Meniu nėra ko dėti.
- **Grafikai, „produktyvumo" balai, serijos, palyginimai su praėjusiu laikotarpiu.** Jie verčia jaustis kaltu dėl neatliktų darbų. Skaičiuoti leidžiama tik dviem vietomis, ir abi yra vienas skaičius be jokios grafikos: eilutė „Per savaitę padaryta 23" ir laikotarpio peržiūros antraštė „Padaryta: 23". Nepaversk nė vienos jų diagrama, progreso juosta ar tikslu.
- **Ikonos be teksto** ten, kur reikšmė neakivaizdi.
- **Stiklo efektai ir gradientai fone po tekstu**, jei jie mažina kontrastą.
- **Emocinės iliustracijos tuščioje būsenoje.** Trumpas sakinys pakanka.

## Ką grąžinti

**Vieną savarankišką `.html` failą**, kurį galima atidaryti dukart spragtelėjus. Viskas viduje: stilius, logika, duomenys. Jokių išorinių bibliotekų, šriftų iš CDN ar tinklo užklausų.

- **Netikri duomenys — realistiški ir lietuviški.** Bent 25–30 užduočių, išbarstytų per visas kolonas, su skirtingais prioritetais, kelios su laiku, kelios pradelstos, kelios pasikartojančios, ir bent 8–10 atliktų su skirtingomis `completed_at` datomis (šiandien, vakar, prieš kelias dienas, prieš mėnesį, bent kelios senesnės nei mėnuo), kad „Padaryta" rodinys turėtų ką rodyti visose keturiose kolonose ir kad laikotarpio peržiūra, pasirinkus platesnį nei numatytasis intervalą, turėtų ką rodyti. Pavadinimai turi skambėti kaip tikri („Užsakyti vasarines padangas", „Paskambinti dėl draudimo", „Nunešti baterijas į konteinerį"), o ne „Užduotis 1".
- **Veikianti sąveika:** grupavimo perjungimas per visas tris reikšmes, laikotarpio peržiūra, prioriteto filtras, atliktų slėpimas, varnelė (įskaitant pasikartojančios peršokimą), tempimas tarp kolonų, temos perjungimas. Duomenys gyvena atmintyje — perkrovus gali atsistatyti.
- **Prisitaikymas:** patikrink 1920 px pločio monitoriuje ir 820 px planšetėje. Planšetėje kolonos gali būti slenkamos horizontaliai.
- **Klaviatūra pasiekiama:** įvedimas, varnelės ir mygtukai turi veikti be pelės.

Pabaigoje trumpai — keliais sakiniais, ne ataskaita — paaiškink pagrindinius sprendimus: kaip parodei prioritetą, kaip atskyrei terminą nuo žadintuvo, kaip pažymėjai pasikartojančias, ir ką paaukojai, kad lenta liktų perskaitoma prikrauta.

Jei kuri nors taisyklė aukščiau tau atrodo klaidinga produkto požiūriu — pasakyk tai atskirai, bet dizainą pateik pagal jas.
