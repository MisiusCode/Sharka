import express from 'express';
import type { TaskStore } from '../core/tasks.js';
import type { EventHub } from './events.js';
import { ApiError, tasksRouter } from './routes/tasks.js';
import { settingsRouter, type SettingsStore } from './routes/settings.js';

export interface AppDeps {
  tasks: TaskStore;
  settings: SettingsStore;
  events: EventHub;
  uiDir?: string;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(express.json());

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
