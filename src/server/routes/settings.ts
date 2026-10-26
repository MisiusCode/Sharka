import { Router, type Request } from 'express';
import { resolveLocale } from '../../core/i18n.js';
import {
  hasPin, isLocalBackupDir, type createSettingsStore, type PublicSettings, type SettingsMap,
} from '../../core/settings.js';
import { ApiError } from './tasks.js';

export type SettingsStore = ReturnType<typeof createSettingsStore>;

// `session_secret` čia lygiai dėl tos pačios priežasties kaip PIN laukai:
// jei jis nutekėtų per API arba būtų nustatomas iš tinklo, kopiją
// (`core/backup.ts`) turintis žmogus vėl galėtų pasirašinėti sesijas —
// žr. komentarą prie `sessionKey` faile `server/auth.ts`.
const APSAUGOTI = ['pin_hash', 'pin_salt', 'session_secret'] as const;

// PIN maiša ir druska niekada nekeliauja pas klientą — vietoj jų vienas
// loginis laukas. Šis skaidymas privalo gyventi čia, o ne
// `core/settings.ts`, nes tai HTTP atsakymo forma, ne dalykinė taisyklė.
// Pati „ar PIN nustatytas" taisyklė (abu laukai, ne vien maiša) gyvena
// `core/settings.ts` — vienas predikatas visai programai.
function viesi(all: SettingsMap, systemLocale: string | undefined): PublicSettings {
  const { pin_hash, pin_salt, session_secret, ...likusi } = all;
  return {
    ...likusi,
    has_pin: hasPin(all),
    // Išsprendžiam čia, o ne kliente: Electron lange `navigator.language`
    // seka mūsų pačių `--lang` jungiklį.
    resolved_locale: resolveLocale(all.locale, systemLocale),
  };
}

export function settingsRouter(
  settings: SettingsStore,
  systemLocale: string | undefined,
  // Ta pati funkcija, kuria `server/app.ts` grandis sprendžia, ar užklausą
  // laikyti loopback: čia ji reikalinga antrą kartą, nes `backup_dir`
  // apribojimas priklauso NE nuo to, ar naudotojas jau prisijungęs (slapuku),
  // o nuo to, ar įrenginys apskritai yra šis kompiuteris.
  trustRequest: (req: Request) => boolean,
): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(viesi(settings.getAll(), systemLocale));
  });

  router.patch('/', (req, res) => {
    const kunas = (req.body ?? {}) as Record<string, unknown>;
    for (const raktas of APSAUGOTI) {
      if (raktas in kunas) {
        throw new ApiError(400, 'protected_setting', 'The PIN is changed via /api/pin');
      }
    }

    // UNC kelią priima tik loopback (žr. `isValidBackupDir` komentarą
    // `core/settings.ts`) — tinklo klientui per VACUUM INTO
    // (`core/backup.ts`) jis išneštų visą bazę su PIN maiša į svetimą
    // serverį. Tikrinama TIK kai `backup_dir` iš tikrųjų ateina šiame
    // patch'e, kad nekliudytų kitiems laukams.
    if ('backup_dir' in kunas && !trustRequest(req) && !isLocalBackupDir(kunas.backup_dir)) {
      throw new ApiError(400, 'remote_backup_dir', 'A network path cannot be set from another device');
    }

    try {
      res.json(viesi(settings.patch(kunas as Partial<SettingsMap>), systemLocale));
    } catch (err) {
      throw new ApiError(400, 'invalid_setting', (err as Error).message);
    }
  });

  return router;
}
