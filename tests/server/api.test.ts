import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { fixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { createSettingsStore } from '../../src/core/settings.js';
import { createTaskStore } from '../../src/core/tasks.js';
import { createEventHub } from '../../src/server/events.js';
import { createApp } from '../../src/server/app.js';

let app: ReturnType<typeof createApp>;
let events: ReturnType<typeof createEventHub>;
let broadcasts: string[];

beforeEach(() => {
  const db = openDb(':memory:');
  events = createEventHub();
  broadcasts = [];
  const spy = { ...events, broadcast: (t: string) => { broadcasts.push(t); } };
  app = createApp({
    tasks: createTaskStore(db, fixedClock('2026-08-14T10:00:00')),
    settings: createSettingsStore(db),
    events: spy,
    clock: fixedClock('2026-09-02T10:00:00.000Z'),
  });
});

describe('POST /api/tasks', () => {
  it('sukuria užduotį ir praneša apie pokytį', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'Nupirkti pieną' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Nupirkti pieną');
    expect(res.body.due_at).toBeNull();
    expect(broadcasts).toEqual(['tasks-changed']);
  });

  it('atmeta tuščią pavadinimą su 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_title');
    expect(broadcasts).toEqual([]);
  });

  it('atmeta netinkamą prioritetą su 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'X', priority: 7 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_priority');
  });

  it('atmeta netinkamą kartojimą su 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'X', repeat: 'd:3' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_repeat');
  });

  it('priima teisingą kartojimą', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'X', repeat: 'w:2' });
    expect(res.status).toBe(201);
    expect(res.body.repeat).toBe('w:2');
  });

  it('be kūno ir be JSON antraštės grąžina 400, o ne 500', async () => {
    const res = await request(app).post('/api/tasks');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_title');
  });
});

describe('GET /api/tasks', () => {
  it('grąžina visas užduotis', async () => {
    await request(app).post('/api/tasks').send({ title: 'A' });
    await request(app).post('/api/tasks').send({ title: 'B' });
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.map((t: { title: string }) => t.title).sort()).toEqual(['A', 'B']);
  });

  it('svetimas Host atmetamas 403, net jei užklausa iš loopback', async () => {
    const res = await request(app).get('/api/tasks').set('Host', 'piktas.lt').expect(403);
    expect(res.body.error.code).toBe('forbidden_host');
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('keičia būseną ir praneša', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A' });
    broadcasts.length = 0;
    const res = await request(app).patch(`/api/tasks/${created.body.id}`).send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completed_at).not.toBeNull();
    expect(broadcasts).toEqual(['tasks-changed']);
  });

  it('nežinomam id grąžina 404', async () => {
    const res = await request(app).patch('/api/tasks/nėra').send({ status: 'done' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('atmeta netinkamą būseną', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A' });
    const res = await request(app).patch(`/api/tasks/${created.body.id}`).send({ status: 'skraidymas' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_status');
  });

  it('patina repeat lauką ir jis realiai išsaugomas', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A', due_at: '2026-08-11' });
    const res = await request(app).patch(`/api/tasks/${created.body.id}`).send({ repeat: 'w:2' });
    expect(res.status).toBe(200);
    expect(res.body.repeat).toBe('w:2');
    expect(res.body.due_at).toBe('2026-08-18');
  });

  it('atmeta netinkamą kartojimą per PATCH su 400', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A' });
    const res = await request(app).patch(`/api/tasks/${created.body.id}`).send({ repeat: 'd:3' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_repeat');
  });

  it('KRITINIS (1 radinys): Board.tsx tipo PATCH kūnas — repeat NEPAKITĘS + kitas laukas (priority) nepajudina due_at', async () => {
    // Tiksliai tokia JSON kūno forma, kokią Board.tsx onReschedule siunčia per
    // fetch (visos DueValue reikšmės vienu metu — žr. Board.tsx onReschedule,
    // digest/main.tsx, QuickAddScreen.tsx). Ankstesni core testai šio kelio
    // nepagavo, nes siuntė { repeat } vieną; api.test.ts modulis anksčiau visai
    // nemodeliavo šito pilno kūno per tikrą HTTP/JSON kelią.
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Išnešti šiukšles', due_at: '2026-08-11', repeat: 'w:2' });
    expect(created.body.due_at).toBe('2026-08-11');

    const res = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .send({
        due_at: created.body.due_at,
        due_has_time: created.body.due_has_time,
        remind_at: created.body.remind_at,
        priority: 1,
        repeat: created.body.repeat,
      });

    expect(res.status).toBe(200);
    expect(res.body.due_at).toBe('2026-08-11');
    expect(res.body.priority).toBe(1);
    expect(res.body.status).toBe('todo');
  });

  it('Board.tsx tipo PATCH kūnas: aiškiai pakeista data su nepakitusiu repeat laimi prieš peršokimą (1 radinys)', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Vaistai', due_at: '2026-08-11', repeat: 'w:2' });

    const res = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .send({
        due_at: '2026-08-15',
        due_has_time: false,
        remind_at: null,
        priority: created.body.priority,
        repeat: created.body.repeat,
      });

    expect(res.status).toBe(200);
    expect(res.body.due_at).toBe('2026-08-15');
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('ištrina ir grąžina 204, o antrą kartą 404', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A' });
    expect((await request(app).delete(`/api/tasks/${created.body.id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/tasks/${created.body.id}`)).status).toBe(404);
  });
});

describe('POST /api/tasks/:id/snooze', () => {
  it('perkelia priminimą', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'A', remind_at: '2026-08-14T10:00' });
    const res = await request(app).post(`/api/tasks/${created.body.id}/snooze`).send({ minutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.remind_at).toBe('2026-08-14T10:10');
  });

  it('be kūno grąžina 400, o ne 500', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'A' });
    const res = await request(app).post(`/api/tasks/${created.body.id}/snooze`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_minutes');
  });
});

