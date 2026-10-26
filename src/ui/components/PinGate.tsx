import { useState, type FormEvent } from 'react';
import { t, type Locale } from '../../core/i18n.js';
import * as api from '../api.js';
import { errorText } from '../errorText.js';

// Rodoma vietoj visos lentos, kai serveris atsako 401 'unauthorized' (žr.
// Board.tsx) — tablečiui be galiojančios sesijos tai vienintelis turinys,
// kurį jis mato. `login()` klaidos kodą (neteisingas PIN arba per daug
// bandymų) verčia `errorText` — serverio `message` čia jau tik atsarginė
// angliška reikšmė.
//
// `locale` ateina iš `browserLocale()` (žr. `ui/useLocale.ts`): nustatymų
// (taigi ir tikrosios `resolved_locale`) šis ekranas parsisiųsti negali,
// kol sesijos nėra.
export function PinGate({ onUnlocked, locale }: { onUnlocked(): void; locale: Locale }) {
  const [pin, setPin] = useState('');
  const [klaida, setKlaida] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      await api.login(pin);
      setPin('');
      onUnlocked();
    } catch (err) {
      setKlaida(errorText(locale, err));
    }
  };

  return (
    <form className="pin-ekranas" onSubmit={(e) => void submit(e)}>
      <h1>{t(locale, 'app.name')}</h1>
      <label>
        {t(locale, 'pin.label')}
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-label={t(locale, 'pin.label')}
          value={pin}
          onChange={(e) => { setPin(e.target.value); setKlaida(null); }}
        />
      </label>
      <button type="submit">{t(locale, 'pin.submit')}</button>
      {klaida !== null && <p className="klaida" role="alert">{klaida}</p>}
    </form>
  );
}
