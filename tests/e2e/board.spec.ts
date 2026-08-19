import { expect, test } from '@playwright/test';

// Visi testai dalijasi vienu serveriu ir viena duomenų baze be jokio
// tarpusavio izoliavimo — be šito, viena testo paliktos užduotys keistų
// kitų testų kolonų turinį (pvz., filtrus, rūšiavimą) priklausomai nuo
// vykdymo tvarkos.
test.afterEach(async ({ request }) => {
  const res = await request.get('/api/tasks');
  const tasks = (await res.json()) as { id: string }[];
  await Promise.all(tasks.map((t) => request.delete(`/api/tasks/${t.id}`)));

  // Grupavimas saugomas serveryje, tad testas, perjungęs lentą į „Padaryta",
  // palikdavo ją tokią kitiems — o ten neatliktos užduotys nesimato visai.
  // Be šito eilučių tvarka tampa paslėpta priklausomybe: naujas testas lūžta
  // ne dėl savęs, o dėl to, kas vyko prieš jį.
  await request.patch('/api/settings', { data: { grouping: 'date' } });
});

test('užduotis sukuriama, pažymima ir ištrinama', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Nauja užduotis').fill('Nupirkti pieną');
  await page.getByLabel('Nauja užduotis').press('Enter');

  const siandien = page.getByTestId('kolona-Šiandien');
  await expect(siandien.getByText('Nupirkti pieną')).toBeVisible();

  // `.check()` po paspaudimo tikrina, kad varnelė liktų pažymėta ir matoma —
  // čia užduotis, tapusi atlikta, iš karto dingsta (numatytas filtras rodo tik
  // nebaigtas), tad tokio patvirtinimo sulaukti neįmanoma. `.click()` atlieka
  // tą patį paspaudimą, o tikrasis rezultatas patikrinamas kitoje eilutėje.
  await siandien.getByRole('checkbox', { name: 'Pažymėti atlikta' }).click();
  await expect(page.getByText('Nupirkti pieną')).toBeHidden();

  await page.getByRole('checkbox', { name: 'Rodyti atliktas' }).check();
  await page.getByRole('button', { name: 'Ištrinti' }).click();
  await expect(page.getByText('Nupirkti pieną')).toBeHidden();
});

test('rytdienos užduotis patenka į koloną „Rytoj"', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Rytoj' }).click();
  await page.getByLabel('Nauja užduotis').fill('Rytojaus darbas');
  await page.getByLabel('Nauja užduotis').press('Enter');

  await expect(page.getByTestId('kolona-Rytoj').getByText('Rytojaus darbas')).toBeVisible();
});

test('grupavimo perjungiklis išlieka perkrovus puslapį', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Progresas' }).click();
  await expect(page.getByTestId('kolona-Reikia padaryti')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('kolona-Reikia padaryti')).toBeVisible();

  // Grupavimas saugomas serveryje, tad be grąžinimo jis nutekėtų į kitus testus.
  await page.getByRole('button', { name: 'Datos' }).click();
  await expect(page.getByTestId('kolona-Šiandien')).toBeVisible();
});

test('pakeitimas viename lange pasirodo kitame per SSE', async ({ browser }) => {
  const kompas = await browser.newPage();
  const plansete = await browser.newPage();
  await kompas.goto('/');
  await plansete.goto('/');

  await kompas.getByLabel('Nauja užduotis').fill('Bendra užduotis');
  await kompas.getByLabel('Nauja užduotis').press('Enter');

  await expect(plansete.getByText('Bendra užduotis')).toBeVisible({ timeout: 5000 });
});

test('kortelė tempiama iš „Šiandien" į „Rytoj" ir terminas pasikeičia', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Nauja užduotis').fill('Tempiama užduotis');
  await page.getByLabel('Nauja užduotis').press('Enter');

  const kortele = page.getByTestId('kolona-Šiandien').getByText('Tempiama užduotis');
  const kolonaRytoj = page.getByTestId('kolona-Rytoj');

  // `locator.dragTo()` šoka į taikinį vienu dideliu `mousemove` be tarpinių
  // taškų. @dnd-kit „PointerSensor“ su `activationConstraint: { distance: 6 }`
  // pirmą įvykį, viršijantį 6px, sunaudoja vien tempimui suaktyvinti (pradinei
  // pozicijai užfiksuoti) ir tos pačios pozicijos naujam „over“ elementui
  // apskaičiuoti nepanaudoja — atleidus pelę „over“ lieka `null`, kortelė
  // niekur nepersikelia. Realiam vartotojui pelė juda tarpiniais taškais, tad
  // čia tai imituojama rankiniu būdu.
  const src = await kortele.boundingBox();
  const dst = await kolonaRytoj.boundingBox();
  if (src === null || dst === null) throw new Error('Nepavyko nustatyti elementų ribų');

  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  const steps = 10;
  const startX = src.x + src.width / 2;
  const startY = src.y + src.height / 2;
  const endX = dst.x + dst.width / 2;
  const endY = dst.y + dst.height / 2;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      startX + ((endX - startX) * i) / steps,
      startY + ((endY - startY) * i) / steps,
    );
  }
  await page.mouse.up();

  await expect(kolonaRytoj.getByText('Tempiama užduotis')).toBeVisible();
  await expect(page.getByTestId('kolona-Šiandien').getByText('Tempiama užduotis')).toBeHidden();
});

