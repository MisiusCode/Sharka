import type Database from 'better-sqlite3';

export interface SettingsMap {
  grouping: 'date' | 'status' | 'completed';
  theme: 'light' | 'dark' | 'system';
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
}

export const SETTING_DEFAULTS: SettingsMap = Object.freeze({
  grouping: 'date',
  theme: 'system',
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
  // yra pavojus, o namų tinkle tai vieno jungiklio kaina (spec §4.1).
  lan: false,
  pin_hash: null,
  pin_salt: null,
}) as SettingsMap;

const KEYS = Object.keys(SETTING_DEFAULTS) as (keyof SettingsMap)[];

// Ką grąžina API: PIN maiša ir druska nekeliauja pas klientą niekada, o vietoj
// jų atsiranda vienas loginis laukas (spec §4.3).
export type PublicSettings = Omit<SettingsMap, 'pin_hash' | 'pin_salt'> & { has_pin: boolean };

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

const VALIDATORS: { [K in keyof SettingsMap]: (value: unknown) => boolean } = {
  grouping: (v) => v === 'date' || v === 'status' || v === 'completed',
  theme: (v) => v === 'light' || v === 'dark' || v === 'system',
  sound: (v) => v === 'always' || v === 'alarms' || v === 'off',
  port: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535,
  hotkey: isValidHotkey,
  autostart: (v) => typeof v === 'boolean',
  digest_times: (v) =>
    Array.isArray(v) && v.every((t) => typeof t === 'string' && DIGEST_TIME_RE.test(t)),
  last_digest: (v) => v === null || typeof v === 'string',
  backup_dir: (v) => typeof v === 'string',
  last_backup: (v) => v === null || typeof v === 'string',
  last_backup_error: (v) => v === null || typeof v === 'string',
  lan: (v) => typeof v === 'boolean',
  pin_hash: (v) => v === null || typeof v === 'string',
  pin_salt: (v) => v === null || typeof v === 'string',
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
          throw new Error(`Nežinomas nustatymas: ${key}`);
        }
        const typedKey = key as keyof SettingsMap;
        if (!VALIDATORS[typedKey](values[typedKey])) {
          throw new Error(`Netinkama nustatymo reikšmė: ${key}`);
        }
      }
      // Kryžminė taisyklė: įjungti tinklo prieigą be PIN neįmanoma. Tikrinam
      // prieš rašymą ir įskaitom tą patį patch'ą — PIN ir `lan` gali ateiti
      // kartu (nustatymų ekranas siunčia būtent taip).
      if (values.lan === true) {
        const busimasHash = values.pin_hash !== undefined ? values.pin_hash : getAll().pin_hash;
        if (busimasHash === null) {
          throw new Error('Tinklo prieigai pirma nustatyk PIN kodą');
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
