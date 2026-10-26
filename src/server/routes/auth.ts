import { randomBytes } from 'node:crypto';
import type express from 'express';
import { Router } from 'express';
import type { Clock } from '../../core/clock.js';
import { hashPin, isValidPin, verifyPin } from '../../core/pin.js';
import { hasPin } from '../../core/settings.js';
import type { SettingsStore } from './settings.js';
import { ApiError } from './tasks.js';
import { SESSION_COOKIE, SESSION_TRUKME_MS, sessionKey, signSession, type Throttle } from '../auth.js';

export interface AuthDeps {
  settings: SettingsStore;
  clock: Clock;
  throttle: Throttle;
  // Ta pati funkcija, kurią `app.ts` naudoja pačiai grandžiai (žr. jos
  // kintamąjį `trustRequest`) — NE nauja: kitaip loopback taisyklė galėtų
  // tyliai išsiskirti tarp dviejų vietų.
  trustRequest: (req: express.Request) => boolean;
}

export function sessionRouter(deps: AuthDeps): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const adresas = req.socket.remoteAddress ?? 'nezinomas';
    if (deps.throttle.blocked(adresas)) {
      throw new ApiError(429, 'too_many_attempts', 'Too many attempts. Try again in 15 minutes');
    }

    const { pin } = (req.body ?? {}) as { pin?: unknown };
    const { pin_hash, pin_salt, session_secret } = deps.settings.getAll();
    const tinka = typeof pin === 'string'
      && pin_hash !== null
      && pin_salt !== null
      && verifyPin(pin, { hash: pin_hash, salt: pin_salt });

    if (!tinka) {
      deps.throttle.fail(adresas);
      throw new ApiError(401, 'invalid_pin', 'Wrong PIN');
    }

    deps.throttle.reset(adresas);
    // Sena bazė (PIN nustatytas prieš `session_secret` lauko atsiradimą) jos
    // dar neturi — grandis (`app.ts`) tokiu atveju BET KOKĮ slapuką atmeta
    // besąlygiškai (žr. jos komentarą), tad be šio užpildymo naudotojas
    // niekada negalėtų prisijungti iš tinklo. Sugeneruojame čia ir pasirašom
    // JAU nauja reikšme, kad grąžinamas slapukas iškart galiotų.
    const paslaptis = session_secret ?? randomBytes(32).toString('hex');
    if (session_secret === null) {
      deps.settings.patch({ session_secret: paslaptis });
    }
    const galiojaIki = deps.clock.now().getTime() + SESSION_TRUKME_MS;
    res.cookie(SESSION_COOKIE, signSession(sessionKey(pin_hash, paslaptis), galiojaIki), {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: SESSION_TRUKME_MS,
    });
    res.status(200).json({ ok: true });
  });

  return router;
}

export function pinRouter(deps: AuthDeps): Router {
  const router = Router();

  // PUT, o ne PATCH /api/settings: taip nė vienas būsimas nustatymų raktas
  // negali netyčia apeiti slėpimo taisyklės.
  router.put('/', (req, res) => {
    const { pin, current_pin } = (req.body ?? {}) as { pin?: unknown; current_pin?: unknown };
    const visi = deps.settings.getAll();

    // Loopback (nustatymų langas pačioje mašinoje) praleidžiamas: ten sėdi
    // savininkas, ir reikalauti iš jo seno PIN reikštų užrakinti save pamiršus.
    // Tinklo klientui to leisti negalima — pavogta planšetė kitaip perimtų
    // programą (riba yra įrenginys, ne asmuo). Patikra galioja ir
    // PIN šalinimui (pin: null žemiau) — priešingu atveju pavogtas įrenginys
    // galėtų atjungti tinklo prieigą savininkui be jo žinios lygiai taip pat.
    if (!deps.trustRequest(req) && hasPin(visi)) {
      const adresas = req.socket.remoteAddress ?? '';
      if (deps.throttle.blocked(adresas)) {
        throw new ApiError(429, 'too_many_attempts', 'Too many attempts. Try again in 15 minutes');
      }
      // Klaida ta pati ir trūkstamam, ir neteisingam `current_pin` — sąmoningai,
      // kad atsakymas neatskleistų, ar užklausėjas apskritai bandė pateikti PIN.
      if (typeof current_pin !== 'string' || !verifyPin(current_pin, { hash: visi.pin_hash, salt: visi.pin_salt })) {
        deps.throttle.fail(adresas);
        throw new ApiError(401, 'invalid_pin', 'Wrong PIN');
      }
      deps.throttle.reset(adresas);
    }

    if (pin === null) {
      // Pašalinus PIN tinklo prieiga privalo nukristi kartu — kitaip liktų
      // atviras serveris be jokio užrakto.
      //
      // `session_secret` SĄMONINGAI nevalomas: be PIN `hasPin()` visada
      // grąžina `false`, tad grandis (`app.ts`) bet kokį slapuką atmeta
      // nepriklausomai nuo paslapties. Jei PIN vėliau nustatomas iš naujo,
      // esama paslaptis tiesiog panaudojama pakartotinai (žr. `pinRouter`
      // funkciją žemiau) — jos ištrynimas čia nieko neapsaugotų, tik
      // atjungtų senus slapukus be jokios saugumo naudos.
      deps.settings.patch({ pin_hash: null, pin_salt: null, lan: false });
      res.status(204).end();
      return;
    }

    if (!isValidPin(pin)) {
      // Skirtingas kodas nuo prisijungimo klaidos (kodų sąrašas yra
      // sutartis) — čia PIN yra netinkamo formato, ne tiesiog neteisingas.
      throw new ApiError(400, 'invalid_pin_format', 'The PIN must be 4–8 digits');
    }

    const { hash, salt } = hashPin(pin as string);
    const esami = deps.settings.getAll();
    // Paslaptis gimsta kartu su pirmuoju PIN ir toliau nesikeičia: jos keitimas
    // atjungtų įrenginius be jokios naudos — PIN pakeitimas tą jau daro.
    const secret = esami.session_secret ?? randomBytes(32).toString('hex');
    deps.settings.patch({ pin_hash: hash, pin_salt: salt, session_secret: secret });
    res.status(204).end();
  });

  return router;
}
