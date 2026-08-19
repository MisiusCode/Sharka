# Laikotarpio peržiūra — įgyvendinimo planas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** „Padaryta" rodinyje leisti nurodyti laikotarpį ir pamatyti, kas per jį padaryta — plokščias sąrašas su vienu skaičiumi.

**Architecture:** Filtravimas pagal intervalą — grynos funkcijos esamame `core/completed.ts`. Sąsaja — antra to paties rodinio būsena `Board.tsx` viduje, laikoma vietiniame `useState`, be nustatymų, schemos ir API pakeitimų.

**Tech Stack:** ta pati — TypeScript strict, React 19, Vitest su jsdom.

**Specifikacija:** `docs/superpowers/specs/2026-08-18-statistika-design.md`

## Global Constraints

- **Node 22+**, TypeScript `strict: true`. Jokio `any` viešose signatūrose. `npm run typecheck` — realūs vartai.
- **Reliatyvūs importai su `.js` galūne**, nors failai `.ts`/`.tsx`.
- **`src/core/completed.ts` importuoja tik `./datetime.js` ir `./types.js`** — jį naudoja naršyklės paketas.
- **`src/ui/` neimportuoja `electron` ir Node modulių.**
- **Jokių schemos, API ir nustatymų pakeitimų.** Laikotarpis nėra nustatymas — tai vienkartinė užklausa vietiniame komponentės būsenoje.
- **Spalva lentoje reiškia tik prioritetą.** Antraštė ir datos sąraše — pilkos.
- **Jokių grafikų, procentų, palyginimų su praėjusiu laikotarpiu.** Vienas skaičius ir sąrašas.
- Vartotojui matomi tekstai — lietuviški.

---

## Failų struktūra

```
src/core/completed.ts             +defaultRange, isValidRange, completedBetween
src/ui/components/Board.tsx       +laikotarpio eilutė, antraštė, plokščias sąrašas
src/ui/theme.css                  +.laikotarpis, .atlikimu-sarasas
tests/core/completed.test.ts      +grynų funkcijų testai
tests/ui/Board.test.tsx           +rodinio testai
README.md, docs/frontend-dizaino-promptas.md,
docs/superpowers/specs/2026-08-17-ka-padariau-design.md   (3 užduotis)
```

---

### Task 1: Intervalo funkcijos

**Files:**
- Modify: `src/core/completed.ts`
- Test: `tests/core/completed.test.ts`

**Interfaces:**
- Consumes: `addDays` iš `./datetime.js`; esamas privatus `completedDate` pagalbininkas; `sortByCompleted`
- Produces: `defaultRange(today: string): { from: string; to: string }`, `isValidRange(from: string, to: string): boolean`, `completedBetween(tasks: Task[], from: string, to: string): Task[]`

- [ ] **Step 1: Parašyti krentančius testus**

Pridėti į `tests/core/completed.test.ts` (failo `task()` pagalbininkas jau yra):

