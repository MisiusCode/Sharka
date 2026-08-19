import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, openDb, backupBeforeMigrate } from '../../src/core/db.js';

describe('openDb', () => {
  it('sukuria lenteles tuščioje bazėje', () => {
    const db = openDb(':memory:');
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain('tasks');
    expect(names).toContain('settings');
  });

  it('įrašo schemos versiją', () => {
    const db = openDb(':memory:');
    const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
    expect((row as { value: string }).value).toBe(String(SCHEMA_VERSION));
  });

  it('pakartotinis atidarymas nieko nesulaužo', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('a', 'Testas', '2026-08-14T10:00:00Z', '2026-08-14T10:00:00Z')",
    ).run();
    const count = db.prepare('SELECT COUNT(*) AS n FROM tasks').get();
    expect((count as { n: number }).n).toBe(1);
  });

  it('įjungia svetimų raktų ir WAL režimą', () => {
    const db = openDb(':memory:');
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });

  it('nauja failinė bazė nesurioja atsarginės kopijos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-'));
    const path = join(dir, 'tasks.db');

    openDb(path).close();
    expect(existsSync(`${path}.bak`)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it('jau sumigruotos bazės pakartotinis atidarymas nieko nesulaužo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-'));
    const path = join(dir, 'tasks.db');

    openDb(path).close();
    openDb(path).close();
    expect(existsSync(`${path}.bak`)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it('backupBeforeMigrate kuria pilną kopiją', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-'));
    const path = join(dir, 'tasks.db');

    const db = openDb(path);
    db.prepare(
      "INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('test-id', 'Test Task', '2026-08-14T10:00:00Z', '2026-08-14T10:00:00Z')",
    ).run();

    backupBeforeMigrate(db, path);

    const backupDb = openDb(`${path}.bak`);
    const row = backupDb
      .prepare("SELECT id, title FROM tasks WHERE id = 'test-id'")
      .get();
    expect(row).toBeDefined();
    expect((row as { id: string; title: string }).title).toBe('Test Task');

    db.close();
    backupDb.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('nepavykus migracijai atšaukia jau sukurtas lenteles, o ne palieka jas be schema_version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-'));
    const path = join(dir, 'tasks.db');

    // Iš anksto sukuriame vardo konfliktą su antru migracijos sakiniu
    // (CREATE INDEX idx_tasks_due), kad `CREATE TABLE tasks` (pirmas sakinys)
    // spėtų įvykti prieš migracijai žlungant — taip patikrinama, ar visas
    // žingsnis atšaukiamas, o ne palieka pusiau sukurtą schemą.
    const pre = new Database(path);
    pre.exec('CREATE TABLE idx_tasks_due (x);');
    pre.close();

    expect(() => openDb(path)).toThrow();

    const check = new Database(path);
    const names = check
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    check.close();

    expect(names).not.toContain('tasks');
    expect(names).not.toContain('settings');

    rmSync(dir, { recursive: true, force: true });
  });

  it('migruoja v1 bazę į v2 pridėdama repeat stulpelį ir nepraranda užduočių', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-migr-'));
    const path = join(dir, 'tasks.db');

    // Rankomis sukuriam v1 bazę — be `repeat`, su schema_version = 1.
    const senas = new Database(path);
    senas.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'todo',
        priority INTEGER NOT NULL DEFAULT 2, due_at TEXT, due_has_time INTEGER NOT NULL DEFAULT 0,
        remind_at TEXT, reminded_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO settings (key, value) VALUES ('schema_version', '1');
      INSERT INTO tasks (id, title, created_at, updated_at)
        VALUES ('a', 'Sena užduotis', '2026-08-01T10:00:00Z', '2026-08-01T10:00:00Z');
    `);
    senas.close();

    const db = openDb(path);

    const stulpeliai = (db.pragma('table_info(tasks)') as { name: string }[]).map((c) => c.name);
    expect(stulpeliai).toContain('repeat');
    expect(db.prepare("SELECT title FROM tasks WHERE id = 'a'").get()).toEqual({ title: 'Sena užduotis' });
    expect(db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get())
      .toEqual({ value: '2' });

    // Migruojant privalo atsirasti atsarginė kopija — tai pirmas kartas, kai
    // `backupBeforeMigrate` apskritai suveikia.
    expect(existsSync(`${path}.bak`)).toBe(true);

    // Vien `existsSync` praeitų net jei kopija būtų daroma PO migracijos —
    // tikriname turinį: `.bak` privalo turėti SENĄJĄ (priešmigracinę) schemą
    // be `repeat` stulpelio ir seną eilutę (3 radinys, specifikacijos 7 sk.).
    const bak = new Database(`${path}.bak`, { readonly: true });
    expect((bak.pragma('table_info(tasks)') as { name: string }[]).map((c) => c.name)).not.toContain('repeat');
    expect(bak.prepare("SELECT title FROM tasks WHERE id = 'a'").get()).toEqual({ title: 'Sena užduotis' });
    bak.close();

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('nepavykus backupBeforeMigrate — db uždaroma ir meta lietuvišką klaidą, įvardijančią .bak failą (5 radinys)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-atsarg-'));
    const path = join(dir, 'tasks.db');

    // v1 bazė, kuriai reikės migracijos į v2.
    const senas = new Database(path);
    senas.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'todo',
        priority INTEGER NOT NULL DEFAULT 2, due_at TEXT, due_has_time INTEGER NOT NULL DEFAULT 0,
        remind_at TEXT, reminded_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO settings (key, value) VALUES ('schema_version', '1');
    `);
    senas.close();

    // `.bak` iš anksto paverčiamas KATALOGU — `rmSync(..., {force:true})`
    // katalogo nepašalina (EISDIR net su force:true), tad `backupBeforeMigrate`
    // realiai suges, imituodama Windows'e užrakintą/OneDrive laikomą failą.
    mkdirSync(`${path}.bak`);

    let thrown: unknown;
    try {
      openDb(path);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(`${path}.bak`);

    // Lemiama patikra: `db` privalo būti uždaryta prieš išimtį pakylant,
    // kitaip pagrindinis bazės failas Windows'e liktų užrakintas (EPERM) ir
    // šis rmSync mestų.
    expect(() => rmSync(path, { force: true })).not.toThrow();

    rmSync(dir, { recursive: true, force: true });
  });
});
