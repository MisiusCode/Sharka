import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { fixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { createSettingsStore } from '../../src/core/settings.js';
import { createTaskStore } from '../../src/core/tasks.js';
import { createApp, defaultTrustRequest } from '../../src/server/app.js';
import { createEventHub } from '../../src/server/events.js';
import { hashPin } from '../../src/core/pin.js';
import {
  createThrottle, isLoopback, parseCookies, SESSION_COOKIE, sessionKey, signSession, verifySession,
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

  it('nehex simbolius parašo lauke atmeta, o ne juos tyliai nukerpa', () => {
    // `Buffer.from(..., 'hex')` nevalidžius simbolius sutinka tyliai
    // nutraukdamas dekodavimą — be ilgio patikros tai galėtų virsti apėjimu.
    expect(verifySession(RAKTAS, `${DABAR + 1000}.zzzz`, DABAR)).toBe(false);
  });

  it('papildomus taškus reikšmėje atmeta', () => {
    // Du taškai iš eilės: parašo dalis tampa tuščia eilute, ne undefined.
    expect(verifySession(RAKTAS, `${DABAR + 1000}..sig`, DABAR)).toBe(false);
    // Trys dalys: destrukturizacija tyliai nuima trečiąją — ji neturi tapti
    // priimtinu parašo priedu.
    expect(verifySession(RAKTAS, `${DABAR + 1000}.ab.cd`, DABAR)).toBe(false);
  });
});

