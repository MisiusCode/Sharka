import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// DĖMESIO: šis modulis naudoja Node builtinus, tad jo NEGALIMA importuoti iš
// `ui/` — Vite bandytų `node:crypto` sudėti į naršyklės paketą ir buildas lūžtų.
// Būtent todėl maiša gyvena čia, o ne `core/settings.ts`, kurį `ui/` importuoja.

const PIN_RE = /^\d{4,8}$/;
const RAKTO_ILGIS = 32;

// N=2^17 vietoj numatyto 2^14: keturženklis PIN turi tik 10 000 kandidatų, tad
// vienintelė apsauga nuo kopijos turėtojo yra maišos kaina. `maxmem` privalomas
// — su tokiu N numatytoji 32 MB riba nebeužtenka ir `scryptSync` mestų.
// DĖMESIO: šie parametrai įeina į pačią maišą (skaičiuojami iš naujo kas kartą
// tikrinant), tad bet koks jų pakeitimas ateityje reikštų, kad VISOS bazėje
// jau esančios PIN maišos nustotų galioti — naudotojui tektų PIN nustatyti iš
// naujo. `hashPin` ir `verifyPin` PRIVALO naudoti tą pačią konstantą, kitaip
// tikrinimas neveiktų niekada.
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export interface PinHash {
  hash: string;
  salt: string;
}

export function isValidPin(value: unknown): boolean {
  return typeof value === 'string' && PIN_RE.test(value);
}

export function hashPin(pin: string): PinHash {
  const salt = randomBytes(16).toString('hex');
  return { hash: scryptSync(pin, salt, RAKTO_ILGIS, SCRYPT).toString('hex'), salt };
}

export function verifyPin(pin: string, stored: PinHash): boolean {
  if (!isValidPin(pin)) return false;
  const laukiama = Buffer.from(stored.hash, 'hex');
  if (laukiama.length !== RAKTO_ILGIS) return false;
  const kandidatas = scryptSync(pin, stored.salt, RAKTO_ILGIS, SCRYPT);
  return timingSafeEqual(kandidatas, laukiama);
}