```ts
import { completedBetween, defaultRange, isValidRange } from '../../src/core/completed.js';

describe('defaultRange', () => {
  it('grąžina 30 dienų intervalą, kurio pabaiga šiandien', () => {
    expect(defaultRange('2026-08-18')).toEqual({ from: '2026-07-20', to: '2026-08-18' });
  });

  it('teisingai peržengia metų ribą', () => {
    expect(defaultRange('2027-01-05')).toEqual({ from: '2026-12-07', to: '2027-01-05' });
  });
});

describe('isValidRange', () => {
  it('priima teisingą intervalą ir lygias datas', () => {
    expect(isValidRange('2026-08-01', '2026-08-18')).toBe(true);
    expect(isValidRange('2026-08-18', '2026-08-18')).toBe(true);
  });

  it('atmeta apverstą intervalą', () => {
    expect(isValidRange('2026-08-19', '2026-08-18')).toBe(false);
  });

  it('atmeta tuščią datą', () => {
    // Būtina: `<input type="date">` ištrynus reikšmę duoda tuščią eilutę, o
    // '' <= '2026-08-18' leksikografiškai yra true — vien palyginimo neužtenka.
    expect(isValidRange('', '2026-08-18')).toBe(false);
    expect(isValidRange('2026-08-01', '')).toBe(false);
    expect(isValidRange('', '')).toBe(false);
  });
});

describe('completedBetween', () => {
  it('įtraukia abi kraštines dienas', () => {
    const rasta = completedBetween(
      [
        done('pradzia', '2026-08-01T09:00:00.000Z'),
        done('vidurys', '2026-08-10T09:00:00.000Z'),
        done('pabaiga', '2026-08-18T09:00:00.000Z'),
      ],
      '2026-08-01',
      '2026-08-18',
    );
    expect(rasta.map((t) => t.id)).toEqual(['pabaiga', 'vidurys', 'pradzia']);
  });

  it('neįtraukia dienos prieš pradžią ir po pabaigos', () => {
    const rasta = completedBetween(
      [
        done('anksti', '2026-07-31T09:00:00.000Z'),
        done('gerai', '2026-08-05T09:00:00.000Z'),
        done('velai', '2026-08-19T09:00:00.000Z'),
      ],
      '2026-08-01',
      '2026-08-18',
    );
    expect(rasta.map((t) => t.id)).toEqual(['gerai']);
  });

  it('neįtraukia neatliktų ir nenuoseklių', () => {
    const rasta = completedBetween(
      [
        done('neatlikta', null, 'todo'),
        done('nenuosekli', '2026-08-05T09:00:00.000Z', 'todo'),
        done('atlikta', '2026-08-05T09:00:00.000Z'),
      ],
      '2026-08-01',
      '2026-08-18',
    );
    expect(rasta.map((t) => t.id)).toEqual(['atlikta']);
  });

  it('nekeičia paduoto masyvo', () => {
    const originalus = [
      done('a', '2026-08-01T09:00:00.000Z'),
      done('b', '2026-08-18T09:00:00.000Z'),
    ];
    completedBetween(originalus, '2026-08-01', '2026-08-18');
    expect(originalus.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/core/completed.test.ts`
Expected: FAIL — `defaultRange is not a function`

- [ ] **Step 3: Parašyti realizaciją**

Pridėti į `src/core/completed.ts`:

```ts
/** Trisdešimt dienų imtinai iš abiejų pusių: šiandien − 29 … šiandien. */
export function defaultRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -29), to: today };
}

export function isValidRange(from: string, to: string): boolean {
  // Tuščią eilutę tikrinti privaloma: `<input type="date">` ištrynus reikšmę
  // duoda '', o '' <= '2026-08-18' leksikografiškai yra true.
  if (from === '' || to === '') return false;
  return from <= to;
}

export function completedBetween(tasks: Task[], from: string, to: string): Task[] {
  return sortByCompleted(
    tasks.filter((t) => {
      const date = completedDate(t);
      return date !== null && date >= from && date <= to;
    }),
  );
}
```

`sortByCompleted` jau kuria kopiją (`[...tasks].sort(...)`), tad `completedBetween` paduoto masyvo nekeičia.

- [ ] **Step 4: Paleisti testus**

Run: `npx vitest run tests/core/completed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/completed.ts tests/core/completed.test.ts
git commit -m "feat: atliktų užduočių filtravimas pagal laikotarpį"
```

---

### Task 2: Lentos rodinys

**Files:**
- Modify: `src/ui/components/Board.tsx`, `src/ui/theme.css`
- Test: `tests/ui/Board.test.tsx`

**Interfaces:**
- Consumes: `completedBetween`, `defaultRange`, `isValidRange` iš `../../core/completed.js`

- [ ] **Step 1: Parašyti krentančius testus**

Pridėti į `tests/ui/Board.test.tsx`. `setup()` antru argumentu priima grupavimą; laikrodis testuose fiksuotas ties `2026-08-14`.

