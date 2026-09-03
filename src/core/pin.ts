import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// DĖMESIO: šis modulis naudoja Node builtinus, tad jo NEGALIMA importuoti iš
// `ui/` — Vite bandytų `node:crypto` sudėti į naršyklės paketą ir buildas lūžtų.
// Būtent todėl maiša gyvena čia, o ne `core/settings.ts`, kurį `ui/` importuoja.

const PIN_RE = /^\d{4,8}$/;
const RAKTO_ILGIS = 32;

export interface PinHash {
  hash: string;
  salt: string;
}

export function isValidPin(value: unknown): boolean {
  return typeof value === 'string' && PIN_RE.test(value);
}

export function hashPin(pin: string): PinHash {
  const salt = randomBytes(16).toString('hex');
  return { hash: scryptSync(pin, salt, RAKTO_ILGIS).toString('hex'), salt };
}

export function verifyPin(pin: string, stored: PinHash): boolean {
  if (!isValidPin(pin)) return false;
  const laukiama = Buffer.from(stored.hash, 'hex');
  if (laukiama.length !== RAKTO_ILGIS) return false;
  const kandidatas = scryptSync(pin, stored.salt, RAKTO_ILGIS);
  return timingSafeEqual(kandidatas, laukiama);
}
