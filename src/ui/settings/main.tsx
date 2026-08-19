import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SettingsMap } from '../../core/settings.js';
import * as api from '../api.js';
import '../theme.css';
import { applyTheme } from '../useTheme.js';
import { SettingsView } from './SettingsView.js';

const lanUrls = JSON.parse(
  new URLSearchParams(window.location.search).get('lan') ?? '[]',
) as string[];

// Be šito nepavykęs nustatymų užkrovimas paliktų viršutinio lygio `await`
// neišspręstą: langas liktų tuščias baltas, o klaidos juosta žemiau dengia
// tik išsaugojimą, ne pradinį krovimą.
let initialSettings: SettingsMap | null = null;
let loadError: string | null = null;
try {
  initialSettings = await api.fetchSettings();
  applyTheme(initialSettings.theme);
} catch (err) {
  loadError = (err as Error).message;
}

function Screen({ loaded }: { loaded: SettingsMap }) {
  const [settings, setSettings] = useState<SettingsMap>(loaded);
  const [error, setError] = useState<string | null>(null);

  // `SettingsView` valdomi laukai vaizduoja `settings` prop'ą, o ne savo
  // vidinę būseną, tad jei `patchSettings` atmestas (pvz., serveris grąžina
  // 400 dėl reikšmės, kurios klientas nepatikrino), `settings` tiesiog
  // nepasikeičia ir laukas grįžta prie senos reikšmės — bet be klaidos
  // pranešimo naudotojas nesuprastų, kodėl pakeitimas „neįsirašė“.
  const onChange = (values: Partial<SettingsMap>): void => {
    setError(null);
    api.patchSettings(values)
      .then((s) => { setSettings(s); applyTheme(s.theme); })
      .catch((err: unknown) => { setError((err as Error).message); });
  };

  return (
    <>
      {error !== null && <div className="klaidos-juosta">{error}</div>}
      <SettingsView settings={settings} lanUrls={lanUrls} onChange={onChange} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {initialSettings === null ? (
      <div className="klaidos-juosta">
        Nepavyko užkrauti nustatymų: {loadError ?? 'nežinoma klaida'}
      </div>
    ) : (
      <Screen loaded={initialSettings} />
    )}
  </StrictMode>,
);
