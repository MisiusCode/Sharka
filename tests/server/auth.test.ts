import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { fixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { createSettingsStore } from '../../src/core/settings.js';
import { createTaskStore } from '../../src/core/tasks.js';
import { createApp } from '../../src/server/app.js';
import { createEventHub } from '../../src/server/events.js';
import { hashPin } from '../../src/core/pin.js';
import {
  createThrottle, isLoopback, parseCookies, SESSION_COOKIE, signSession, verifySession,
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

function aplinka(options: { trusted: boolean; pin?: string }) {
  const db = openDb(':memory:');
  const settings = createSettingsStore(db);
  if (options.pin !== undefined) {
    const { hash, salt } = hashPin(options.pin);
    settings.patch({ pin_hash: hash, pin_salt: salt, lan: true });
  }
  const clock = fixedClock('2026-09-02T10:00:00.000Z');
  // Keičiama vėliava: kitas etapas tikrina slapuko nuvertinimą TOJE PAČIOJE
  // programoje, tad pasitikėjimą reikia perjungti jau sukūrus `app`.
  const trusted = { value: options.trusted };
  const app = createApp({
    tasks: createTaskStore(db, clock),
    settings,
    events: createEventHub(),
    clock,
    trustRequest: () => trusted.value,
  });
  return { app, settings, clock, db, trusted };
}

describe('API grandis', () => {
  it('loopback praleidžiamas be jokio slapuko', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    await request(app).get('/api/tasks').expect(200);
  });

  it('svetimas adresas be slapuko gauna 401', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    const res = await request(app).get('/api/tasks').expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('svetimas adresas su galiojančiu slapuku įleidžiamas', async () => {
    const { app, settings, clock } = aplinka({ trusted: false, pin: '1234' });
    const slapukas = signSession(
      settings.getAll().pin_hash!,
      clock.now().getTime() + 1000,
    );
    await request(app)
      .get('/api/tasks')
      .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
      .expect(200);
  });

  // Be PIN tinklo prieigos įjungti neįmanoma, tad svetimas adresas šiuo atveju
  // negali atsirasti teisėtai — bet jei atsirastų, jį atmetam, o ne įleidžiam.
  it('svetimas adresas atmetamas ir tada, kai PIN visai nenustatytas', async () => {
    const { app } = aplinka({ trusted: false });
    await request(app).get('/api/tasks').expect(401);
  });

  it('SSE srautas eina per tą pačią grandį', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    await request(app).get('/api/events').expect(401);
  });
});

describe('prisijungimas ir PIN', () => {
  it('teisingas PIN grąžina slapuką, kuris atrakina API', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    const res = await request(app).post('/api/session').send({ pin: '1234' }).expect(200);

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');

    await request(app).get('/api/tasks').set('Cookie', cookie).expect(200);
  });

  it('neteisingas PIN grąžina 401, o po penkių bandymų — 429', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/session').send({ pin: '9999' }).expect(401);
    }
    await request(app).post('/api/session').send({ pin: '9999' }).expect(429);
    // Užrakintas ir teisingas PIN nepraeina — kitaip ribojimas nieko neduotų.
    await request(app).post('/api/session').send({ pin: '1234' }).expect(429);
  });

  it('PIN pakeitimas nuvertina senus slapukus', async () => {
    const env = aplinka({ trusted: true, pin: '1234' });
    const res = await request(env.app).post('/api/session').send({ pin: '1234' }).expect(200);
    const senas = res.headers['set-cookie'][0];

    await request(env.app).put('/api/pin').send({ pin: '5678' }).expect(204);

    // Ta pati programa, ta pati bazė — tik nebe loopback: senas slapukas
    // pasirašytas senąja maiša, tad nebeturi galioti.
    env.trusted.value = false;
    await request(env.app).get('/api/tasks').set('Cookie', senas).expect(401);
  });

  it('GET /api/settings negrąžina maišos, o rodo has_pin', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    const res = await request(app).get('/api/settings').expect(200);
    expect(res.body.pin_hash).toBeUndefined();
    expect(res.body.pin_salt).toBeUndefined();
    expect(res.body.has_pin).toBe(true);
  });

  it('PATCH /api/settings atsisako liesti PIN raktus', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    const res = await request(app).patch('/api/settings').send({ pin_hash: 'xx' }).expect(400);
    expect(res.body.error.code).toBe('protected_setting');
  });

  it('netinkamo formato PIN atmetamas', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    await request(app).put('/api/pin').send({ pin: '12' }).expect(400);
  });

  // /api/pin sumontuotas PO grandies (R4): svetimas adresas be slapuko privalo
  // gauti 401 taip pat, kaip ir prie bet kurio kito /api kelio. Jei pinRouter
  // kada nors būtų sumontuotas prieš grandį arba grandyje atsirastų jam
  // išimtis, šis testas nukristų.
  it('svetimas adresas be slapuko negali keisti PIN per /api/pin', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    const res = await request(app).put('/api/pin').send({ pin: '5678' }).expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('PIN pašalinimas išjungia ir tinklo prieigą', async () => {
    const { app, settings } = aplinka({ trusted: true, pin: '1234' });
    await request(app).put('/api/pin').send({ pin: null }).expect(204);
    expect(settings.getAll().pin_hash).toBeNull();
    expect(settings.getAll().lan).toBe(false);
  });
});