test('Escape atšaukia pavadinimo redagavimą net paspaudus šalia', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Nauja užduotis').fill('Originalus pavadinimas');
  await page.getByLabel('Nauja užduotis').press('Enter');

  await page.getByText('Originalus pavadinimas').click();
  const laukas = page.getByRole('textbox', { name: 'Užduoties pavadinimas' });
  await laukas.fill('Pakeista');
  await laukas.press('Escape');
  await page.getByTestId('kolona-Rytoj').click(); // fokusas nukeliauja kitur

  await expect(page.getByText('Originalus pavadinimas')).toBeVisible();
  await expect(page.getByText('Pakeista')).toBeHidden();
});

test('prioriteto keitimas per DueEditor išlieka po puslapio perkrovimo', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Nauja užduotis').fill('Prioriteto keitimas');
  await page.getByLabel('Nauja užduotis').press('Enter');

  const kortele = page.getByTestId('kolona-Šiandien').locator('.kortele-blokas', {
    hasText: 'Prioriteto keitimas',
  });
  await kortele.getByRole('button', { name: 'Keisti terminą' }).click();
  await kortele.getByRole('button', { name: 'Aukštas prioritetas' }).click();

  await expect(kortele.locator('.prioriteto-juostele[data-prioritetas="1"]')).toBeVisible();

  await page.reload();

  const korteleAfter = page.getByTestId('kolona-Šiandien').locator('.kortele-blokas', {
    hasText: 'Prioriteto keitimas',
  });
  await expect(korteleAfter.locator('.prioriteto-juostele[data-prioritetas="1"]')).toBeVisible();
});

test('planšetės plotyje kolonos slenkamos horizontaliai', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');

  const kolonos = page.locator('.kolonos');
  const overflow = await kolonos.evaluate((el) => getComputedStyle(el).overflowX);
  expect(overflow).toBe('auto');
});

// Trys patikros dizaino perpiešimui (2026-08-19). Visos tikrina išdėstymą,
// kurio jsdom neskaičiuoja: vienetiniai testai čia praeitų nepriklausomai nuo
// to, ar CSS teisingas. Būtent taip kadaise prasprūdo prioriteto juostelė,
// pabėgusi iš savo eilutės ir susikrovusi puslapio kampe.

test('prioriteto juostelė lieka savo kortelės ribose', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nauja užduotis').fill('Juostelės patikra');
  await page.getByLabel('Nauja užduotis').press('Enter');

  const kortele = page.locator('.kortele').filter({ hasText: 'Juostelės patikra' });
  await expect(kortele).toBeVisible();

  const kort = await kortele.boundingBox();
  const juost = await kortele.locator('.prioriteto-juostele').boundingBox();
  if (kort === null || juost === null) throw new Error('nepavyko išmatuoti');

  expect(juost.x).toBeGreaterThanOrEqual(kort.x);
  expect(juost.y).toBeGreaterThanOrEqual(kort.y);
  expect(juost.x + juost.width).toBeLessThanOrEqual(kort.x + kort.width);
  expect(juost.y + juost.height).toBeLessThanOrEqual(kort.y + kort.height);
});

