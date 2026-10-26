import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { createTaskStore, type TaskStore } from '../../src/core/tasks.js';

let store: TaskStore;
let clock: ReturnType<typeof fixedClock>;

beforeEach(() => {
  clock = fixedClock('2026-08-14T10:00:00');
  store = createTaskStore(openDb(':memory:'), clock);
});

describe('create', () => {
  it('užpildo numatytąsias reikšmes', () => {
    const t = store.create({ title: 'Nupirkti pieną' });
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.status).toBe('todo');
    expect(t.priority).toBe(2);
    expect(t.due_at).toBeNull();
    expect(t.due_has_time).toBe(false);
    expect(t.completed_at).toBeNull();
    expect(t.created_at).toBe(clock.now().toISOString());
  });

  it('nukerpa tarpus ir atmeta tuščią pavadinimą', () => {
    expect(store.create({ title: '  Pieną  ' }).title).toBe('Pieną');
    expect(() => store.create({ title: '   ' })).toThrow('Tuščias pavadinimas');
  });

  it('priima terminą ir priminimą', () => {
    const t = store.create({
      title: 'Skambutis', due_at: '2026-08-15T18:00', due_has_time: true, remind_at: '2026-08-15T18:00', priority: 1,
    });
    expect(t.due_has_time).toBe(true);
    expect(t.remind_at).toBe('2026-08-15T18:00');
    expect(t.priority).toBe(1);
  });
});

describe('update', () => {
  it('pažymėjus atlikta užpildo completed_at ir nutildo žadintuvą', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T18:00' });
    clock.advance(60_000);
    const done = store.update(t.id, { status: 'done' })!;
    expect(done.completed_at).toBe(clock.now().toISOString());
    expect(done.reminded_at).toBe(clock.now().toISOString());
  });

  it('grąžinus iš atlikta nuvalo completed_at', () => {
    const t = store.create({ title: 'X' });
    store.update(t.id, { status: 'done' });
    expect(store.update(t.id, { status: 'todo' })!.completed_at).toBeNull();
  });

  it('pakeitus remind_at nuvalo reminded_at', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T18:00' });
    store.update(t.id, { status: 'done' });
    store.update(t.id, { status: 'todo' });
    const moved = store.update(t.id, { remind_at: '2026-08-15T18:00' })!;
    expect(moved.reminded_at).toBeNull();
  });

  it('pakeitus due_at nuvalo reminded_at', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T18:00' });
    store.update(t.id, { status: 'done' });
    store.update(t.id, { status: 'todo' });
    const moved = store.update(t.id, { due_at: '2026-08-16' })!;
    expect(moved.reminded_at).toBeNull();
  });

  it('atnaujina updated_at ir grąžina null nežinomam id', () => {
    const t = store.create({ title: 'X' });
    clock.advance(60_000);
    expect(store.update(t.id, { title: 'Y' })!.updated_at).toBe(clock.now().toISOString());
    expect(store.update('nėra-tokio', { title: 'Y' })).toBeNull();
  });

  it('viename patch\'e naujas laikas nusveria užbaigimo nutildymą', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T18:00' });

    const both = store.update(t.id, { status: 'done', remind_at: '2026-08-15T18:00' })!;

    expect(both.status).toBe('done');
    expect(both.completed_at).toBe(clock.now().toISOString());
    expect(both.reminded_at).toBeNull();
  });
});

describe('snooze', () => {
  it('perkelia priminimą į priekį ir leidžia jam vėl suveikti', () => {
    const t = store.create({ title: 'X', remind_at: '2026-08-14T10:00' });
    store.update(t.id, { status: 'done' });
    store.update(t.id, { status: 'todo' });
    const snoozed = store.snooze(t.id, 10)!;
    expect(snoozed.remind_at).toBe('2026-08-14T10:10');
    expect(snoozed.reminded_at).toBeNull();
  });
});