```tsx
describe('Board — laikotarpio peržiūra', () => {
  it('„Peržiūrėti" pakeičia kolonas sąrašu su bendru skaičiumi', async () => {
    setup([
      task({ id: 'a', title: 'Sena užduotis', status: 'done', completed_at: '2026-07-20T09:00:00.000Z' }),
      task({ id: 'b', title: 'Nauja užduotis', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' }),
    ], 'completed');

    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-08-14' } });
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));

    expect(screen.queryByTestId('kolona-Šiandien')).toBeNull();
    expect(screen.getByText('Padaryta: 2')).toBeDefined();
    expect(screen.getByText('Sena užduotis')).toBeDefined();
    expect(screen.getByText('Nauja užduotis')).toBeDefined();
  });

  it('„Grįžti" grąžina kolonas', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));
    expect(screen.queryByTestId('kolona-Šiandien')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Grįžti' }));
    expect(screen.getByTestId('kolona-Šiandien')).toBeDefined();
  });

  it('tuščias laikotarpis paaiškinamas, o ne paliekamas tuščias', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-01-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));

    expect(screen.getByText('Padaryta: 0')).toBeDefined();
    expect(screen.getByText('Per šį laikotarpį nieko nepadaryta.')).toBeDefined();
  });

  it('apverstas intervalas išjungia mygtuką ir paaiškina', async () => {
    setup([], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-08-20' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-08-10' } });

    expect((screen.getByRole('button', { name: 'Peržiūrėti' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Pradžios data vėlesnė už pabaigos.')).toBeDefined();
  });

  it('perjungus grupavimą peržiūra išjungiama', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));
    expect(screen.queryByTestId('kolona-Šiandien')).toBeNull();

    // Grįžus į „Padaryta" turi būti kolonos, ne senas sąrašas.
    await userEvent.click(screen.getByRole('button', { name: 'Datos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Padaryta' }));

    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
  });

  it('laikotarpio eilutės nėra kituose rodiniuose', async () => {
    setup([task({ id: 'a', title: 'A' })], 'date');
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    expect(screen.queryByLabelText('Nuo')).toBeNull();
  });
});
```

Priešpaskutinis testas grupavimą perjungia per `FilterBar` mygtukus, o tai kviečia `changeGrouping` → `api.patchSettings`. Patikrink, ar `setup()` dublerį sukonfigūruoja taip, kad grąžintų **atnaujintus** nustatymus (o ne pradinius) — jei ne, po paspaudimo `settings.grouping` nepasikeis ir testas tikrins ne tai, ką skelbia. Tokiu atveju pataisyk dublerį, kad `patchSettings` grąžintų sulietus nustatymus; **neperrašyk testo taip, kad jis apeitų perjungimą** — būtent perjungimas čia ir tikrinamas.

- [ ] **Step 2: Paleisti testus ir įsitikinti, kad krenta**

Run: `npx vitest run tests/ui/Board.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Nuo`

- [ ] **Step 3: Papildyti importus ir būseną**

`src/ui/components/Board.tsx` — praplėsti esamą importą iš `completed.js`:

```ts
import {
  COMPLETED_BUCKETS, COMPLETED_LABELS, completedBetween, completedBucketOf,
  defaultRange, doneLastWeek, isValidRange, sortByCompleted,
} from '../../core/completed.js';
```

Prie kitų `useState` iškvietimų pridėti dvi būsenas. `draft` — kas įvesta laukuose, `applied` — kas patvirtinta paspaudus mygtuką:

```tsx
  const [draft, setDraft] = useState(() => defaultRange(formatLocalDate(new Date())));
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
```

- [ ] **Step 4: Išjungti peržiūrą išėjus iš rodinio**

Po `const completedView = ...` eilutės:

```tsx
  // Peržiūra gyvena tik „Padaryta" rodinyje. Nuvalymas per efektą, o ne
  // `changeGrouping` viduje, nes grupavimą gali pakeisti ir kitas įrenginys —
  // tada nustatymai atkeliauja per SSE, o vietinis `changeGrouping` nesuveikia.
  useEffect(() => {
    if (!completedView) setApplied(null);
  }, [completedView]);

  const rangeView = completedView && applied !== null;
  const rangeTasks = applied === null ? [] : completedBetween(visible, applied.from, applied.to);
```

`rangeTasks` skaičiuojamas iš `visible`, tad prioriteto filtras veikia ir peržiūroje.

- [ ] **Step 5: Įterpti laikotarpio eilutę ir antraštę**

Pakeisti esamą suvestinės bloką:

```tsx
      {completedView && (
        <p className="suvestine">Per savaitę padaryta {doneLastWeek(visible, today)}</p>
      )}
```

į:

```tsx
      {completedView && (
        <div className="laikotarpis">
          <label>
            Nuo
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label>
            Iki
            <input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <button
            type="button"
            disabled={!isValidRange(draft.from, draft.to)}
            onClick={() => setApplied(draft)}
          >
            Peržiūrėti
          </button>
          {draft.from !== '' && draft.to !== '' && draft.from > draft.to && (
            <span className="ispejimas">Pradžios data vėlesnė už pabaigos.</span>
          )}
        </div>
      )}

      {completedView && (
        <p className="suvestine">
          {rangeView ? (
            <>
              Padaryta: {rangeTasks.length}{' '}
              <button type="button" onClick={() => setApplied(null)}>
                Grįžti
              </button>
            </>
          ) : (
            <>Per savaitę padaryta {doneLastWeek(visible, today)}</>
          )}
        </p>
      )}
```