describe('sessionKey', () => {
  it('nėra pati PIN maiša, o iš jos išvestas raktas', () => {
    // Kopiją (kartu su `pin_hash`) turintis žmogus neturi galėti pasirašyti
    // sesijos vien nukopijavęs `tasks.db` — žr. `core/backup.ts`.
    const maisa = 'kazkokia-scrypt-maisa';
    expect(sessionKey(maisa, 'paslaptis')).not.toBe(maisa);
  });

  it('ta pati maiša ir paslaptis visada duoda tą patį raktą', () => {
    expect(sessionKey('maisa', 'paslaptis')).toBe(sessionKey('maisa', 'paslaptis'));
  });

  it('skirtingos maišos duoda skirtingus raktus', () => {
    expect(sessionKey('maisa-a', 'paslaptis')).not.toBe(sessionKey('maisa-b', 'paslaptis'));
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

  // Adresas, keičiantis šaltinį kiekvieną bandymą, be pravalymo augintų
  // žemėlapį be ribos — įrašai iki šiol dingdavo tik per blocked()/reset()
  // TAM PAČIAM adresui. Slenkstis čia dirbtinai mažas (2), kad testas
  // nepriklausytų nuo tūkstančio iteracijų.
  it('peraugus slenkstį, pasibaigę įrašai pravalomi — žemėlapis neauga be ribos', () => {
    const clock = fixedClock('2026-09-02T10:00:00.000Z');
    const throttle = createThrottle(clock, 5, 1000, 2);

    throttle.fail('1.1.1.1');
    throttle.fail('2.2.2.2');
    expect(throttle.size()).toBe(2);

    // Abu langai pasibaigę, bet niekas jų dar neišvalė.
    clock.set('2026-09-02T10:00:02.000Z');

    throttle.fail('3.3.3.3');
    // Prieš šį įrašą dydis (2) dar neviršijo slenksčio (2) — pravalymas dar
    // nesuveikė, tad pasenę įrašai vis dar žemėlapyje.
    expect(throttle.size()).toBe(3);

    throttle.fail('4.4.4.4');
    // Dabar prieš rašant dydis (3) viršijo slenkstį: „1.1.1.1“ ir „2.2.2.2“
    // pravalomi, lieka tik dar galiojantis „3.3.3.3“ ir naujas „4.4.4.4“.
    // Be pravalymo dydis būtų 4, ne 2.
    expect(throttle.size()).toBe(2);
  });
});

function aplinka(options: { trusted: boolean; pin?: string; withSecret?: boolean }) {
  const db = openDb(':memory:');
  const settings = createSettingsStore(db);
  if (options.pin !== undefined) {
    const { hash, salt } = hashPin(options.pin);
    // `withSecret` numatytai `true`: dauguma testų nori realistišką, jau
    // pasigydžiusią bazę (lygiai tai, ką `PUT /api/pin` darytų). `withSecret:
    // false` imituoja SENĄ bazę, kurioje PIN nustatytas dar prieš
    // `session_secret` lauko atsiradimą — tam skirtas žemiau esantis testas.
    const secret = options.withSecret === false ? {} : { session_secret: 'testine-sesijos-paslaptis' };
    settings.patch({ pin_hash: hash, pin_salt: salt, lan: true, ...secret });
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
      sessionKey(settings.getAll().pin_hash!, settings.getAll().session_secret ?? ''),
      clock.now().getTime() + 1000,
    );
    await request(app)
      .get('/api/tasks')
      .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
      .expect(200);
  });

  // Sena bazė: PIN nustatytas (per `settings.patch`, apeinant `pinRouter`),
  // bet `session_secret` dar niekada negeneruota — `withSecret: false`.
  // Prieš šį taisymą grandis skaičiuodavo `sessionKey(pin_hash, '')`, o tuščia
  // eilutė yra NUSPĖJAMA: kopijos (`core/backup.ts`) turėtojas tą patį raktą
  // paskaičiuoja pats, nes ir `pin_hash`, ir tuščia eilutė jam žinomi. Todėl
  // grandis PRIVALO atmesti besąlygiškai, kol paslaptis dar `null` — net jei
  // atsineštas slapukas pasirašytas būtent tuo tuščiu raktu ir formaliai
  // atrodo galiojantis pagal seną schemą.
  it('sena bazė be session_secret atmeta net slapuką, pasirašytą tuščiu raktu', async () => {
    const { app, settings, clock } = aplinka({ trusted: false, pin: '1234', withSecret: false });
    expect(settings.getAll().session_secret).toBeNull();
    const tusciuRaktuPasirasytas = signSession(
      sessionKey(settings.getAll().pin_hash!, ''),
      clock.now().getTime() + 1000,
    );
    await request(app)
      .get('/api/tasks')
      .set('Cookie', `${SESSION_COOKIE}=${tusciuRaktuPasirasytas}`)
      .expect(401);
  });

  // Grandis tikrina raktą, IŠVESTĄ iš pin_hash, ne pačią pin_hash — kitaip
  // bazės kopijoje (žr. `core/backup.ts`, kuri nukopijuoja visą `tasks.db` į
  // OneDrive ar tinklo diską) esanti maiša leistų bet kam pasirašinėti sesijas.
  it('slapukas, pasirašytas pačia PIN maiša, o ne iš jos išvestu raktu, atmetamas', async () => {
    const { app, settings, clock } = aplinka({ trusted: false, pin: '1234' });
    const klastote = signSession(settings.getAll().pin_hash!, clock.now().getTime() + 1000);
    await request(app)
      .get('/api/tasks')
      .set('Cookie', `${SESSION_COOKIE}=${klastote}`)
      .expect(401);
  });

  // „Ar PIN nustatytas" grandyje ir `core/settings.ts` privalo būti tas pats
  // predikatas (abu laukai). `PUT /api/pin` visada rašo abu kartu, tad ši
  // būsena šiandien pasiekiama tik apeinant maršrutą — tiesiogiai per store.
  it('slapukas atmetamas, jei PIN druska dingusi, nors maiša (ir senas slapukas) dar galioja', async () => {
    const { app, settings, clock } = aplinka({ trusted: false, pin: '1234' });
    const galiojantis = signSession(
      sessionKey(settings.getAll().pin_hash!, settings.getAll().session_secret ?? ''),
      clock.now().getTime() + 1000,
    );
    settings.patch({ pin_salt: null });
    await request(app)
      .get('/api/tasks')
      .set('Cookie', `${SESSION_COOKIE}=${galiojantis}`)
      .expect(401);
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

  // Sena bazė (PIN be `session_secret`, žr. testą aukščiau `describe('API
  // grandis')` bloke) pasigydo per PIRMĄ sėkmingą prisijungimą — nereikia
  // laukti, kol kas nors dar kartą praeis per `PUT /api/pin`.
  it('POST /api/session sena bazė be paslapties ją sugeneruoja ir grąžina veikiantį slapuką', async () => {
    const { app, settings } = aplinka({ trusted: false, pin: '1234', withSecret: false });
    expect(settings.getAll().session_secret).toBeNull();

    const res = await request(app).post('/api/session').send({ pin: '1234' }).expect(200);
    expect(settings.getAll().session_secret).not.toBeNull();

    const cookie = res.headers['set-cookie'][0];
    await request(app).get('/api/tasks').set('Cookie', cookie).expect(200);
  });

  it('neteisingas PIN grąžina 401, o po penkių bandymų — 429', async () => {
    const { app } = aplinka({ trusted: false, pin: '1234' });
    const pirmas = await request(app).post('/api/session').send({ pin: '9999' }).expect(401);
    // Kodas 'invalid_pin' skirtas būtent šiai — neteisingo slapto skaičiaus —
    // klaidai; formato klaida (PUT /api/pin) turi kitą kodą.
    expect(pirmas.body.error.code).toBe('invalid_pin');
    for (let i = 0; i < 4; i += 1) {
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

  it('teisėto PATCH /api/settings atsakymas irgi paslepia PIN maišą ir druską', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    const res = await request(app).patch('/api/settings').send({ theme: 'dark' }).expect(200);
    expect(res.body.pin_hash).toBeUndefined();
    expect(res.body.pin_salt).toBeUndefined();
    expect(res.body.has_pin).toBe(true);
    expect(res.body.theme).toBe('dark');
  });

  // UNC kelią (\\nas\kopijos) programa pati siūlo rinktis per `backup:pick`
  // („Tinklas") — savininkas prie savo kompiuterio (loopback) jį nustatyti
  // gali. Tinklo klientui tas pats kelias per VACUUM INTO (core/backup.ts)
  // išneštų visą bazę su PIN maiša į svetimą serverį, tad jam draudžiama.
  it('loopback klientas gali nustatyti UNC kopijų kelią', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    const res = await request(app)
      .patch('/api/settings')
      .send({ backup_dir: '\\\\nas\\kopijos' })
      .expect(200);
    expect(res.body.backup_dir).toBe('\\\\nas\\kopijos');
  });

  it('tinklo klientas negali nustatyti UNC kopijų kelio — 400 remote_backup_dir', async () => {
    const { app, settings, clock } = aplinka({ trusted: false, pin: '1234' });
    const slapukas = signSession(
      sessionKey(settings.getAll().pin_hash!, settings.getAll().session_secret ?? ''),
      clock.now().getTime() + 1000,
    );
    const res = await request(app)
      .patch('/api/settings')
      .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
      .send({ backup_dir: '\\\\nas\\kopijos' })
      .expect(400);
    expect(res.body.error.code).toBe('remote_backup_dir');
    expect(settings.getAll().backup_dir).toBe('');
  });

  it('tinklo klientas gali nustatyti vietinį kopijų kelią', async () => {
    const { app, settings, clock } = aplinka({ trusted: false, pin: '1234' });
    const slapukas = signSession(
      sessionKey(settings.getAll().pin_hash!, settings.getAll().session_secret ?? ''),
      clock.now().getTime() + 1000,
    );
    const res = await request(app)
      .patch('/api/settings')
      .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
      .send({ backup_dir: 'C:\\Kopijos' })
      .expect(200);
    expect(res.body.backup_dir).toBe('C:\\Kopijos');
  });

  it('netinkamo formato PIN atmetamas su kitu kodu nei neteisingas PIN prisijungiant', async () => {
    const { app } = aplinka({ trusted: true, pin: '1234' });
    const res = await request(app).put('/api/pin').send({ pin: '12' }).expect(400);
    // Skirtingas kodas nuo prisijungimo 401 — formatas, ne slaptas
    // spėjimas.
    expect(res.body.error.code).toBe('invalid_pin_format');
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

  // Radinys: planšetė su galiojančiu slapuku (tinklo klientas, ne loopback)
  // anksčiau galėjo pakeisti PIN nežinodama seno — taip pavogtas įrenginys
  // išmesdavo savininką. Loopback (nustatymų langas prie paties kompiuterio)
  // šios patikros netaiko sąmoningai — žr. `pinRouter` komentarą.
  describe('tinklo klientas keičia PIN', () => {
    function tinkloKlientas(env: ReturnType<typeof aplinka>) {
      const slapukas = signSession(
        sessionKey(env.settings.getAll().pin_hash!, env.settings.getAll().session_secret ?? ''),
        env.clock.now().getTime() + 1000,
      );
      env.trusted.value = false;
      return slapukas;
    }

    it('be current_pin gauna 401 invalid_pin', async () => {
      const env = aplinka({ trusted: true, pin: '1234' });
      const slapukas = tinkloKlientas(env);
      const senaMaisa = env.settings.getAll().pin_hash;
      const res = await request(env.app)
        .put('/api/pin')
        .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
        .send({ pin: '5678' })
        .expect(401);
      expect(res.body.error.code).toBe('invalid_pin');
      // Nepavykus, senas PIN lieka galioti.
      expect(env.settings.getAll().pin_hash).toBe(senaMaisa);
    });

    it('su teisingu current_pin PIN pakeičiamas', async () => {
      const env = aplinka({ trusted: true, pin: '1234' });
      const slapukas = tinkloKlientas(env);
      const senaMaisa = env.settings.getAll().pin_hash;
      await request(env.app)
        .put('/api/pin')
        .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
        .send({ pin: '5678', current_pin: '1234' })
        .expect(204);
      expect(env.settings.getAll().pin_hash).not.toBe(senaMaisa);
    });

    it('su neteisingu current_pin gauna 401, o po penkių bandymų — 429', async () => {
      const env = aplinka({ trusted: true, pin: '1234' });
      const slapukas = tinkloKlientas(env);
      for (let i = 0; i < 5; i += 1) {
        await request(env.app)
          .put('/api/pin')
          .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
          .send({ pin: '5678', current_pin: '0000' })
          .expect(401);
      }
      const res = await request(env.app)
        .put('/api/pin')
        .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
        .send({ pin: '5678', current_pin: '1234' })
        .expect(429);
      expect(res.body.error.code).toBe('too_many_attempts');
    });

    it('be current_pin negali pašalinti PIN nuotoliniu būdu', async () => {
      const env = aplinka({ trusted: true, pin: '1234' });
      const slapukas = tinkloKlientas(env);
      await request(env.app)
        .put('/api/pin')
        .set('Cookie', `${SESSION_COOKIE}=${slapukas}`)
        .send({ pin: null })
        .expect(401);
      expect(env.settings.getAll().pin_hash).not.toBeNull();
    });
  });
});

// Kiekvienas kitas šio failo testas injektuoja savo `trustRequest`, tad
// niekas iki šiol nepaleido produkcinės numatytosios šakos iš `app.ts`.
// Šis blokas ją paleidžia tikrai — jei numatytoji taisyklė būtų apkeista
// į `() => true`, abu testai nukristų.
describe('numatytasis trustRequest (produkcijos šaka, be injekcijos)', () => {
  it('loopback užklausa praeina be trustRequest perdavimo, kai PIN nustatytas', async () => {
    const db = openDb(':memory:');
    const settings = createSettingsStore(db);
    const { hash, salt } = hashPin('1234');
    settings.patch({ pin_hash: hash, pin_salt: salt, lan: true });
    const clock = fixedClock('2026-09-02T10:00:00.000Z');
    // trustRequest SĄMONINGAI neperduodamas — tikriname `defaultTrustRequest`,
    // ne testų pakaitalą. Supertest jungiasi per 127.0.0.1, tad tai tikra
    // loopback užklausa.
    const app = createApp({
      tasks: createTaskStore(db, clock),
      settings,
      events: createEventHub(),
      clock,
    });
    await request(app).get('/api/tasks').expect(200);
  });

  it('numatytoji taisyklė atmeta ne-loopback adresą', () => {
    const req = { socket: { remoteAddress: '192.168.1.50' } } as Parameters<typeof defaultTrustRequest>[0];
    expect(defaultTrustRequest(req)).toBe(false);
  });

  it('numatytoji taisyklė praleidžia loopback adresą', () => {
    const req = { socket: { remoteAddress: '127.0.0.1' } } as Parameters<typeof defaultTrustRequest>[0];
    expect(defaultTrustRequest(req)).toBe(true);
  });
});

it('sesijos raktas priklauso nuo paslapties, ne vien nuo PIN maišos', () => {
  const maisa = 'a'.repeat(64);
  expect(sessionKey(maisa, 'paslaptis-a')).not.toBe(sessionKey(maisa, 'paslaptis-b'));
});

it('tas pats raktas su ta pačia paslaptimi nesikeičia', () => {
  const maisa = 'a'.repeat(64);
  expect(sessionKey(maisa, 'paslaptis-a')).toBe(sessionKey(maisa, 'paslaptis-a'));
});
