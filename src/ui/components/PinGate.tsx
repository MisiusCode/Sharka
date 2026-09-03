import { useState, type FormEvent } from 'react';
import * as api from '../api.js';

// Rodoma vietoj visos lentos, kai serveris atsako 401 'unauthorized' (žr.
// Board.tsx) — tablečiui be galiojančios sesijos tai vienintelis turinys,
// kurį jis mato. `login()` klaidos žinutė jau yra serverio lietuviška
// (neteisingas PIN arba per daug bandymų), tad ją rodome tiesiogiai, be
// atskiro atvejo tikrinimo.
export function PinGate({ onUnlocked }: { onUnlocked(): void }) {
  const [pin, setPin] = useState('');
  const [klaida, setKlaida] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      await api.login(pin);
      setPin('');
      onUnlocked();
    } catch (err) {
      setKlaida((err as Error).message);
    }
  };

  return (
    <form className="pin-ekranas" onSubmit={(e) => void submit(e)}>
      <h1>Šarka</h1>
      <label>
        PIN kodas
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-label="PIN kodas"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setKlaida(null); }}
        />
      </label>
      <button type="submit">Prisijungti</button>
      {klaida !== null && <p className="klaida" role="alert">{klaida}</p>}
    </form>
  );
}