- [ ] **Step 6: Įterpti plokščią sąrašą**

Esamą `<DndContext>` bloką **apgaubti sąlyga, jo vidaus nekeičiant**. Peržiūroje kolonų ir tempimo konteinerio apskritai nėra, tad `DndContext`, `Column`, `kortelesProps` ir `DraggableCard` lieka lygiai tokie, kokie yra faile — keičiasi tik tai, kad prieš juos atsiranda ternaro šaka:

```tsx
      {rangeView ? (
        rangeTasks.length === 0 ? (
          <p className="tuscia">Per šį laikotarpį nieko nepadaryta.</p>
        ) : (
          <ul className="atlikimu-sarasas">
            {rangeTasks.map((t) => (
              <li key={t.id}>
                <span className="prioriteto-juostele" data-prioritetas={t.priority} />
                <span className="atlikimo-data">{t.completed_at?.slice(0, 10) ?? ''}</span>
                <span>{t.title}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {/* esamas kolonų blokas nepakeistas */}
        </DndContext>
      )}
```

Eilutė yra tekstas, ne valdiklis: jokios varnelės, ištrynimo ar redagavimo. Atlikimo data pasako, kada iš tikrųjų padarei, ir istorijos iš šio rodinio keisti negalima — ta pati priežastis, dėl kurios „Padaryta" rodinyje išjungtas tempimas.

- [ ] **Step 7: Papildyti stilius**

`src/ui/theme.css`:

```css
.laikotarpis {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--tekstas-blankus);
}

.laikotarpis label {
  display: flex;
  align-items: center;
  gap: 4px;
}

.atlikimu-sarasas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.atlikimu-sarasas li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
}

.atlikimu-sarasas .prioriteto-juostele {
  width: 3px;
  height: 16px;
  border-radius: 2px;
  flex: none;
}

.atlikimo-data {
  color: var(--tekstas-blankus);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.tuscia {
  color: var(--tekstas-blankus);
  font-size: 13px;
}
```

- [ ] **Step 8: Paleisti viską**

Run: `npm test`, `npm run typecheck`, `npm run build`
Expected: PASS ir švaru

- [ ] **Step 9: Rankinė patikra**

Run: `npm run app`

1. „Padaryta" rodinyje matomi laukai `Nuo`/`Iki` su paskutinių 30 dienų reikšmėmis
2. Paspaudus „Peržiūrėti" kolonos pakeičiamos sąrašu su „Padaryta: N"
3. „Grįžti" grąžina kolonas
4. Nurodžius laikotarpį be atliktų — paaiškinimas, ne tuščias ekranas
5. Apvertus datas mygtukas neaktyvus
6. Kituose dviejuose rodiniuose laikotarpio eilutės nėra
7. Sąraše matoma prioriteto juostelė

- [ ] **Step 10: Commit**

```bash
git add src/ui/components/Board.tsx src/ui/theme.css tests/ui/Board.test.tsx
git commit -m "feat: laikotarpio peržiūra „Padaryta\" rodinyje"
```

---

### Task 3: Dokumentacija ir anksčiau priimtų sprendimų atšaukimas

Ši užduotis atskira, nes ji ne aprašo naują funkciją, o **atšaukia tris dokumentuose užrašytus priešingus sprendimus**. Palikti juos reikštų, kad dokumentai prieštarauja kodui.

**Files:**
- Modify: `README.md`, `docs/frontend-dizaino-promptas.md`, `docs/superpowers/specs/2026-08-17-ka-padariau-design.md`

- [ ] **Step 1: README — aprašyti funkciją**

Skiltyje „Naudojimas", „Padaryta" punkto pabaigoje pridėti:

```markdown
    Virš kolonų — laukai **Nuo** ir **Iki** bei mygtukas **„Peržiūrėti"**:
    nurodžius laikotarpį, kolonos pakeičiamos plokščiu sąrašu su antrašte
    „Padaryta: N", o „Grįžti" grąžina įprastą rodinį. Laikotarpis niekur
    nesaugomas — tai vienkartinė užklausa, kuri po perkrovimo grįžta į
    paskutines 30 dienų.
```

- [ ] **Step 2: README — papildyti apribojimą**

