import express from 'express';
import type { Clock } from '../core/clock.js';
import { hasPin } from '../core/settings.js';
import type { TaskStore } from '../core/tasks.js';
import { createThrottle, isLoopback, parseCookies, SESSION_COOKIE, sessionKey, verifySession } from './auth.js';
import type { EventHub } from './events.js';
import { isAllowedHost } from './hosts.js';
import { pinRouter, sessionRouter } from './routes/auth.js';
import { ApiError, tasksRouter } from './routes/tasks.js';
import { settingsRouter, type SettingsStore } from './routes/settings.js';

export interface AppDeps {
  tasks: TaskStore;
  settings: SettingsStore;
  events: EventHub;
  clock: Clock;
  uiDir?: string;
  // Testai perduoda savo tikrinimą: supertest visada jungiasi per loopback,
  // tad tinklo šaka kitaip nepasiekiama.
  trustRequest?: (req: express.Request) => boolean;
  // Reali sistemos kalba ateina tik iš Electron pusės (`main.ts`,
  // `app.getPreferredSystemLanguages()`); `server/start.ts` (plikas `tsx`) jos
  // neturi, tad be nurodytos reikšmės `resolveLocale('system', undefined)`
  // grąžina anglų — žr. `core/i18n.ts`.
  systemLocale?: string;
  // Įšvirkščiama dėl testų, lygiai kaip `trustRequest`: tikri tinklo adresai
  // kiekvienoje mašinoje kitokie, o testas turi tikrinti konkrečias reikšmes.
  localHosts?: () => string[];
}

