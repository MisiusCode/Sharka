import type { Express } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { systemClock } from '../core/clock.js';
import { resolveDataDir } from '../core/dataDir.js';
import { openDb } from '../core/db.js';
import { createSettingsStore, hasPin } from '../core/settings.js';
import { createTaskStore } from '../core/tasks.js';
import { createApp } from './app.js';
import { createEventHub } from './events.js';

export function listenWithFallback(
  app: Express,
  startPort: number,
  attempts: number,
  host = '127.0.0.1',
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number, left: number): void => {
      const server = app.listen(port, host);

      const onStartupError = (err: NodeJS.ErrnoException): void => {
        if (err.code !== 'EADDRINUSE' || left <= 1) {
          reject(
            err.code === 'EADDRINUSE'
              ? new Error(`Could not bind port: ${port} and its neighbours are in use`)
              : err,
          );
          return;
        }
        tryPort(port + 1, left - 1);
      };

      server.once('error', onStartupError);

      server.once('listening', () => {
        // Paleidimo klaidų tvarkyklė nuimama sąmoningai. Palikta ji pirmą klaidą
        // po paleidimo praneštų jau įvykdytam reject (t. y. niekam), o `once` ją
        // pašalintų — antra klaida liktų be nė vieno klausytojo ir Node nukirstų
        // procesą neapdorota išimtimi.
        server.removeListener('error', onStartupError);
        server.on('error', (err) => {
          console.error('Serverio klaida po paleidimo:', err);
        });

        const address = server.address();
        const actual = typeof address === 'object' && address !== null ? address.port : port;
        resolve({ server, port: actual });
      });
    };

    tryPort(startPort, attempts);
  });
}

export function dataDir(): string {
  // Aiškiai nurodytas kelias yra kelias — jokio perkėlimo ten neieškom.
  const override = process.env.SARKA_DATA;
  if (override !== undefined) {
    mkdirSync(override, { recursive: true });
    return override;
  }

  const base = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config');
  // Pirmą kartą po pervadinimo čia perkeliamas senas `taskerpro` aplankas.
  const dir = resolveDataDir(base);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function startServer(
  uiDir?: string,
  // Neprivalomas: `desktop/main.ts` (Electron) paduoda tikrą sistemos kalbą
  // per `app.getPreferredSystemLanguages()`, o šis modulis paleistas tiesiai
  // per `tsx` (žr. `server/start.ts`) jos neturi — be argumento `resolveLocale`
  // su `'system'` nustatymu grąžina anglų (žr. `core/i18n.ts`).
  systemLocale?: string,
): Promise<{ server: Server; port: number }> {
  const db = openDb(join(dataDir(), 'tasks.db'));
  const settings = createSettingsStore(db);
  // Vienkartinis senų duomenų pataisymas, NE schemos migracija (`core/db.ts`
  // `MIGRATIONS` masyvas) — nustatymai yra raktas-reikšmė žemėlapis, o ne SQL
  // schema, tad naujam laukui migracijos nereikia. Bazė, kurioje PIN
  // nustatytas prieš `session_secret` lauko atsiradimą, jos neturės; be šio
  // užpildymo grandis (`app.ts`) tokią bazę laikytų fail-closed būsenoje iki
  // pat kito prisijungimo (žr. `routes/auth.ts` `POST /`, kuris tą patį darytų
  // vėliau) — čia pataisom iškart, paleidimo metu, nelaukiant.
  const esamiNustatymai = settings.getAll();
  if (hasPin(esamiNustatymai) && esamiNustatymai.session_secret === null) {
    settings.patch({ session_secret: randomBytes(32).toString('hex') });
  }
  const app = createApp({
    tasks: createTaskStore(db, systemClock),
    settings,
    events: createEventHub(),
    clock: systemClock,
    uiDir,
    systemLocale,
  });
  const port = process.env.SARKA_PORT !== undefined
    ? Number(process.env.SARKA_PORT)
    : settings.getAll().port;
  // `lan` skaitomas TIK startuojant — lygiai kaip `port`. Gyvo perjungimo nėra,
  // ir nustatymų langas apie tai įspėja.
  const host = settings.getAll().lan ? '0.0.0.0' : '127.0.0.1';
  return listenWithFallback(app, port, 5, host);
}