describe('pasikartojančios užduotys', () => {
  it('pažymėta atlikta lieka todo, o terminas peršoka', () => {
    // fixedClock nustatytas ties 2026-08-14 (penktadienis).
    const t = store.create({ title: 'Išnešti šiukšles', due_at: '2026-08-11', repeat: 'w:2' });

    const po = store.update(t.id, { status: 'done' })!;

    expect(po.status).toBe('todo');
    expect(po.completed_at).toBeNull();
    expect(po.due_at).toBe('2026-08-18');
  });

  it('laikas ir žadintuvas išsaugomi, reminded_at nuvalomas', () => {
    const t = store.create({
      title: 'Vaistai', due_at: '2026-08-11T18:00', due_has_time: true,
      remind_at: '2026-08-11T18:00', repeat: 'w:2',
    });
    store.markReminded(t.id);

    const po = store.update(t.id, { status: 'done' })!;

    expect(po.due_at).toBe('2026-08-18T18:00');
    expect(po.remind_at).toBe('2026-08-18T18:00');
    expect(po.reminded_at).toBeNull();
  });

  it('tris savaites pradelsta po pažymėjimo atsiduria ATEITYJE', () => {
    // Skaičiuojama nuo šiandien, ne nuo seno termino — kitaip liktų raudona.
    // Laikrodis fiksuotas ties 2026-08-14 (penktadienis) — tikrinama konkreti
    // data, ne vien tai, kad ji didesnė už šiandienos datą (12 radinys).
    const t = store.create({ title: 'X', due_at: '2026-07-21', repeat: 'w:2' });

    const po = store.update(t.id, { status: 'done' })!;

    expect(po.due_at).toBe('2026-08-18');
  });

  it('nepasikartojanti elgiasi kaip anksčiau', () => {
    const t = store.create({ title: 'Vienkartinė' });

    const po = store.update(t.id, { status: 'done' })!;

    expect(po.status).toBe('done');
    expect(po.completed_at).not.toBeNull();
  });

  it('kartu su status "done" patch\'inti kiti laukai (title, priority) irgi išsisaugo', () => {
    // Peršokimo šaka anksčiau rašė savo atskirą lauko rinkinį ir apeidavo
    // PATCHABLE kopijavimo ciklą — bet koks kitas tame pačiame patch'e
    // siunčiamas laukas (title, priority, ...) tyliai dingdavo be klaidos.
    const t = store.create({ title: 'Senas', priority: 2, due_at: '2026-08-11', repeat: 'w:2' });

    const po = store.update(t.id, { status: 'done', title: 'Naujas', priority: 1 })!;

    expect(po.status).toBe('todo');
    expect(po.due_at).toBe('2026-08-18');
    expect(po.title).toBe('Naujas');
    expect(po.priority).toBe(1);
  });
});

