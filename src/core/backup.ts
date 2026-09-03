import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from './clock.js';
import { formatLocalDate } from './datetime.js';
import { priorityLabel, statusLabel } from './i18n.js';
import { repeatLabel } from './repeat.js';
import type { createSettingsStore } from './settings.js';
import type { TaskStore } from './tasks.js';
import type { Task } from './types.js';

const HEADER = 'Pavadinimas;Būsena;Prioritetas;Terminas;Priminimas;Sukurta;Atlikta;Kartojimas';

// Aiški pabėgimo seka, o ne nematomas U+FEFF simbolis šaltinyje —
// kitaip bet kuris redaktorius, formatuotojas ar „nulinio pločio simbolių
// valymas“, pašalinęs nematomą simbolį čia IR teste vienu metu, paliktų testą
// žaliai praeinantį, o Excel importą sulaužytą (žr. A radinį).
export const BOM = '\uFEFF';

function cell(value: string | null): string {
  const s = value ?? '';
  // Kabliataškis, kabutė ar eilutės lūžis laukelyje sulaužytų stulpelius, tad
  // toks laukelis gaubiamas kabutėmis, o kabutės viduje dvigubinamos.
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tasksToCsv(tasks: Task[]): string {
  const rows = tasks.map((t) =>
    [
      cell(t.title),
      cell(statusLabel('lt', t.status)),
      cell(priorityLabel('lt', t.priority)),
      cell(t.due_at),
      cell(t.remind_at),
      cell(t.created_at),
      cell(t.completed_at),
      cell(t.repeat !== null ? repeatLabel(t.repeat) : null),
    ].join(';'),
  );

  // BOM — be jo Excel iš „Nunešti baterijas" padaro „NuneÅ¡ti".
  // CRLF — Excel to tikisi; LF vienas kai kuriose versijose sulipdo eilutes.
  return `${BOM}${[HEADER, ...rows].join('\r\n')}\r\n`;
}

// Griežtas šablonas su pilnai užpildyta data: `tasks-2026-8-1.db` netinka,
// `tasks-2026-08-13.db.bak` netinka, `senas-tasks-...` netinka. Aplanke gali
// gulėti naudotojo failai, ir nė vienas iš jų neturi patekti į trynimą.
export const BACKUP_RE = /^tasks-(\d{4}-\d{2}-\d{2})\.(db|csv)$/;

export function backupNames(date: string): { db: string; csv: string } {
  return { db: `tasks-${date}.db`, csv: `tasks-${date}.csv` };
}

export function expiredBackupDates(files: string[], keep: number): string[] {
  // `slice(keep)` su `keep <= 0` arba grąžintų VISKĄ (0 — ir šiandienos
  // kopiją), arba pjautų nuo netinkamo galo (neigiamas skaičius). Vienintelis
  // kvietėjas perduoda 7, bet funkcija eksportuota, o klaidos pasekmė —
  // failų trynimas (žr. B radinį).
  if (keep <= 0) return [];

  const dates = new Set<string>();
  for (const name of files) {
    const match = BACKUP_RE.exec(name);
    if (match !== null) dates.add(match[1]);
  }
  // Data imama iš pavadinimo, ne iš failų sistemos laiko žymos:
  // sinchronizuojami aplankai (OneDrive) laiko žymas keičia.
  return [...dates].sort().reverse().slice(keep).sort();
}

export function writeBackup(
  db: Database.Database,
  tasks: Task[],
  dir: string,
  date: string,
): void {
  mkdirSync(dir, { recursive: true });
  const names = backupNames(date);
  const dbPath = join(dir, names.db);

  // VACUUM INTO nepavyksta, jei failas jau yra — tad tos dienos kopija
  // pašalinama, kad pakartotinis paleidimas nesulaužytų kopijavimo.
  rmSync(dbPath, { force: true });
  db.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`);

  writeFileSync(join(dir, names.csv), tasksToCsv(tasks), 'utf8');
}

export function pruneBackups(dir: string, keep: number): void {
  if (!existsSync(dir)) return;

  for (const date of expiredBackupDates(readdirSync(dir), keep)) {
    const names = backupNames(date);
    rmSync(join(dir, names.db), { force: true });
    rmSync(join(dir, names.csv), { force: true });
  }
}

export interface BackupSchedulerDeps {
  db: Database.Database;
  tasks: TaskStore;
  settings: ReturnType<typeof createSettingsStore>;
  clock: Clock;
  keep: number;
}

export interface BackupScheduler {
  tick(): void;
  start(intervalMs: number): () => void;
}

export function createBackupScheduler(deps: BackupSchedulerDeps): BackupScheduler {
  const { db, tasks, settings, clock, keep } = deps;

  const tick = (): void => {
    const today = formatLocalDate(clock.now());
    const current = settings.getAll();

    if (current.backup_dir === '' || current.last_backup === today) return;

    try {
      writeBackup(db, tasks.list(), current.backup_dir, today);
      // Kopija jau pavyko čia — data įrašoma IŠKART, kad rotacijos (senų
      // kopijų trynimo) nesėkmė neverstų kito tiksėjimo kartoti pilną
      // `VACUUM INTO` be galo kas 15 s (žr. 2 radinį).
      settings.patch({ last_backup: today, last_backup_error: null });
      try {
        pruneBackups(current.backup_dir, keep);
      } catch (err) {
        // Trynimas nepavyko (užrakintas failas, OneDrive ar antivirusas laiko
        // rankeną — EPERM/EBUSY) — kopija jau saugi, tad tai nėra priežastis
        // vėl bandyti visą kopiją kitą tiksėjimą. Kitas sėkmingas
        // `pruneBackups` iškarpys sukauptą perteklių.
        console.error('Nepavyko išvalyti senų atsarginių kopijų:', err);
      }
    } catch (err) {
      // `err` gali būti bet kas (`throw` priima bet kokią reikšmę, ne tik
      // `Error`) — `(err as Error).message` tokiu atveju būtų `undefined`, o
      // `settings.patch({ last_backup_error: undefined })` neišlaikytų
      // validatoriaus ir pats mestų (žr. 3 radinį).
      const message = err instanceof Error ? err.message : String(err);
      // `last_backup` NEatnaujinamas — kita proga bandoma iš naujo. Klaida
      // rašoma tik pasikeitus, kitaip žurnalas ir bazė gautų įrašą kas 15 s.
      if (message !== current.last_backup_error) {
        console.error('Nepavyko padaryti atsarginės kopijos:', err);
        try {
          settings.patch({ last_backup_error: message });
        } catch {
          // Bazė nepasiekiama pačiam klaidos įrašymui (pvz., SQLITE_BUSY —
          // šį failą laiko dvi atviros jungtys). „Tick niekada nemeta" yra
          // savybė, kuria remiasi visas likęs dizainas: kitas tiksėjimas
          // pabandys iš naujo, ir tai jau geriau nei neapdorota išimtis
          // `setInterval` atgalinio kvietimo viduje.
        }
      }
    }
  };

  return {
    tick,
    start(intervalMs) {
      const handle = setInterval(tick, intervalMs);
      return () => clearInterval(handle);
    },
  };
}
