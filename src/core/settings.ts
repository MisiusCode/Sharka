import type Database from 'better-sqlite3';
import type { Locale, LocaleSetting } from './i18n.js';

export interface SettingsMap {
  grouping: 'date' | 'status' | 'completed';
  theme: 'light' | 'dark' | 'system';
  locale: LocaleSetting;
  sound: 'always' | 'alarms' | 'off';
  digest_times: string[];
  port: number;
  hotkey: string;
  autostart: boolean;
  last_digest: string | null;
  backup_dir: string;
  last_backup: string | null;
  last_backup_error: string | null;
  lan: boolean;
  pin_hash: string | null;
  pin_salt: string | null;
  // Atskira paslaptis sesijos raktui (žr. `server/auth.ts` `sessionKey`) — NE
  // Node `randomBytes` čia: šis modulis importuojamas iš `ui/`, tad turi likti
  // be Node builtinų. Paslaptis generuojama serveryje (`server/routes/auth.ts`).
  // Apsauga nuo kopijos (OneDrive ir pan.) turėtojo remiasi TUO, kad
  // `core/backup.ts` (`writeBackup`) šį lauką pačioje kopijoje nunulina iškart
  // po `VACUUM INTO` — `pin_hash`/`pin_salt` ten sąmoningai lieka.
  session_secret: string | null;
}

export const SETTING_DEFAULTS: SettingsMap = Object.freeze({
  grouping: 'date',
  theme: 'system',
  // Kaip ir `theme`: numatytoji reikšmė seka sistemos kalbą, o ne užrakina lietuvių.
  locale: 'system',
  sound: 'alarms',
  digest_times: Object.freeze(['10:00', '15:30']) as string[],
  port: 8080,
  hotkey: 'Ctrl+Alt+Space',
  autostart: true,
  last_digest: null,
  // Tuščia reiškia „dar nenustatyta" — `main.ts` startuojant įrašo numatytąjį
  // kelią. `core` negali kreiptis į `server/index.ts` dataDir, tad kelias
  // atkeliauja iš išorės.
  backup_dir: '',
  last_backup: null,
  last_backup_error: null,
  // Tinklo prieiga išjungta pagal nutylėjimą: svetimame tinkle atviras serveris
  // yra pavojus, o namų tinkle tai vieno jungiklio kaina.
  lan: false,
  pin_hash: null,
  pin_salt: null,
  session_secret: null,
}) as SettingsMap;

const KEYS = Object.keys(SETTING_DEFAULTS) as (keyof SettingsMap)[];

// Ką grąžina API: PIN maiša ir druska nekeliauja pas klientą niekada, o vietoj
// jų atsiranda vienas loginis laukas. `resolved_locale` — serverio
// jau išspręsta kalba (žr. `server/routes/settings.ts`), ne vien saugoma
// `locale` reikšmė: Electron lange klientas negali pats paklausti sistemos
// kalbos.
export type PublicSettings = Omit<SettingsMap, 'pin_hash' | 'pin_salt' | 'session_secret'>
  & { has_pin: boolean; resolved_locale: Locale };

// Vienintelis „ar PIN nustatytas" predikatas visai programai: reikalauja
// abiejų laukų, ne tik `pin_hash`. `PUT /api/pin` juos visada rašo kartu, tad
// šiandien tai nepasiekiama per HTTP, bet be vieno predikato trys vietos
// (čia, `server/app.ts`, `server/routes/settings.ts`) galėjo tyliai išsiskirti.
export function hasPin(
  s: Pick<SettingsMap, 'pin_hash' | 'pin_salt'>,
): s is Pick<SettingsMap, 'pin_hash' | 'pin_salt'> & { pin_hash: string; pin_salt: string } {
  return s.pin_hash !== null && s.pin_salt !== null;
}

const DIGEST_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Karštasis klavišas privalo turėti bent vieną modifikatorių: globalus
// spartusis klavišas pasisavina jį visoje operacinėje sistemoje, tad plikas
// `T` padarytų tą klavišą nebenaudojamą visur kitur. Taisyklė gyvena ČIA, o ne
// tik naršyklėje: `PATCH /api/settings` yra pasiekiamas visam namų tinklui be
// autentikacijos, tad kliento pusės patikra jos neužtikrina.
//
// `AltGr` SĄMONINGAI čia nėra: Electron `AltGr+T` išparsuoja į savo vidinę
// `EF_ALTGR_DOWN` žymą, bet Chromium'o Windows globalaus sparčiojo klavišo
// registratorius savo `RegisterHotKey` kaukę sudaro tik iš Shift/Ctrl/Alt/Cmd
// — `EF_ALTGR_DOWN` joje nedalyvauja. Registracija faktiškai virsta
// `RegisterHotKey(hwnd, id, 0, 'T')`: klavišas be jokio modifikatoriaus.
// Paspaudus pliką `T` bet kur sistemoje atsivertų greitosios įvesties langas
// ir „prarytų" tą klavišą — būtent tai, nuo ko šis validatorius yra
// vienintelė apsauga.
const MODIFIKATORIAI = ['Ctrl', 'Alt', 'Shift', 'Super', 'Cmd', 'Command', 'Meta', 'CommandOrControl', 'CmdOrCtrl'];

