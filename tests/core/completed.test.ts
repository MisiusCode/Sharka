import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/core/types.js';
import { COMPLETED_LABELS, completedBetween, completedBucketOf, completedLabel, defaultRange, doneLastWeek, isValidRange, sortByCompleted } from '../../src/core/completed.js';

const TODAY = '2026-08-17';

function done(id: string, completedAt: string | null, status: Task['status'] = 'done'): Task {
  return {
    id, title: id, status, priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    repeat: null, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
    completed_at: completedAt,
  };
}

describe('completedBucketOf', () => {
  it('skirsto pagal atlikimo datą', () => {
    expect(completedBucketOf(done('a', '2026-08-17T09:00:00.000Z'), TODAY)).toBe('today');
    expect(completedBucketOf(done('b', '2026-08-16T09:00:00.000Z'), TODAY)).toBe('yesterday');
    expect(completedBucketOf(done('c', '2026-08-14T09:00:00.000Z'), TODAY)).toBe('week');
    expect(completedBucketOf(done('d', '2026-07-01T09:00:00.000Z'), TODAY)).toBe('earlier');
  });

  it('riba: prieš 7 dienas dar „šią savaitę", prieš 8 jau „anksčiau"', () => {
    expect(completedBucketOf(done('a', '2026-08-10T09:00:00.000Z'), TODAY)).toBe('week');
    expect(completedBucketOf(done('b', '2026-08-09T09:00:00.000Z'), TODAY)).toBe('earlier');
  });

  it('neatlikta užduotis nepatenka niekur', () => {
    expect(completedBucketOf(done('a', null, 'todo'), TODAY)).toBeNull();
    // Apsauga nuo nenuoseklių duomenų: būsena todo, bet completed_at užpildytas.
    expect(completedBucketOf(done('b', '2026-08-17T09:00:00.000Z', 'todo'), TODAY)).toBeNull();
  });
});

describe('sortByCompleted', () => {
  it('naujausias atlikimas viršuje', () => {
    const surikiuota = sortByCompleted([
      done('senas', '2026-08-10T09:00:00.000Z'),
      done('naujas', '2026-08-17T09:00:00.000Z'),
      done('vidurinis', '2026-08-14T09:00:00.000Z'),
    ]);
    expect(surikiuota.map((t) => t.id)).toEqual(['naujas', 'vidurinis', 'senas']);
  });

  it('nekeičia paduoto masyvo', () => {
    const originalus = [done('a', '2026-08-10T09:00:00.000Z'), done('b', '2026-08-17T09:00:00.000Z')];
    sortByCompleted(originalus);
    expect(originalus.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('doneLastWeek', () => {
  it('skaičiuoja tik paskutines septynias dienas', () => {
    const tasks = [
      done('a', '2026-08-17T09:00:00.000Z'),
      done('b', '2026-08-11T09:00:00.000Z'),
      done('c', '2026-08-09T09:00:00.000Z'),
      done('d', null, 'todo'),
    ];
    expect(doneLastWeek(tasks, TODAY)).toBe(2);
  });

  it('nulis grąžinamas kaip nulis', () => {
    expect(doneLastWeek([], TODAY)).toBe(0);
  });
});

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

describe('completedLabel', () => {
  it('„Padaryta" kolonų pavadinimai yra abiem kalbomis', () => {
    expect(completedLabel('lt', 'yesterday')).toBe('Vakar');
    expect(completedLabel('en', 'yesterday')).toBe('Yesterday');
    expect(completedLabel('en', 'week')).toBe('Last 7 days');
  });

  // Konkrečios reikšmės, ne lygybė su funkcija, iš kurios COMPLETED_LABELS
  // apskaičiuojamas — tokia lygybė niekada nesugestų, ir „Anksčiau" liktų be
  // jokios teigiamos patikros visame rinkinyje (žr. peržiūros radinį).
  it('COMPLETED_LABELS — senasis lietuviškas eksportas', () => {
    expect(COMPLETED_LABELS).toEqual({
      today: 'Šiandien', yesterday: 'Vakar', week: 'Šią savaitę', earlier: 'Anksčiau',
    });
  });
});
