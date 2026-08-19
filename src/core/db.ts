import Database from 'better-sqlite3';
import { rmSync } from 'node:fs';

export const SCHEMA_VERSION = 2;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE tasks (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'todo',
    priority      INTEGER NOT NULL DEFAULT 2,
    due_at        TEXT,
    due_has_time  INTEGER NOT NULL DEFAULT 0,
    remind_at     TEXT,
    reminded_at   TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    completed_at  TEXT
  );
  CREATE INDEX idx_tasks_due ON tasks(due_at);
  CREATE INDEX idx_tasks_remind ON tasks(remind_at) WHERE remind_at IS NOT NULL;
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE tasks ADD COLUMN repeat TEXT;
  `,
];

function currentVersion(db: Database.Database): number {
  const hasSettings = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
    .get();
  if (!hasSettings) return 0;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
  return row ? Number((row as { value: string }).value) : 0;
}

export function backupBeforeMigrate(db: Database.Database, path: string): void {
  const backup = `${path}.bak`;
  rmSync(backup, { force: true });
  db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const from = currentVersion(db);
  if (from < SCHEMA_VERSION) {
    // Kopija daroma tik migruojant jau turinčią duomenų bazę — kitaip kiekvienas
    // paleidimas perrašytų priešmigracinę kopiją jau sumigruota. Kopija liktų
    // už transakcijos ribų — jei ji pati būtų transakcijos dalis, ją atšaukus
    // dingtų ir kopija, kurios visa prasmė yra išgyventi žlugusią migraciją.
    //
    // Ši šaka yra ta, kuri `backupBeforeMigrate` paleidžia pirmą kartą
    // gyvenime. Realiausias nesėkmės atvejis Windows'e — `.bak`, kurį laiko
    // OneDrive ar antivirusas (5 radinys). Be šio try/catch, nepavykus
    // `rmSync`/`VACUUM INTO`, išimtis pakiltų su vis dar atviru SQLite
    // deskriptoriumi — `db` niekada nebūtų uždaryta, ir bazės failas Windows'e
    // liktų užrakintas (EPERM) kitam bandymui jį atidaryti ar ištrinti.
    // Naudotojas tada matytų klaidą, kaltinančią serverio paleidimą, o ne
    // atsarginę kopiją — ir programa nepasileistų, kol jis pats nerastų ir
    // nepašalintų likusio failo.
    if (from > 0 && path !== ':memory:') {
      try {
        backupBeforeMigrate(db, path);
      } catch (err) {
        db.close();
        const priezastis = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Nepavyko sukurti atsarginės kopijos prieš duomenų bazės atnaujinimą ` +
            `(${path}.bak). Patikrink, ar failo neužrakinęs OneDrive, antivirusinė ` +
            `ar kita programa, ir bandyk paleisti Šarką iš naujo. Priežastis: ${priezastis}`,
        );
      }
    }

    // Migracijos vykdymas ir versijos įrašymas suvynioti į vieną transakciją:
    // žlugimas tarp jų (pvz., proceso nutraukimas) anksčiau palikdavo lenteles
    // be schema_version įrašo, o kitas paleidimas vėl bandydavo kurti tas
    // pačias lenteles ir žlugdavo su „table already exists".
    const migrate = db.transaction(() => {
      for (let v = from; v < SCHEMA_VERSION; v++) {
        db.exec(MIGRATIONS[v]);
      }
      db.prepare(
        "INSERT INTO settings (key, value) VALUES ('schema_version', ?) " +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run(String(SCHEMA_VERSION));
    });
    try {
      migrate();
    } catch (err) {
      // Nepavykus migracijai, `openDb` niekam neatiduoda šio objekto — jei jo
      // neuždarysim čia, failo rankena liks pakibusi ir kitas bandymas ją
      // atidaryti (ar ją ištrinti) žlugs užrakinimo klaida.
      db.close();
      throw err;
    }
  }
  return db;
}
