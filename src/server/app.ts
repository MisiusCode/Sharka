import express from 'express';
import type { Clock } from '../core/clock.js';
import type { TaskStore } from '../core/tasks.js';
import { isLoopback, parseCookies, SESSION_COOKIE, verifySession } from './auth.js';
import type { EventHub } from './events.js';
import { ApiError, tasksRouter } from './routes/tasks.js';
import { settingsRouter, type SettingsStore } from './routes/settings.js';

export interface AppDeps {
  tasks: TaskStore;
  settings: SettingsStore;
  events: EventHub;
  clock: Clock;
  uiDir?: string;
  // Testai perduoda savo tikrinimą: supertest visada jungiasi per loopback,
  // tad tinklo šaka kitaip nepasiekiama.
  trustRequest?: (req: express.Request) => boolean;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(express.json());

  const trustRequest = deps.trustRequest ?? ((req: express.Request) => isLoopback(req.socket.remoteAddress));

  // Statika lieka atvira — joje nėra duomenų. Saugom tik /api (spec §4.5).
  app.use('/api', (req, res, next) => {
    if (trustRequest(req)) { next(); return; }

    const { pin_hash } = deps.settings.getAll();
    const slapukas = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (pin_hash !== null && verifySession(pin_hash, slapukas, deps.clock.now().getTime())) {
      next();
      return;
    }
    res.status(401).json({ error: { code: 'unauthorized', message: 'Reikia prisijungti' } });
  });

  app.use('/api/tasks', tasksRouter(deps.tasks, deps.events));
  app.use('/api/settings', settingsRouter(deps.settings));

  app.get('/api/events', (req, res) => {
    const unsubscribe = deps.events.subscribe(res);
    req.on('close', unsubscribe);
    res.on('error', unsubscribe);
  });

  // Registruojama PRIEŠ SPA atsarginį maršrutą: kitaip pastarasis pagautų
  // bet kokį nežinomą /api/... kelią ir grąžintų index.html su 200 — klientas,
  // tikėdamasis JSON, gautų analizavimo klaidą vietoj tvarkingo 404.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Nežinomas API kelias' } });
  });

  if (deps.uiDir !== undefined) {
    app.use(express.static(deps.uiDir));
    // Express 5 naudoja path-to-regexp v8: plikas '*' yra nevalidus kelias ir
    // meta klaidą jau registruojant maršrutą. Pavadintas pakaitos simbolis.
    app.get('/*splat', (_req, res) => { res.sendFile('index.html', { root: deps.uiDir }); });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: { code: 'invalid_json', message: 'Netinkamas JSON kūnas' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Vidinė klaida' } });
  });

  return app;
}
