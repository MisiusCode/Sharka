import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../core/clock.js';

export const SESSION_COOKIE = 'sarka_session';

// 30 parų: planšetė stovi tame pačiame tinkle nuolat, tad dažnesnis PIN
// klausimas būtų vien trukdis (spec §4.4).
export const SESSION_TRUKME_MS = 30 * 24 * 60 * 60 * 1000;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.has(address);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (header === undefined || header === '') return result;
  for (const dalis of header.split(';')) {
    const lygybe = dalis.indexOf('=');
    if (lygybe === -1) continue;
    const raktas = dalis.slice(0, lygybe).trim();
    if (raktas === '') continue;
    result[raktas] = dalis.slice(lygybe + 1).trim();
  }
  return result;
}

export function signSession(key: string, expiresAt: number): string {
  const parasas = createHmac('sha256', key).update(String(expiresAt)).digest('hex');
  return `${expiresAt}.${parasas}`;
}

export function verifySession(key: string, value: string | undefined, now: number): boolean {
  if (value === undefined) return false;
  const [galiojaIki, parasas] = value.split('.');
  if (galiojaIki === undefined || parasas === undefined) return false;
  const laikas = Number(galiojaIki);
  if (!Number.isFinite(laikas) || laikas <= now) return false;

  const laukiamas = Buffer.from(createHmac('sha256', key).update(galiojaIki).digest('hex'), 'hex');
  const gautas = Buffer.from(parasas, 'hex');
  if (gautas.length !== laukiamas.length) return false;
  return timingSafeEqual(gautas, laukiamas);
}

export interface Throttle {
  blocked(addr: string): boolean;
  fail(addr: string): void;
  reset(addr: string): void;
}

// Atmintyje, ne bazėje: užraktas galioja 15 minučių, o programos perkrovimas
// yra retesnis įvykis nei tas langas. Bazėje jis kainuotų migraciją ir rašymą
// į diską kiekvienam neteisingam spėjimui.
export function createThrottle(
  clock: Clock,
  max = 5,
  windowMs = 15 * 60 * 1000,
): Throttle {
  const bandymai = new Map<string, { count: number; iki: number }>();

  return {
    blocked(addr) {
      const irasas = bandymai.get(addr);
      if (irasas === undefined) return false;
      if (clock.now().getTime() >= irasas.iki) {
        bandymai.delete(addr);
        return false;
      }
      return irasas.count >= max;
    },
    fail(addr) {
      const dabar = clock.now().getTime();
      const irasas = bandymai.get(addr);
      if (irasas === undefined || dabar >= irasas.iki) {
        bandymai.set(addr, { count: 1, iki: dabar + windowMs });
        return;
      }
      irasas.count += 1;
    },
    reset(addr) {
      bandymai.delete(addr);
    },
  };
}
