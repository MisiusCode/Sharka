import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task } from '../../src/core/types.js';
import type { TaskStore } from '../../src/core/tasks.js';
import {
  BOM,
  backupNames,
  createBackupScheduler,
  expiredBackupDates,
  pruneBackups,
  tasksToCsv,
  writeBackup,
} from '../../src/core/backup.js';
import { openDb } from '../../src/core/db.js';
import { fixedClock } from '../../src/core/clock.js';
import { createTaskStore } from '../../src/core/tasks.js';
import { createSettingsStore } from '../../src/core/settings.js';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'x', title: 'Nupirkti pieną', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-14T10:00:00.000Z', updated_at: '2026-08-14T10:00:00.000Z',
    completed_at: null, repeat: null, ...over,
  };
}

describe('tasksToCsv', () => {
  it('prasideda BOM ir lietuviška antrašte', () => {
    const csv = tasksToCsv('lt', []);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain('Pavadinimas;Būsena;Prioritetas;Terminas;Priminimas;Sukurta;Atlikta;Kartojimas');
  });

  it('rašo kartojimo stulpelį su lietuvišku pavadinimu, tuščią kai repeat null (11 radinys)', () => {
    const csv = tasksToCsv('lt', [
      task({ id: 'a', title: 'Kartojasi', repeat: 'w:2' }),
      task({ id: 'b', title: 'Vienkartinė', repeat: null }),
    ]);
    expect(csv).toContain('Kartojasi;Reikia padaryti;Vidutinis;;;2026-08-14T10:00:00.000Z;;kas antradienį');
    expect(csv).toContain('Vienkartinė;Reikia padaryti;Vidutinis;;;2026-08-14T10:00:00.000Z;;\r\n');
  });

  it('naudoja kabliataškį ir CRLF', () => {
    const csv = tasksToCsv('lt', [task()]);
    expect(csv).toContain('\r\n');
    expect(csv).not.toContain('Pavadinimas,Būsena');
  });

  it('būsenas ir prioritetus verčia į lietuviškus', () => {
    const csv = tasksToCsv('lt', [
      task({ id: 'a', title: 'A', status: 'todo', priority: 1 }),
      task({ id: 'b', title: 'B', status: 'doing', priority: 2 }),
      task({ id: 'c', title: 'C', status: 'done', priority: 3 }),
    ]);
    expect(csv).toContain('A;Reikia padaryti;Aukštas;');
    expect(csv).toContain('B;Vykdoma;Vidutinis;');
    expect(csv).toContain('C;Atlikta;Žemas;');
  });

  it('tuščias reikšmes palieka tuščias, ne „null"', () => {
    const csv = tasksToCsv('lt', [task()]);
    expect(csv).not.toContain('null');
    expect(csv).toContain('Nupirkti pieną;Reikia padaryti;Vidutinis;;;');
  });

  it('ekranuoja kabliataškį, kabutes ir eilutės lūžį pavadinime', () => {
    const csv = tasksToCsv('lt', [
      task({ id: 'a', title: 'Pirkti: pieno; duonos' }),
      task({ id: 'b', title: 'Perskaityti "Anykščių šilelį"' }),
      task({ id: 'c', title: 'Pirma\nantra' }),
    ]);
    expect(csv).toContain('"Pirkti: pieno; duonos"');
    expect(csv).toContain('"Perskaityti ""Anykščių šilelį"""');
    expect(csv).toContain('"Pirma\nantra"');
  });

  it('perduoda terminą, priminimą ir atlikimo laiką', () => {
    const csv = tasksToCsv('lt', [
      task({ due_at: '2026-08-20T18:00', due_has_time: true, remind_at: '2026-08-20T18:00',
             status: 'done', completed_at: '2026-08-21T09:12:00.000Z' }),
    ]);
    expect(csv).toContain('2026-08-20T18:00;2026-08-20T18:00;2026-08-14T10:00:00.000Z;2026-08-21T09:12:00.000Z');
  });

  it('CSV antraštė ir reikšmės rašomos pasirinkta kalba', () => {
    const csv = tasksToCsv('en', [task({ title: 'Milk', status: 'doing', priority: 1 })]);
    const [antraste, eilute] = csv.replace(BOM, '').trim().split('\r\n');
    expect(antraste).toBe('Title;Status;Priority;Due;Reminder;Created;Completed;Repeat');
    expect(eilute).toContain('In progress');
    expect(eilute).toContain('High');
  });

  it('lietuviška antraštė nepasikeitė', () => {
    const csv = tasksToCsv('lt', []);
    expect(csv).toContain('Pavadinimas;Būsena;Prioritetas;Terminas;Priminimas;Sukurta;Atlikta;Kartojimas');
  });

  // BOM ir kabliataškis egzistuoja dėl Excel, ne dėl kalbos.
  it('BOM ir skirtukas nepriklauso nuo kalbos', () => {
    expect(tasksToCsv('en', []).startsWith(BOM)).toBe(true);
    expect(tasksToCsv('en', []).includes(';')).toBe(true);
  });
});

