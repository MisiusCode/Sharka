import { Router } from 'express';
import type { Clock } from '../../core/clock.js';
import { hashPin, isValidPin, verifyPin } from '../../core/pin.js';
import type { SettingsStore } from './settings.js';
import { ApiError } from './tasks.js';
import { SESSION_COOKIE, SESSION_TRUKME_MS, sessionKey, signSession, type Throttle } from '../auth.js';

export interface AuthDeps {
  settings: SettingsStore;
  clock: Clock;
  throttle: Throttle;
}

export function sessionRouter(deps: AuthDeps): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const adresas = req.socket.remoteAddress ?? 'nezinomas';
    if (deps.throttle.blocked(adresas)) {
      throw new ApiError(429, 'too_many_attempts', 'Per daug bandymų. Pabandyk po 15 minučių');
    }

    const { pin } = (req.body ?? {}) as { pin?: unknown };
    const { pin_hash, pin_salt } = deps.settings.getAll();
    const tinka = typeof pin === 'string'
      && pin_hash !== null
      && pin_salt !== null
      && verifyPin(pin, { hash: pin_hash, salt: pin_salt });

    if (!tinka) {
      deps.throttle.fail(adresas);
      throw new ApiError(401, 'invalid_pin', 'Neteisingas PIN');
    }

    deps.throttle.reset(adresas);
    const galiojaIki = deps.clock.now().getTime() + SESSION_TRUKME_MS;
    res.cookie(SESSION_COOKIE, signSession(sessionKey(pin_hash), galiojaIki), {
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
  // negali netyčia apeiti slėpimo taisyklės (spec §4.3).
  router.put('/', (req, res) => {
    const { pin } = (req.body ?? {}) as { pin?: unknown };

    if (pin === null) {
      // Pašalinus PIN tinklo prieiga privalo nukristi kartu — kitaip liktų
      // atviras serveris be jokio užrakto.
      deps.settings.patch({ pin_hash: null, pin_salt: null, lan: false });
      res.status(204).end();
      return;
    }

    if (!isValidPin(pin)) {
      // Skirtingas kodas nuo prisijungimo klaidos (spec §5.3: kodų sąrašas
      // yra sutartis) — čia PIN yra netinkamo formato, ne tiesiog neteisingas.
      throw new ApiError(400, 'invalid_pin_format', 'PIN turi būti 4–8 skaitmenys');
    }

    const { hash, salt } = hashPin(pin as string);
    deps.settings.patch({ pin_hash: hash, pin_salt: salt });
    res.status(204).end();
  });

  return router;
}