test('žadintuvo varpelis matomas ir telpa į datos žymę', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nauja užduotis').fill('Varpelio patikra');
  await page.getByLabel('Laikas').fill('18:00');
  await page.getByLabel('Laikas').blur();
  await page.getByLabel('Nauja užduotis').press('Enter');

  const zyme = page.getByTestId('datos-zyme').filter({ hasText: '18:00' });
  await expect(zyme).toBeVisible();

  // Pamatuota, ne atspėta: be nurodyto dydžio įterptinis SVG lanksčiame
  // konteineryje susitraukia iki 0×0 — ne išsipučia. Todėl svarbiausias čia yra
  // apatinis rėžis; tikrinti vien „ne per didelis" reikštų testą, kuris lieka
  // žalias ties dingusiu ženkliuku.
  const dydis = await zyme.locator('svg').boundingBox();
  const zymesDydis = await zyme.boundingBox();
  if (dydis === null || zymesDydis === null) throw new Error('nepavyko išmatuoti');

  expect(dydis.width).toBeGreaterThan(4);
  expect(dydis.height).toBeGreaterThan(4);
  expect(dydis.width).toBeLessThan(zymesDydis.width);
  expect(dydis.height).toBeLessThanOrEqual(zymesDydis.height);
});

test('kolonos antraštė rodo užduočių kiekį', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nauja užduotis').fill('Pirma');
  await page.getByLabel('Nauja užduotis').press('Enter');
  await page.getByLabel('Nauja užduotis').fill('Antra');
  await page.getByLabel('Nauja užduotis').press('Enter');

  const skaicius = page.getByTestId('kolona-Šiandien').locator('h2 .skaicius');
  await expect(skaicius).toHaveText('2');
  await expect(page.getByTestId('kolona-Rytoj').locator('h2 .skaicius')).toHaveText('0');
});

// Lietuviško kalendoriaus patikros (2026-08-19). Būtent čia jsdom bejėgis:
// `<input type="date">` jame yra paprastas laukas be jokio kalendoriaus, tad
// vienetinis testas niekada nepamatytų, kad naršyklė piešia angliškai.

test('lentoje neliko nė vieno natyvaus datos laukelio', async ({ page }) => {
  await page.goto('/');

  // Tai ir yra tikrasis saugiklis: `<input type="date">` paklūsta NARŠYKLĖS,
  // o ne puslapio kalbai, tad kiekvienas toks laukas planšetėje vėl būtų
  // angliškas — ir jokio HTML atributo tam pataisyti nėra.
  await page.getByLabel('Nauja užduotis').fill('Datos patikra');
  await page.getByLabel('Nauja užduotis').press('Enter');
  await page.getByRole('button', { name: 'Padaryta' }).click();

  await expect(page.locator('input[type="date"]')).toHaveCount(0);
});

test('kalendorius lietuviškas ir prasideda pirmadieniu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Padaryta' }).click();

  await page.getByRole('button', { name: 'Nuo — kalendorius' }).click();

  const kalendorius = page.locator('.kalendorius');
  await expect(kalendorius).toBeVisible();

  // Mėnuo vardininku, metai šalia — angliškame kalendoriuje čia būtų „August".
  await expect(kalendorius.locator('.kalendoriaus-antraste span')).toHaveText(
    /^\d{4} (sausis|vasaris|kovas|balandis|gegužė|birželis|liepa|rugpjūtis|rugsėjis|spalis|lapkritis|gruodis)$/,
  );

  await expect(kalendorius.locator('.savaites-dienos span')).toHaveText(
    ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'],
  );
});

test('kalendoriuje pasirinkta diena tampa užduoties terminu', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nauja užduotis').fill('Kalendoriaus užduotis');
  await page.getByLabel('Nauja užduotis').press('Enter');

  const kortele = page.locator('.kortele-blokas').filter({ hasText: 'Kalendoriaus užduotis' });
  await kortele.getByLabel('Keisti terminą').click();
  await kortele.getByRole('button', { name: 'Data — kalendorius' }).click();

  // Renkam dieną iš rodomo mėnesio, kad nepakliūtume į prigesintą užpildą.
  const diena = kortele.locator('.kalendoriaus-dienos button[data-menesyje="true"]').nth(20);
  const data = await diena.getAttribute('data-data');
  await diena.click();

  await expect(kortele.locator('.kalendorius')).toBeHidden();

  await page.reload();
  const zyme = page.locator('.kortele-blokas')
    .filter({ hasText: 'Kalendoriaus užduotis' })
    .getByTestId('datos-zyme');
  // Data rodoma lietuviškai, kilmininku — „rugpjūčio 20", ne „2026-08-20".
  await expect(zyme).toHaveText(
    new RegExp(`(sausio|vasario|kovo|balandžio|gegužės|birželio|liepos|rugpjūčio|rugsėjo|spalio|lapkričio|gruodžio) ${Number(data!.slice(8, 10))}$`),
  );
});