describe('backupNames', () => {
  it('sudaro abiejų failų vardus iš datos', () => {
    expect(backupNames('2026-08-17')).toEqual({
      db: 'tasks-2026-08-17.db',
      csv: 'tasks-2026-08-17.csv',
    });
  });
});

describe('expiredBackupDates', () => {
  it('palieka naujausias N datų, grąžina likusias', () => {
    const files = [
      'tasks-2026-08-11.db', 'tasks-2026-08-11.csv',
      'tasks-2026-08-12.db', 'tasks-2026-08-12.csv',
      'tasks-2026-08-13.db', 'tasks-2026-08-13.csv',
    ];
    expect(expiredBackupDates(files, 2)).toEqual(['2026-08-11']);
  });

  it('nieko negrąžina, kai datų mažiau nei riba', () => {
    expect(expiredBackupDates(['tasks-2026-08-11.db'], 7)).toEqual([]);
  });

  it('IGNORUOJA svetimus failus aplanke', () => {
    const files = [
      'tasks-2026-08-11.db', 'tasks-2026-08-12.db', 'tasks-2026-08-13.db',
      'nuotrauka.jpg', 'tasks.db', 'tasks-2026-08-13.db.bak',
      'tasks-2026-8-1.db', 'senas-tasks-2026-08-10.db',
    ];
    expect(expiredBackupDates(files, 2)).toEqual(['2026-08-11']);
  });

  it('viena data suskaičiuojama vieną kartą, nors failai du', () => {
    const files = [
      'tasks-2026-08-11.db', 'tasks-2026-08-11.csv',
      'tasks-2026-08-12.db', 'tasks-2026-08-12.csv',
    ];
    expect(expiredBackupDates(files, 2)).toEqual([]);
  });

  it('keep = 0 nieko neištrina (B radinys)', () => {
    const files = [
      'tasks-2026-08-11.db', 'tasks-2026-08-11.csv',
      'tasks-2026-08-12.db', 'tasks-2026-08-12.csv',
    ];
    expect(expiredBackupDates(files, 0)).toEqual([]);
  });

  it('neigiamas keep taip pat nieko neištrina (B radinys)', () => {
    expect(expiredBackupDates(['tasks-2026-08-11.db', 'tasks-2026-08-12.db'], -3)).toEqual([]);
  });
});