describe('/api/settings', () => {
  it('grąžina numatytąsias ir priima dalinį atnaujinimą', async () => {
    expect((await request(app).get('/api/settings')).body.grouping).toBe('date');
    const res = await request(app).patch('/api/settings').send({ grouping: 'status' });
    expect(res.status).toBe(200);
    expect(res.body.grouping).toBe('status');
    expect(res.body.theme).toBe('system');
  });

  it('atmeta nežinomą raktą su 400', async () => {
    const res = await request(app).patch('/api/settings').send({ nesamas: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_setting');
  });

  // 2b dalies kalbos jungiklis rems šį ratą (PATCH įrašo, GET grąžina) — be
  // šio testo niekas jo netikrino (6 radinys).
  it('priima locale nustatymą ir grąžina jį per GET', async () => {
    const patchRes = await request(app).patch('/api/settings').send({ locale: 'en' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.locale).toBe('en');

    const getRes = await request(app).get('/api/settings');
    expect(getRes.status).toBe(200);
    expect(getRes.body.locale).toBe('en');
  });

  it('nustatymai grąžina išspręstą kalbą', async () => {
    const res = await request(app).get('/api/settings').expect(200);
    // Numatytoji `locale` yra `system`, o testinė aplinka sistemos kalbos
    // neperduoda, tad lieka anglų.
    expect(res.body.resolved_locale).toBe('en');
  });

  it('aiškiai pasirinkta kalba nugali sistemos kalbą', async () => {
    await request(app).patch('/api/settings').send({ locale: 'lt' }).expect(200);
    const res = await request(app).get('/api/settings').expect(200);
    expect(res.body.resolved_locale).toBe('lt');
  });
});

describe('nežinomas /api kelias', () => {
  it('grąžina 404 su JSON, o ne SPA index.html (200)', async () => {
    // Be `uiDir` SPA atsarginis maršrutas apskritai neregistruojamas, tad
    // ydra nepasireikštų — reikia tikro `uiDir` su `index.html`, kad
    // atkartotume aplinkybes, kuriomis SPA atsarginis maršrutas pagautų
    // nežinomą /api kelią.
    const dir = mkdtempSync(join(tmpdir(), 'sarka-ui-'));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    const db = openDb(':memory:');
    const uiApp = createApp({
      tasks: createTaskStore(db, fixedClock('2026-08-14T10:00:00')),
      settings: createSettingsStore(db),
      events: createEventHub(),
      clock: fixedClock('2026-09-02T10:00:00.000Z'),
      uiDir: dir,
    });

    const res = await request(uiApp).get('/api/nera-tokio');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('netinkamas JSON kūnas', () => {
  it('grąžina 400 su kodu invalid_json, o ne 500', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{netinkamas json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });
});

describe('createApp su uiDir', () => {
  it('nemeta klaidos registruojant statinės UI atsarginį maršrutą', () => {
    const db = openDb(':memory:');
    expect(() =>
      createApp({
        tasks: createTaskStore(db, fixedClock('2026-08-14T10:00:00')),
        settings: createSettingsStore(db),
        events: createEventHub(),
        clock: fixedClock('2026-09-02T10:00:00.000Z'),
        uiDir: tmpdir(),
      }),
    ).not.toThrow();
  });
});

describe('GET /settings/ (galutinė banga, 2 radinys)', () => {
  // Nustatymų ekranas atidaromas tik per tray meniu tos pačios mašinos,
  // kurioje sukasi programa (spec) — planšetėje jis vestų prie „Išsaugoti
  // PIN", kuris visada grąžintų klaidą, nes `setPin` iš tinklo neturi
  // `current_pin`. Tad tinklo klientui grąžinam 404 (ne 403 — nereikia
  // reklamuoti, kad puslapis egzistuoja), naudodami tą pačią `trustRequest`,
  // kurią jau naudoja /api grandis.
  function suUiDir(trusted: boolean) {
    const dir = mkdtempSync(join(tmpdir(), 'sarka-ui-'));
    writeFileSync(join(dir, 'index.html'), '<html>lenta</html>');
    mkdirSync(join(dir, 'settings'));
    writeFileSync(join(dir, 'settings', 'index.html'), '<html>nustatymai</html>');
    const db = openDb(':memory:');
    const uiApp = createApp({
      tasks: createTaskStore(db, fixedClock('2026-08-14T10:00:00')),
      settings: createSettingsStore(db),
      events: createEventHub(),
      clock: fixedClock('2026-09-02T10:00:00.000Z'),
      uiDir: dir,
      trustRequest: () => trusted,
    });
    return { uiApp, dir };
  }

  it('loopback (trustRequest: true) gauna nustatymų puslapį', async () => {
    const { uiApp, dir } = suUiDir(true);
    const res = await request(uiApp).get('/settings/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('nustatymai');
    rmSync(dir, { recursive: true, force: true });
  });

  it('ne-loopback (trustRequest: false) gauna 404, o ne puslapį', async () => {
    const { uiApp, dir } = suUiDir(false);
    const res = await request(uiApp).get('/settings/');
    expect(res.status).toBe(404);
    rmSync(dir, { recursive: true, force: true });
  });

  it('ne-loopback blokavimas neliečia lentos (/) ar /api', async () => {
    const { uiApp, dir } = suUiDir(false);
    const lenta = await request(uiApp).get('/');
    expect(lenta.status).toBe(200);
    expect(lenta.text).toContain('lenta');

    // Be PIN ir be pasitikėjimo /api grąžina 401 (žr. `app.ts`) — svarbu, kad
    // ji NEGRĄŽINTŲ 404, kurį duotų nustatymų blokavimo grandis, jei būtų
    // netyčia užkabinusi ir /api.
    const api = await request(uiApp).get('/api/tasks');
    expect(api.status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });
});
