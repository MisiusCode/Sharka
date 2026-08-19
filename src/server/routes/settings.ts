import { Router } from 'express';
import type { createSettingsStore, SettingsMap } from '../../core/settings.js';
import { ApiError } from './tasks.js';

export type SettingsStore = ReturnType<typeof createSettingsStore>;

export function settingsRouter(settings: SettingsStore): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(settings.getAll());
  });

  router.patch('/', (req, res) => {
    try {
      res.json(settings.patch((req.body ?? {}) as Partial<SettingsMap>));
    } catch (err) {
      throw new ApiError(400, 'invalid_setting', (err as Error).message);
    }
  });

  return router;
}
