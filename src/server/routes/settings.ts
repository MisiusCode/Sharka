import { Router } from 'express';
import type { createSettingsStore, PublicSettings, SettingsMap } from '../../core/settings.js';
import { ApiError } from './tasks.js';

export type SettingsStore = ReturnType<typeof createSettingsStore>;

const APSAUGOTI = ['pin_hash', 'pin_salt'] as const;

// PIN maiša ir druska niekada nekeliauja pas klientą — vietoj jų vienas
// loginis laukas (spec §4.3). Šis skaidymas privalo gyventi čia, o ne
// `core/settings.ts`, nes tai HTTP atsakymo forma, ne dalykinė taisyklė.
function viesi(all: SettingsMap): PublicSettings {
  const { pin_hash, pin_salt, ...likusi } = all;
  return { ...likusi, has_pin: pin_hash !== null && pin_salt !== null };
}

export function settingsRouter(settings: SettingsStore): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(viesi(settings.getAll()));
  });

  router.patch('/', (req, res) => {
    const kunas = (req.body ?? {}) as Record<string, unknown>;
    for (const raktas of APSAUGOTI) {
      if (raktas in kunas) {
        throw new ApiError(400, 'protected_setting', 'PIN keičiamas per /api/pin');
      }
    }

    try {
      res.json(viesi(settings.patch(kunas as Partial<SettingsMap>)));
    } catch (err) {
      throw new ApiError(400, 'invalid_setting', (err as Error).message);
    }
  });

  return router;
}
