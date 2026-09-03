import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/core/clock.js';
import {
  createThrottle, isLoopback, parseCookies, signSession, verifySession,
} from '../../src/server/auth.js';

describe('isLoopback', () => {
  it('atpažįsta visas tris loopback formas', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    // Node IPv4 adresą per IPv6 lizdą pateikia būtent taip.
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
  });

  it('svetimą adresą ir tuštumą atmeta', () => {
    expect(isLoopback('192.168.1.14')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
    // Klastotė, prasidedanti tais pačiais simboliais.
    expect(isLoopback('127.0.0.1.evil.lt')).toBe(false);
  });
});

describe('parseCookies', () => {
  it('išskiria reikšmes ir praleidžia šiukšles', () => {
    expect(parseCookies('a=1; sarka_session=xyz')).toEqual({ a: '1', sarka_session: 'xyz' });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });
});

describe('signSession ir verifySession', () => {
  const RAKTAS = 'maisa';
  const DABAR = 1_000_000;

  it('savo paties parašą priima', () => {
    expect(verifySession(RAKTAS, signSession(RAKTAS, DABAR + 1000), DABAR)).toBe(true);
  });

  it('kitu raktu pasirašytą atmeta — tai ir yra PIN pakeitimo atjungimas', () => {
    expect(verifySession('kita-maisa', signSession(RAKTAS, DABAR + 1000), DABAR)).toBe(false);
  });

  it('pasibaigusį ir sugadintą atmeta', () => {
    expect(verifySession(RAKTAS, signSession(RAKTAS, DABAR - 1), DABAR)).toBe(false);
    expect(verifySession(RAKTAS, 'nesamone', DABAR)).toBe(false);
    expect(verifySession(RAKTAS, undefined, DABAR)).toBe(false);
    // Galiojimo laiko pakeitimas be naujo parašo.
    const [, sig] = signSession(RAKTAS, DABAR + 1000).split('.');
    expect(verifySession(RAKTAS, `${DABAR + 99999}.${sig}`, DABAR)).toBe(false);
  });
});

describe('createThrottle', () => {
  it('užrakina po penkių nesėkmių ir atleidžia pasibaigus langui', () => {
    const clock = fixedClock('2026-09-02T10:00:00.000Z');
    const throttle = createThrottle(clock, 5, 15 * 60 * 1000);

    for (let i = 0; i < 5; i += 1) {
      expect(throttle.blocked('1.2.3.4')).toBe(false);
      throttle.fail('1.2.3.4');
    }
    expect(throttle.blocked('1.2.3.4')).toBe(true);

    // Kitas adresas nenukenčia.
    expect(throttle.blocked('5.6.7.8')).toBe(false);

    clock.set('2026-09-02T10:15:01.000Z');
    expect(throttle.blocked('1.2.3.4')).toBe(false);
  });

  it('sėkmingas prisijungimas nuvalo skaitiklį', () => {
    const clock = fixedClock('2026-09-02T10:00:00.000Z');
    const throttle = createThrottle(clock, 5, 15 * 60 * 1000);
    for (let i = 0; i < 4; i += 1) throttle.fail('1.2.3.4');
    throttle.reset('1.2.3.4');
    for (let i = 0; i < 4; i += 1) throttle.fail('1.2.3.4');
    expect(throttle.blocked('1.2.3.4')).toBe(false);
  });
});
