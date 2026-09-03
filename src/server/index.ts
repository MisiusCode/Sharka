import type { Express } from 'express';
import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { systemClock } from '../core/clock.js';
import { resolveDataDir } from '../core/dataDir.js';
import { openDb } from '../core/db.js';
import { createSettingsStore } from '../core/settings.js';
import { createTaskStore } from '../core/tasks.js';
import { createApp } from './app.js';
import { createEventHub } from './events.js';

export function listenWithFallback(
  app: Express,
  startPort: number,
  attempts: number,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number, left: number): void => {
      const server = app.listen(port, '0.0.0.0');

      const onStartupError = (err: NodeJS.ErrnoException): void => {
        if (err.code !== 'EADDRINUSE' || left <= 1) {
          reject(
            err.code === 'EADDRINUSE'
              ? new Error(`Nepavyko užimti porto: ${port} ir gretimi užimti`)
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

export async function startServer(uiDir?: string): Promise<{ server: Server; port: number }> {
  const db = openDb(join(dataDir(), 'tasks.db'));
  const settings = createSettingsStore(db);
  const app = createApp({
    tasks: createTaskStore(db, systemClock),
    settings,
    events: createEventHub(),
    clock: systemClock,
    uiDir,
  });
  const port = process.env.SARKA_PORT !== undefined
    ? Number(process.env.SARKA_PORT)
    : settings.getAll().port;
  return listenWithFallback(app, port, 5);
}
