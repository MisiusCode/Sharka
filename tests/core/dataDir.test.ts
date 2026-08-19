import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DIR_NAME, LEGACY_DIR_NAME, resolveDataDir } from '../../src/core/dataDir.js';

const laikini: string[] = [];

function baze(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sarka-perkelimas-'));
  laikini.push(dir);
  return dir;
}

function sukurkSena(base: string, turinys = 'duomenys'): string {
  const dir = join(base, LEGACY_DIR_NAME);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'tasks.db'), turinys);
  return dir;
}

afterEach(() => {
  for (const d of laikini.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('resolveDataDir', () => {
  it('perkelia seną katalogą į naują ir grąžina naują', () => {
    const base = baze();
    sukurkSena(base, 'mano tikri duomenys');

    const rezultatas = resolveDataDir(base);

    expect(rezultatas).toBe(join(base, DIR_NAME));
    expect(readFileSync(join(rezultatas, 'tasks.db'), 'utf8')).toBe('mano tikri duomenys');
    expect(existsSync(join(base, LEGACY_DIR_NAME))).toBe(false);
  });

  // Perkeliamas visas katalogas, ne vien `tasks.db`: SQLite WAL režimu laiko
  // šalia `-wal` ir `-shm`, o kopijos gyvena tame pačiame aplanke.
  it('kartu perkelia WAL palydovus ir atsargines kopijas', () => {
    const base = baze();
    const senas = sukurkSena(base);
    writeFileSync(join(senas, 'tasks.db-wal'), 'wal');
    writeFileSync(join(senas, 'tasks.db-shm'), 'shm');
    mkdirSync(join(senas, 'kopijos'));
    writeFileSync(join(senas, 'kopijos', 'tasks-2026-08-18.db'), 'kopija');

    const rezultatas = resolveDataDir(base);

    expect(existsSync(join(rezultatas, 'tasks.db-wal'))).toBe(true);
    expect(existsSync(join(rezultatas, 'tasks.db-shm'))).toBe(true);
    expect(readFileSync(join(rezultatas, 'kopijos', 'tasks-2026-08-18.db'), 'utf8')).toBe('kopija');
  });

  it('švariame diegime grąžina naują kelią nieko neperkeldamas', () => {
    const base = baze();

    expect(resolveDataDir(base)).toBe(join(base, DIR_NAME));
  });

  // Svarbiausias saugiklis: antras paleidimas neturi liesti jau perkeltų duomenų.
  it('naujajame jau esant duomenų bazei — nieko nebeliečia', () => {
    const base = baze();
    const naujas = join(base, DIR_NAME);
    mkdirSync(naujas, { recursive: true });
    writeFileSync(join(naujas, 'tasks.db'), 'naujieji');
    sukurkSena(base, 'senieji');

    const rezultatas = resolveDataDir(base);

    expect(rezultatas).toBe(naujas);
    expect(readFileSync(join(naujas, 'tasks.db'), 'utf8')).toBe('naujieji');
    // Senas lieka vietoje — jo trynimas nėra šios funkcijos darbas.
    expect(readFileSync(join(base, LEGACY_DIR_NAME, 'tasks.db'), 'utf8')).toBe('senieji');
  });

  it('tuščią naują katalogą pašalina ir perkelia į jo vietą', () => {
    const base = baze();
    mkdirSync(join(base, DIR_NAME), { recursive: true });
    sukurkSena(base, 'perkeltini');

    const rezultatas = resolveDataDir(base);

    expect(rezultatas).toBe(join(base, DIR_NAME));
    expect(readFileSync(join(rezultatas, 'tasks.db'), 'utf8')).toBe('perkeltini');
  });

  // Dviejų katalogų suliejimas po vieną failą galėtų nutrūkti įpusėjus ir
  // palikti duomenis perskeltus. Tokiu atveju geriau nedaryti nieko.
  it('naujajame esant svetimo turinio be duomenų bazės — lieka prie seno', () => {
    const base = baze();
    const naujas = join(base, DIR_NAME);
    mkdirSync(naujas, { recursive: true });
    writeFileSync(join(naujas, 'kazkas.txt'), 'ne musu');
    sukurkSena(base, 'nepaliesti');

    const rezultatas = resolveDataDir(base);

    expect(rezultatas).toBe(join(base, LEGACY_DIR_NAME));
    expect(readFileSync(join(rezultatas, 'tasks.db'), 'utf8')).toBe('nepaliesti');
  });

  // Programa su senu keliu ir tikrais duomenimis yra teisingesnė būsena nei
  // nauju keliu ir tuščia.
  it('nepavykus perkelti grąžina seną kelią, o ne tuščią naują', () => {
    const base = baze();
    sukurkSena(base, 'išlikę');
    // Naujo katalogo vietoje – failas. `readdirSync` ant jo meta klaidą, tad
    // atkartojamas bet koks perkėlimo nesėkmės atvejis (užrakinta, kitas diskas).
    writeFileSync(join(base, DIR_NAME), 'ne katalogas');

    const rezultatas = resolveDataDir(base);

    expect(rezultatas).toBe(join(base, LEGACY_DIR_NAME));
    expect(readFileSync(join(rezultatas, 'tasks.db'), 'utf8')).toBe('išlikę');
  });
});