export function isValidHotkey(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Tuščios dalys neišfiltruojamos, o atmetamos: `Ctrl+` ar `Ctrl+T+` yra
  // sugadinta įvestis, o ne kombinacija su papildomu pliusu (Electron pliuso
  // klavišą vadina `Plus`).
  const parts = value.split('+');
  if (parts.length < 2 || parts.some((p) => p === '')) return false;
  const key = parts[parts.length - 1];
  if (MODIFIKATORIAI.includes(key)) return false;
  return parts.slice(0, -1).every((p) => MODIFIKATORIAI.includes(p));
}

// Kopijų aplankas keliauja tiesiai į `mkdirSync` ir `VACUUM INTO`
// (`core/backup.ts`). Ši funkcija atsako tik į klausimą „ar tai apskritai
// kelias" — ji PRIIMA ir UNC, nes programa pati siūlo tokį pasirinkimą:
// `settings.backupHint` (`core/i18n.ts`) rekomenduoja tinklo disko aplanką, o
// `backup:pick` dialogas (`desktop/main.ts`) pasirinkus „Tinklas" grąžina
// būtent UNC kelią. UNC apribojimas NEPATIKIMAM (tinklo) klientui gyvena
// `server/routes/settings.ts` (`isLocalBackupDir` žemiau) — grėsmės modelis
// kalba apie svetimą įrenginį, ne apie savininką prie savo kompiuterio per
// loopback.
const VIETINIS_KELIAS = /^[A-Za-z]:[\\/]/;
const UNC_KELIAS = /^(\\\\|\/\/)/;

export function isValidBackupDir(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value === '') return true; // kopijos išjungtos
  return VIETINIS_KELIAS.test(value) || UNC_KELIAS.test(value);
}

// Griežtesnė versija: PATCH /api/settings pasiekiamas visam tinklui vos
// nustačius PIN, o UNC kelias per VACUUM INTO (`core/backup.ts`) išneštų visą
// bazę su PIN maiša į svetimą serverį — Windows dar ir pasiūlytų tam
// serveriui NTLM autentikaciją. Naudoja tik `server/routes/settings.ts`, kai
// užklausa ateina NE per loopback; loopback (pats nustatymų langas) šį kelią
// rinktis gali, žr. komentarą prie `isValidBackupDir`.
export function isLocalBackupDir(value: unknown): boolean {
  if (!isValidBackupDir(value)) return false;
  return typeof value !== 'string' || !UNC_KELIAS.test(value);
}

const VALIDATORS: { [K in keyof SettingsMap]: (value: unknown) => boolean } = {
  grouping: (v) => v === 'date' || v === 'status' || v === 'completed',
  theme: (v) => v === 'light' || v === 'dark' || v === 'system',
  locale: (v) => v === 'lt' || v === 'en' || v === 'system',
  sound: (v) => v === 'always' || v === 'alarms' || v === 'off',
  port: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535,
  hotkey: isValidHotkey,
  autostart: (v) => typeof v === 'boolean',
  digest_times: (v) =>
    Array.isArray(v) && v.every((t) => typeof t === 'string' && DIGEST_TIME_RE.test(t)),
  last_digest: (v) => v === null || typeof v === 'string',
  backup_dir: isValidBackupDir,
  last_backup: (v) => v === null || typeof v === 'string',
  last_backup_error: (v) => v === null || typeof v === 'string',
  lan: (v) => typeof v === 'boolean',
  pin_hash: (v) => v === null || typeof v === 'string',
  pin_salt: (v) => v === null || typeof v === 'string',
  session_secret: (v) => v === null || typeof v === 'string',
};

export function createSettingsStore(db: Database.Database) {
  const selectAll = db.prepare('SELECT key, value FROM settings');
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );

  const getAll = (): SettingsMap => {
    const stored = new Map(
      (selectAll.all() as { key: string; value: string }[]).map((r) => [r.key, r.value]),
    );
    // Gili kopija: paviršinė grąžintų tą patį digest_times masyvą kiekvienam
    // kvietėjui, tad vienas jį pakeitęs sugadintų numatytąsias reikšmes visiems.
    const result = structuredClone(SETTING_DEFAULTS);
    for (const key of KEYS) {
      const raw = stored.get(key);
      if (raw !== undefined) {
        (result as unknown as Record<string, unknown>)[key] = JSON.parse(raw);
      }
    }
    return result;
  };

  return {
    getAll,
    patch(values: Partial<SettingsMap>): SettingsMap {
      for (const key of Object.keys(values)) {
        if (!KEYS.includes(key as keyof SettingsMap)) {
          throw new Error(`Unknown setting: ${key}`);
        }
        const typedKey = key as keyof SettingsMap;
        if (!VALIDATORS[typedKey](values[typedKey])) {
          throw new Error(`Invalid setting value: ${key}`);
        }
      }
      // Kryžminė taisyklė: įjungti tinklo prieigą be PIN neįmanoma. Tikrinam
      // prieš rašymą ir įskaitom tą patį patch'ą — PIN ir `lan` gali ateiti
      // kartu (nustatymų ekranas siunčia būtent taip).
      if (values.lan === true) {
        const dabartiniai = getAll();
        const busimas = {
          pin_hash: values.pin_hash !== undefined ? values.pin_hash : dabartiniai.pin_hash,
          pin_salt: values.pin_salt !== undefined ? values.pin_salt : dabartiniai.pin_salt,
        };
        if (!hasPin(busimas)) {
          throw new Error('Set a PIN before allowing network access');
        }
      }
      const write = db.transaction((entries: [string, unknown][]) => {
        for (const [key, value] of entries) upsert.run(key, JSON.stringify(value));
      });
      write(Object.entries(values));
      return getAll();
    },
  };
}