describe('writeBackup', () => {
  it('sukuria abu failus, o .db atsidaro kaip veikianti bazė', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-kopija-'));
    const dbPath = join(dir, 'tasks.db');
    const db = openDb(dbPath);
    const store = createTaskStore(db, fixedClock('2026-08-17T10:00:00'));
    store.create({ title: 'Nupirkti pieną' });

    const target = join(dir, 'kopijos');
    writeBackup(db, store.list(), target, '2026-08-17', 'lt');
    db.close();

    expect(existsSync(join(target, 'tasks-2026-08-17.db'))).toBe(true);
    expect(readFileSync(join(target, 'tasks-2026-08-17.csv'), 'utf8')).toContain('Nupirkti pieną');

    const copy = openDb(join(target, 'tasks-2026-08-17.db'));
    expect(createTaskStore(copy, fixedClock('2026-08-17T10:00:00')).list()).toHaveLength(1);
    copy.close();

    rmSync(dir, { recursive: true, force: true });
  });

  it('pakartotinai tą pačią dieną perrašo, o ne krenta', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-kopija-'));
    const db = openDb(join(dir, 'tasks.db'));
    const target = join(dir, 'kopijos');

    writeBackup(db, [], target, '2026-08-17', 'lt');
    expect(() => writeBackup(db, [], target, '2026-08-17', 'lt')).not.toThrow();

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('pruneBackups', () => {
  it('trina senas poras ir NELIEČIA svetimų failų', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-kopija-'));
    for (const name of [
      'tasks-2026-08-11.db', 'tasks-2026-08-11.csv',
      'tasks-2026-08-12.db', 'tasks-2026-08-12.csv',
      'tasks-2026-08-13.db', 'tasks-2026-08-13.csv',
      'svarbi-nuotrauka.jpg', 'tasks.db',
    ]) {
      writeFileSync(join(dir, name), 'x');
    }

    pruneBackups(dir, 2);

    const liko = readdirSync(dir).sort();
    expect(liko).toContain('svarbi-nuotrauka.jpg');
    expect(liko).toContain('tasks.db');
    expect(liko).not.toContain('tasks-2026-08-11.db');
    expect(liko).not.toContain('tasks-2026-08-11.csv');
    expect(liko).toContain('tasks-2026-08-13.db');

    rmSync(dir, { recursive: true, force: true });
  });

  it('neegzistuojančiame aplanke nekrenta', () => {
    expect(() => pruneBackups(join(tmpdir(), 'sarka-nera-tokio-aplanko'), 7)).not.toThrow();
  });
});

describe('createBackupScheduler', () => {
  function setup(dirName: string, keep = 7) {
    const dir = mkdtempSync(join(tmpdir(), dirName));
    const db = openDb(join(dir, 'tasks.db'));
    const clock = fixedClock('2026-08-17T09:00:00');
    const tasks = createTaskStore(db, clock);
    const settings = createSettingsStore(db);
    settings.patch({ backup_dir: join(dir, 'kopijos') });
    const scheduler = createBackupScheduler({ db, tasks, settings, clock, keep, systemLocale: 'lt' });
    return { dir, db, clock, tasks, settings, scheduler, tick: scheduler.tick };
  }

  it('padaro kopiją ir užfiksuoja datą', () => {
    const s = setup('sarka-plan-');
    s.tasks.create({ title: 'A' });

    s.tick();

    expect(existsSync(join(s.dir, 'kopijos', 'tasks-2026-08-17.db'))).toBe(true);
    expect(s.settings.getAll().last_backup).toBe('2026-08-17');
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('tą pačią parą antrą kartą nekartoja', () => {
    const s = setup('sarka-plan-');
    s.tick();
    const pirma = readFileSync(join(s.dir, 'kopijos', 'tasks-2026-08-17.csv'), 'utf8');

    s.tasks.create({ title: 'Vėliau pridėta' });
    s.clock.set('2026-08-17T23:00:00');
    s.tick();

    expect(readFileSync(join(s.dir, 'kopijos', 'tasks-2026-08-17.csv'), 'utf8')).toBe(pirma);
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('praleistą parą pagauna kitą dieną', () => {
    const s = setup('sarka-plan-');
    s.tick();
    s.clock.set('2026-08-19T08:00:00');
    s.tick();

    expect(existsSync(join(s.dir, 'kopijos', 'tasks-2026-08-19.db'))).toBe(true);
    expect(s.settings.getAll().last_backup).toBe('2026-08-19');
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('nepavykus įrašo klaidą, NEatnaujina last_backup ir nemeta išimties', () => {
    const s = setup('sarka-plan-');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Failas vietoje aplanko — mkdirSync nepavyks.
    const kelias = join(s.dir, 'ne-aplankas');
    writeFileSync(kelias, 'x');
    s.settings.patch({ backup_dir: kelias });

    expect(() => s.tick()).not.toThrow();

    expect(s.settings.getAll().last_backup).toBeNull();
    expect(s.settings.getAll().last_backup_error).not.toBeNull();
    errorSpy.mockRestore();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('tuščias aplanko kelias praleidžiamas be klaidos', () => {
    const s = setup('sarka-plan-');
    s.settings.patch({ backup_dir: '' });

    s.tick();

    expect(s.settings.getAll().last_backup).toBeNull();
    expect(s.settings.getAll().last_backup_error).toBeNull();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('rotacijos nesėkmė neturi blokuoti last_backup (2 radinys)', () => {
    // keep: 1, tad viena sena „kopija" iškart taps rotacijos taikiniu.
    const s = setup('sarka-rotacija-', 1);
    const backupDir = join(s.dir, 'kopijos');
    mkdirSync(backupDir, { recursive: true });
    // Katalogas vietoj failo simuliuoja rmSync nesėkmę (EPERM/EBUSY realiame
    // gyvenime — užrakintas failas, OneDrive ar antivirusas laiko rankeną):
    // fs.rmSync be `recursive: true` numesto katalogo nepašalina.
    mkdirSync(join(backupDir, 'tasks-2020-01-01.db'));
    writeFileSync(join(backupDir, 'tasks-2020-01-01.csv'), 'x');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => s.tick()).not.toThrow();

    // Kopija pavyko — data turi būti įrašyta, nepaisant to, kad rotacija
    // (senos kopijos trynimas) nepavyko.
    expect(s.settings.getAll().last_backup).toBe('2026-08-17');
    expect(existsSync(join(backupDir, 'tasks-2026-08-17.db'))).toBe(true);

    errorSpy.mockRestore();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('ne-Error išimtis neišmuša tick per praneštą klaidos žinutę (3a radinys)', () => {
    const s = setup('sarka-nederror-');
    const blogiTasks: TaskStore = {
      ...s.tasks,
      list: () => {
        throw 'stygos klaida, ne Error objektas';
      },
    };
    const scheduler = createBackupScheduler({
      db: s.db, tasks: blogiTasks, settings: s.settings, clock: s.clock, keep: 7, systemLocale: 'lt',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => scheduler.tick()).not.toThrow();
    expect(s.settings.getAll().last_backup_error).toBe('stygos klaida, ne Error objektas');

    errorSpy.mockRestore();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('sėkmės kelio settings.patch klaida neišmuša tick iš vėžių (3b radinys)', () => {
    const s = setup('sarka-patchklaida-');
    s.tasks.create({ title: 'A' });
    const blogiSettings: ReturnType<typeof createSettingsStore> = {
      getAll: s.settings.getAll,
      patch: () => {
        throw new Error('SQLITE_BUSY: database is locked');
      },
    };
    const scheduler = createBackupScheduler({
      db: s.db, tasks: s.tasks, settings: blogiSettings, clock: s.clock, keep: 7, systemLocale: 'lt',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Prieš taisymą: sėkmės šakos `settings.patch` meta, `catch` blokas vėl
    // kviečia `settings.patch` (klaidai užfiksuoti) ir vėl meta — išimtis
    // ištrūksta iš `tick`, kuris yra `setInterval` atgalinis kvietimas.
    expect(() => scheduler.tick()).not.toThrow();

    errorSpy.mockRestore();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('ta pati klaida antrą kartą pakartotinai nežurnalinama (D radinys)', () => {
    const s = setup('sarka-dedup-');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const kelias = join(s.dir, 'ne-aplankas');
    writeFileSync(kelias, 'x');
    s.settings.patch({ backup_dir: kelias });

    s.tick();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const pirmaKlaida = s.settings.getAll().last_backup_error;

    s.tick(); // ta pati diena, ta pati klaida
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(s.settings.getAll().last_backup_error).toBe(pirmaKlaida);

    errorSpy.mockRestore();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('sėkmė po nesėkmės išvalo last_backup_error (D radinys)', () => {
    const s = setup('sarka-atsigavimas-');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const kelias = join(s.dir, 'ne-aplankas');
    writeFileSync(kelias, 'x');
    s.settings.patch({ backup_dir: kelias });

    s.tick();
    expect(s.settings.getAll().last_backup_error).not.toBeNull();

    rmSync(kelias, { force: true });
    s.settings.patch({ backup_dir: join(s.dir, 'kopijos') });
    s.tick();

    expect(s.settings.getAll().last_backup_error).toBeNull();
    expect(s.settings.getAll().last_backup).toBe('2026-08-17');

    errorSpy.mockRestore();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('start() planuoja periodinius tiksėjimus, o grąžinta funkcija juos sustabdo (F radinys)', () => {
    const s = setup('sarka-start-');
    const getAllSpy = vi.spyOn(s.settings, 'getAll');

    vi.useFakeTimers();
    try {
      const stop = s.scheduler.start(10);
      vi.advanceTimersByTime(25); // du pilni tiksėjimai (10 ir 20 ms)
      const kviestaPrieszStabdant = getAllSpy.mock.calls.length;
      expect(kviestaPrieszStabdant).toBeGreaterThanOrEqual(2);

      stop();
      vi.advanceTimersByTime(1000); // po stabdymo daugiau tiksėjimų nebūna
      expect(getAllSpy.mock.calls.length).toBe(kviestaPrieszStabdant);
    } finally {
      vi.useRealTimers();
    }

    getAllSpy.mockRestore();
    s.db.close();
    rmSync(s.dir, { recursive: true, force: true });
  });
});