describe('repeat lauko patch (PATCHABLE spraga)', () => {
  it('patch repeat išsaugomas ir iškart perskaičiuoja terminą į artimiausią kitą kartą', () => {
    const t = store.create({ title: 'X', due_at: '2026-08-11' });

    const po = store.update(t.id, { repeat: 'w:2' })!;

    expect(po.repeat).toBe('w:2');
    // 2026-08-14 yra penktadienis; artimiausias antradienis — 2026-08-18.
    expect(po.due_at).toBe('2026-08-18');
  });

  it('nustačius repeat užduočiai su laiku, bet be egzistuojančio priminimo, priminimas neatsiranda', () => {
    // Vien tik šablono pasirinkimas neturi savaime įjungti žadintuvo, kurio
    // vartotojas niekada nesukonfigūravo.
    const t = store.create({ title: 'X', due_at: '2026-08-11T18:00', due_has_time: true });

    const po = store.update(t.id, { repeat: 'w:2' })!;

    expect(po.due_at).toBe('2026-08-18T18:00');
    expect(po.remind_at).toBeNull();
  });

  it('nustačius repeat užduočiai su egzistuojančiu priminimu, jis persikelia kartu su terminu', () => {
    const t = store.create({
      title: 'X', due_at: '2026-08-11T18:00', due_has_time: true, remind_at: '2026-08-11T18:00',
    });
    store.markReminded(t.id);

    const po = store.update(t.id, { repeat: 'w:2' })!;

    expect(po.due_at).toBe('2026-08-18T18:00');
    expect(po.remind_at).toBe('2026-08-18T18:00');
    expect(po.reminded_at).toBeNull();
  });

  it('nustačius repeat užduočiai be termino, jis priskiriamas', () => {
    // Pasikartojanti užduotis visada turi due_at — tai numatyta elgsena,
    // ne netyčinis šalutinis efektas.
    const t = store.create({ title: 'X' });
    expect(t.due_at).toBeNull();

    const po = store.update(t.id, { repeat: 'w:2' })!;

    expect(po.due_at).toBe('2026-08-18');
  });

  it('repeat išvalymas į null palieka terminą nepakeistą ir grąžina į paprastą užduotį', () => {
    const t = store.create({ title: 'X', due_at: '2026-08-11', repeat: 'w:2' });

    const po = store.update(t.id, { repeat: null })!;

    expect(po.repeat).toBeNull();
    expect(po.due_at).toBe('2026-08-11');
  });

  it('status "done" su nauju repeat tame pačiame patch\'e peršoka pagal NAUJĄ šabloną', () => {
    // Sąmoningas pasirinkimas: jei viename patch'e keičiamas ir repeat, ir
    // status pažymimas atlikta, peršokimas skaičiuojamas pagal patch'e
    // nurodytą naują šabloną, o ne pagal seną — nes tai atspindi vartotojo
    // ką tik pateiktą ketinimą, o ne pasenusią būseną prieš patch'ą.
    const t = store.create({ title: 'X', due_at: '2026-08-11', repeat: 'w:2' });

    const po = store.update(t.id, { status: 'done', repeat: 'w:4' })!;

    expect(po.status).toBe('todo');
    expect(po.repeat).toBe('w:4');
    // 2026-08-14 yra penktadienis; artimiausias ketvirtadienis — 2026-08-20.
    expect(po.due_at).toBe('2026-08-20');
  });

  it('status "done" su repeat: null tame pačiame patch\'e užbaigia kaip vienkartinę', () => {
    // Sąmoningas pasirinkimas: aiškiai išvalytas repeat reiškia, kad
    // vartotojas nebenori, jog tai būtų pasikartojanti — todėl pažymėjimas
    // atlikta elgiasi kaip įprasta (užsidaro), o ne peršoka.
    const t = store.create({ title: 'X', due_at: '2026-08-11', repeat: 'w:2' });

    const po = store.update(t.id, { status: 'done', repeat: null })!;

    expect(po.status).toBe('done');
    expect(po.repeat).toBeNull();
    expect(po.completed_at).not.toBeNull();
    expect(po.due_at).toBe('2026-08-11');
  });

  it('KRITINIS (1 radinys): Board.tsx tipo kreipinys — repeat NEPAKITĘS, keičiasi tik prioritetas, due_at nepajuda', () => {
    // Tiksliai tokia payload forma, kokią Board.tsx (onReschedule) siunčia:
    // visos DueValue reikšmės vienu metu, `repeat` identiškas dabartiniam,
    // vienintelis realus pokytis — prioritetas. Ankstesnė sąlyga tikrino, ar
    // `patch` TURI `repeat`, o ne ar jis PASIKEITĖ, tad šis kreipinys klaidingai
    // suveikdavo peršokimo šaką ir nutildavo ką tik nurodytą due_at.
    const t = store.create({
      title: 'Išnešti šiukšles', due_at: '2026-08-11', due_has_time: false,
      remind_at: null, priority: 2, repeat: 'w:2',
    });

    const po = store.update(t.id, {
      due_at: t.due_at,
      due_has_time: t.due_has_time,
      remind_at: t.remind_at,
      priority: 1,
      repeat: t.repeat,
    })!;

    expect(po.due_at).toBe('2026-08-11');
    expect(po.priority).toBe(1);
    expect(po.status).toBe('todo');
  });

  it('aiškiai nurodytas due_at laimi prieš peršokimą, kai repeat nepakitęs (1 radinys)', () => {
    // 11 skyrius: rankinis termino pakeitimas yra sankcionuotas būdas praleisti
    // vieną kartą. Redaktoriaus datos čipas/laukas atsiunčia naują due_at kartu
    // su nepakitusiu repeat — ta nauja data privalo išlikti, o ne būti nutildyta
    // nextOccurrence() rezultatu.
    const t = store.create({ title: 'Vaistai', due_at: '2026-08-11', repeat: 'w:2' });

    const po = store.update(t.id, {
      due_at: '2026-08-15', due_has_time: false, remind_at: null,
      priority: t.priority, repeat: t.repeat,
    })!;

    expect(po.due_at).toBe('2026-08-15');
  });
});