// Numatytoji taisyklė, kada pasitikima užklausa be slapuko: tik loopback.
// Eksportuojama atskirai (o ne anoniminė funkcija viduje), kad testas galėtų
// tikrinti BŪTENT šią, produkcinę šaką — kiekvienas supertest atvejis
// injektuoja savo `trustRequest`, o Playwright kalba tik per `127.0.0.1`, tad
// be šio eksporto ši eilutė liktų visiškai netestuota.
export function defaultTrustRequest(req: express.Request): boolean {
  return isLoopback(req.socket.remoteAddress);
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();

  // PIRMA grandis, dar prieš kūno analizę: netikėto vardo užklausa neturi
  // nueiti net iki JSON parserio. Žr. `hosts.ts` — tai apsauga nuo DNS
  // rebinding, dėl kurios bet kuri svetainė kitaip perskaitytų visus duomenis
  // per loopback be jokio PIN.
  app.use((req, res, next) => {
    if (isAllowedHost(req.headers.host, deps.settings.getAll().lan, deps.localHosts)) {
      next();
      return;
    }
    // Naujas kodas (pridėti galima, pervadinti — ne). `error.*`
    // rakto nėra sąmoningai: teisėtas naudotojas šios klaidos nemato niekada.
    res.status(403).json({ error: { code: 'forbidden_host', message: 'Unexpected Host header' } });
  });

  app.use(express.json());

  const trustRequest = deps.trustRequest ?? defaultTrustRequest;

  // Viena instancija visai programos gyvavimo trukmei: /api/session per ją
  // seka bandymus vienam adresui, o vėliau perkūrus programą (pvz. testuose)
  // skaitiklis privalo pradėti nuo nulio, ne likti iš senos instancijos.
  const throttle = createThrottle(deps.clock);

  // PRIEŠ grandį: čia dar niekas neprisijungęs, tad prisijungimo maršrutas
  // privalo būti pasiekiamas be slapuko. Tai pasiekiama vien montavimo tvarka
  // — grandyje jokios išimties šiam keliui nėra (spec R4).
  // `trustRequest` čia `sessionRouter` funkcijai nereikalingas (prisijungimas
  // visada reikalauja PIN, nepriklausomai nuo adreso) — paduodamas tik todėl,
  // kad `AuthDeps` tipas bendras su `pinRouter`, kuriam jis būtinas.
  app.use('/api/session', sessionRouter({ settings: deps.settings, clock: deps.clock, throttle, trustRequest }));

  // Statika lieka atvira — joje nėra duomenų. Saugom tik /api.
  app.use('/api', (req, res, next) => {
    if (trustRequest(req)) { next(); return; }

    const visi = deps.settings.getAll();
    const slapukas = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    // `session_secret === null` reiškia „dar nėra ką tikrinti“, NE „tikrink
    // tuščiu raktu“ — tuščia eilutė būtų NUSPĖJAMA reikšmė: kopiją
    // (`core/backup.ts`) turintis žmogus `sessionKey(pin_hash, '')` paskaičiuotų
    // pats, nes abu dėmenys vieši, ir grąžintų mus lygiai į tą spragą, kurią
    // `session_secret` turėjo uždaryti. Tad be paslapties grandis atmeta
    // BESĄLYGIŠKAI, net jei atsineštas slapukas pasirašytas tuščiu raktu ir
    // formaliai galiotų. Sena bazė (PIN nustatytas prieš šį lauką) pasigydo
    // pati: `POST /api/session` (routes/auth.ts) sugeneruoja paslaptį per
    // pirmą prisijungimą, o `startServer` (server/index.ts) — jau paleidimo
    // metu, nelaukiant net to.
    if (
      hasPin(visi)
      && visi.session_secret !== null
      && verifySession(sessionKey(visi.pin_hash, visi.session_secret), slapukas, deps.clock.now().getTime())
    ) {
      next();
      return;
    }
    res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
  });

  // PO grandies: PIN keisti gali tik jau prisijungęs (arba loopback). Ta pati
  // `trustRequest` nuoroda, kurią naudoja pati grandis aukščiau — kitaip
  // loopback taisyklė galėtų tyliai išsiskirti tarp dviejų vietų.
  app.use('/api/pin', pinRouter({ settings: deps.settings, clock: deps.clock, throttle, trustRequest }));

  app.use('/api/tasks', tasksRouter(deps.tasks, deps.events));
  app.use(
    '/api/settings',
    settingsRouter(deps.settings, deps.systemLocale, trustRequest),
  );

  app.get('/api/events', (req, res) => {
    const unsubscribe = deps.events.subscribe(res);
    req.on('close', unsubscribe);
    res.on('error', unsubscribe);
  });

  // Registruojama PRIEŠ SPA atsarginį maršrutą: kitaip pastarasis pagautų
  // bet kokį nežinomą /api/... kelią ir grąžintų index.html su 200 — klientas,
  // tikėdamasis JSON, gautų analizavimo klaidą vietoj tvarkingo 404.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown API path' } });
  });

  if (deps.uiDir !== undefined) {
    // Nustatymų ekranas pagal dizainą skirtas TIK mašinai, kurioje sukasi
    // programa (atidaromas per tray meniu) — planšetėje iš tinklo jo
    // „Išsaugoti PIN“ vis tiek visada grąžintų klaidą, nes `ui/api.ts`
    // `setPin` nesiunčia `current_pin`, kurio reikalautų tinklo kelias. 404,
    // o ne 403: nereikia reklamuoti, kad toks puslapis apskritai egzistuoja.
    // Ta pati `trustRequest`, kuria remiasi /api grandis aukščiau — grandis
    // montuojama TIK ant `/settings`, kad neužkliudytų likusios statikos.
    app.use('/settings', (req, res, next) => {
      if (trustRequest(req)) { next(); return; }
      res.status(404).end();
    });
    app.use(express.static(deps.uiDir));
    // Express 5 naudoja path-to-regexp v8: plikas '*' yra nevalidus kelias ir
    // meta klaidą jau registruojant maršrutą. Pavadintas pakaitos simbolis.
    app.get('/*splat', (_req, res) => { res.sendFile('index.html', { root: deps.uiDir }); });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON body' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Internal error' } });
  });

  return app;
}