Punktas apie pasikartojančias užduotis „Padaryta" rodinyje galioja ir laikotarpio peržiūrai. Jo pabaigoje pridėti sakinį:

```markdown
  Tas pats galioja ir laikotarpio peržiūrai.
```

- [ ] **Step 3: Dizaino promptas — pataisyti draudimą**

`docs/frontend-dizaino-promptas.md`, skiltyje „Ko nedaryti", punktą apie statistiką pakeisti į:

```markdown
- **Grafikai, „produktyvumo" balai, serijos, palyginimai su praėjusiu laikotarpiu.** Jie verčia jaustis kaltu dėl neatliktų darbų. Skaičiuoti leidžiama tik dviem vietomis, ir abi yra vienas skaičius be jokios grafikos: eilutė „Per savaitę padaryta 23" ir laikotarpio peržiūros antraštė „Padaryta: 23". Nepaversk nė vienos jų diagrama, progreso juosta ar tikslu.
```

- [ ] **Step 4: Dizaino promptas — aprašyti pačią peržiūrą**

Skiltyje „Ką ekranas privalo padaryti", po „Padaryta" režimo punkto pridėti:

```markdown
- **Peržiūrėti laikotarpį.** „Padaryta" rodinyje virš kolonų — du datos laukai (`Nuo`, `Iki`, numatytieji: paskutinės 30 dienų) ir mygtukas „Peržiūrėti". Paspaudus jį keturios kolonos pakeičiamos vienu plokščiu sąrašu (atlikimo data, pavadinimas, prioritetas; naujausia viršuje) su antrašte „Padaryta: N"; „Grįžti" grąžina kolonas. Sąrašo eilutė yra tekstas, ne kortelė — čia žiūrima, o ne dirbama, tad varnelės, ištrynimo ir redagavimo joje nėra.
```

- [ ] **Step 5: Dizaino promptas — papildyti reikalavimus grąžinamam failui**

Skiltyje „Ką grąžinti", punkte apie veikiančią sąveiką, po „grupavimo perjungimas per visas tris reikšmes" pridėti „laikotarpio peržiūra". Netikrų duomenų punkte jau reikalaujama 8–10 atliktų su skirtingomis datomis — patikrink, ar jos išsibarsčiusios pakankamai plačiai, kad laikotarpio peržiūra turėtų ką rodyti; jei ne, papildyk reikalavimą „bent kelios senesnės nei mėnuo".

- [ ] **Step 6: Pažymėti atšauktą sprendimą „Ką padariau" specifikacijoje**

`docs/superpowers/specs/2026-08-17-ka-padariau-design.md` yra datuotas sprendimų įrašas — jo neperrašyk, o pažymėk, kaip padaryta pradinėje specifikacijoje.

4 skyriuje (**Suvestinė**), po esamo teksto:

```markdown
> **Papildyta 2026-08-18.** Vienas skaičius lieka vieninteliu skaičiumi, bet
> naudotojas paprašė būdo pasižiūrėti ir už nurodytą laikotarpį. Žr.
> `2026-08-18-statistika-design.md`. Grafikai, serijos ir produktyvumo balai
> tebėra atmesti — atšaukta tik ta dalis, kuri neleido pasirinkti laikotarpio.
```

10 skyriuje (**Ko sąmoningai nedarom**) punktą apie grafikus palik, bet pridėk po sąrašu:

```markdown
> **Pakeista 2026-08-18.** Šio sąrašo pirmas punktas galiojo tik iš dalies:
> grafikų, serijų ir balų nėra ir nebus, bet laikotarpio peržiūra atsirado.
```

- [ ] **Step 7: Commit**

```bash
git add README.md docs/frontend-dizaino-promptas.md docs/superpowers/specs/2026-08-17-ka-padariau-design.md
git commit -m "docs: laikotarpio peržiūra ir anksčiau priimto priešingo sprendimo atšaukimas"
```

---

## Pabaigos patikra

- „Peržiūrėti" pakeičia kolonas sąrašu; „Grįžti" jas grąžina
- Kraštinės intervalo dienos įtraukiamos
- Apverstas ar tuščias intervalas mygtuką išjungia
- Perjungus grupavimą peržiūra išjungiama bet kuriuo iš trijų perjungiklio mygtukų
- Prioriteto filtras veikia ir peržiūroje
- Dokumentuose nebeliko teiginių, kad statistikos nedarom