describe('peršokimo šaka: due_has_time nuoseklumas su due_at (2 radinys)', () => {
  it('status:done + due_has_time:false tame pačiame patch\'e — peršokęs terminas neturi laiko dalies', () => {
    // Prieš taisymą `time` buvo skaičiuojamas vien iš `before`, tad `patch`
    // atsiųstas due_has_time:false buvo ignoruojamas peršokimo skaičiavime,
    // nors PATCHABLE ciklas jį jau būtų įrašęs — due_at ir due_has_time likdavo
    // nesuderinti.
    const t = store.create({
      title: 'X', due_at: '2026-08-11T18:00', due_has_time: true,
      remind_at: '2026-08-11T18:00', repeat: 'w:2',
    });

    const po = store.update(t.id, { status: 'done', due_has_time: false })!;

    expect(po.due_has_time).toBe(false);
    expect(po.due_at).toBe('2026-08-18');
    expect(po.remind_at).toBeNull();
  });

  it('status:done + naujas due_at su laiku tame pačiame patch\'e — due_has_time atitinka rezultatą', () => {
    // Veidrodinis atvejis: patch atsiunčia SAVO due_at su laiku, bet peršokimo
    // šaka skaičiavo `time` iš `before` (be laiko) — due_at tapdavo be laiko,
    // o due_has_time likdavo iš PATCHABLE ciklo klaidingai `true`.
    const t = store.create({ title: 'X', due_at: '2026-08-11', due_has_time: false, repeat: 'w:2' });

    const po = store.update(t.id, {
      status: 'done', due_at: '2026-09-01T09:00', due_has_time: true,
    })!;

    expect(po.due_has_time).toBe(true);
    expect(po.due_at).toBe('2026-08-18T09:00');
    expect(po.remind_at).toBe('2026-08-18T09:00');
  });
});

describe('create() su repeat, bet be due_at (4 radinys)', () => {
  it('POST tipo kreipinys { title, repeat } grąžina apskaičiuotą due_at, ne null', () => {
    // 3 skyrius: pasikartojanti užduotis visada turi due_at. Prieš taisymą
    // create() apskritai neskaičiavo termino, tad toks kreipinys grąžindavo
    // due_at: null pasikartojančiai užduočiai.
    const t = store.create({ title: 'X', repeat: 'w:2' });

    expect(t.due_at).toBe('2026-08-18');
    expect(t.due_has_time).toBe(false);
    expect(t.repeat).toBe('w:2');
  });

  it('su repeat IR aiškiai nurodytu due_at — kliento reikšmė nekeičiama', () => {
    const t = store.create({ title: 'X', repeat: 'w:2', due_at: '2026-09-01' });

    expect(t.due_at).toBe('2026-09-01');
  });

  it('QuickAdd tipo kreipinys — repeat su AIŠKIAI null due_at (ne tik nepridėtu) irgi apskaičiuoja', () => {
    // QuickAdd.tsx neturi „prieš" būsenos kaip TaskCard — jo vietinė būsena
    // visada siunčia due_at kaip lauką (numatytoji reikšmė null, kol
    // vartotojas datos nepaliečia), o ne jį praleidžia. Jei create() tikrintų
    // tik `undefined`, ši — REALI, iš sąsajos atkeliaujanti — kreipinio forma
    // liktų nepataisyta net po 4 radinio fix'o.
    const t = store.create({
      title: 'X', due_at: null, due_has_time: false, remind_at: null, priority: 2, repeat: 'w:2',
    });

    expect(t.due_at).toBe('2026-08-18');
  });

  it('be repeat elgiasi kaip anksčiau — due_at lieka null', () => {
    const t = store.create({ title: 'X' });

    expect(t.due_at).toBeNull();
  });
});

describe('list ir remove', () => {
  it('grąžina visas ir ištrina pagal id', () => {
    store.create({ title: 'A' });
    const b = store.create({ title: 'B' });
    expect(store.list()).toHaveLength(2);
    expect(store.remove(b.id)).toBe(true);
    expect(store.remove(b.id)).toBe(false);
    expect(store.list().map((t) => t.title)).toEqual(['A']);
  });
});
