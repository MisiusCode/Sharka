import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from '../../core/i18n.js';
import type { PublicSettings, SettingsMap } from '../../core/settings.js';
import * as api from '../api.js';
import { errorText } from '../errorText.js';
import '../theme.css';
import { localeOf } from '../useLocale.js';
import { applyTheme } from '../useTheme.js';
import { SettingsView } from './SettingsView.js';

const lanUrls = JSON.parse(
  new URLSearchParams(window.location.search).get('lan') ?? '[]',
) as string[];

// Be šito nepavykęs nustatymų užkrovimas paliktų viršutinio lygio `await`
// neišspręstą: langas liktų tuščias baltas, o klaidos juosta žemiau dengia
// tik išsaugojimą, ne pradinį krovimą.
let initialSettings: PublicSettings | null = null;
let loadError: string | null = null;
try {
  initialSettings = await api.fetchSettings();
  applyTheme(initialSettings.theme);
} catch (err) {
  // `initialSettings` čia visada `null` (dar nepasisekė gauti), tad
  // `localeOf` grąžina tą pačią atsarginę 'lt' reikšmę, kaip ir žemiau
  // esantis atvaizdavimas, kuris šį tekstą rodo.
  loadError = errorText(localeOf(initialSettings), err);
}

function Screen({ loaded }: { loaded: PublicSettings }) {
  const [settings, setSettings] = useState<PublicSettings>(loaded);
  const [error, setError] = useState<string | null>(null);
  // `settings` yra būsena, tad po kiekvieno `setSettings` (taip pat ir po
  // kalbos pakeitimo, kai serveris grąžina naują `resolved_locale`) ši
  // reikšmė persiskaičiuoja savaime — atskiro perkrovimo nereikia.
  const locale = localeOf(settings);

  // `index.html` <title>Nustatymai</title> yra tik pradinė reikšmė, kol
  // puslapis kraunasi — Electron `BrowserWindow` `title` parinktis
  // (`windows.ts` `openSettings`) IGNORUOJAMA, nes puslapis turi savo
  // <title>, tad realų vardą (ir kalbos keitimą gyvai, žr. komentarą prie
  // `locale` aukščiau) reikia rašyti čia. `lang` — dėl rašybos tikrinimo ir
  // ekrano skaitytuvų.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t(locale, 'settings.title');
  }, [locale]);

  // `SettingsView` valdomi laukai vaizduoja `settings` prop'ą, o ne savo
  // vidinę būseną, tad jei `patchSettings` atmestas (pvz., serveris grąžina
  // 400 dėl reikšmės, kurios klientas nepatikrino), `settings` tiesiog
  // nepasikeičia ir laukas grįžta prie senos reikšmės — bet be klaidos
  // pranešimo naudotojas nesuprastų, kodėl pakeitimas „neįsirašė“.
  const onChange = (values: Partial<SettingsMap>): void => {
    setError(null);
    api.patchSettings(values)
      .then((s) => { setSettings(s); applyTheme(s.theme); })
      .catch((err: unknown) => { setError(errorText(locale, err)); });
  };

  // Skirtingai nuo `onChange`: `/api/pin` negrąžina naujos `settings`
  // (žr. `routes/auth.ts` — 204 be turinio), tad po išsaugojimo reikia
  // atskiro `fetchSettings()`, kad `has_pin` (ir `lan`, kurį pašalinimas
  // priverstinai išjungia serveryje) atsinaujintų ekrane iškart, o ne tik
  // kitą kartą atidarius langą. Klaidą (pvz., netinkamo formato PIN) ir
  // parodome, ir metame toliau — `SettingsView` pagal tai sprendžia, ar
  // išvalyti juodraštį.
  const onSetPin = (pin: string | null): Promise<void> => {
    setError(null);
    return api.setPin(pin)
      .then(() => api.fetchSettings())
      .then((s) => { setSettings(s); applyTheme(s.theme); })
      .catch((err: unknown) => {
        setError(errorText(locale, err));
        throw err;
      });
  };

  return (
    <>
      {error !== null && <div className="klaidos-juosta">{error}</div>}
      <SettingsView settings={settings} lanUrls={lanUrls} locale={locale} onChange={onChange} onSetPin={onSetPin} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {initialSettings === null ? (
      // `initialSettings` yra `null` tik kai nustatymų parsisiųsti nepavyko —
      // tai vienintelis šio lango atvejis, kai kalbos sužinoti neįmanoma,
      // tad `localeOf(null)` grąžina atsarginę `'lt'`.
      <div className="klaidos-juosta">
        {t(localeOf(initialSettings), 'settings.loadFailed', {
          error: loadError ?? t(localeOf(initialSettings), 'settings.unknownError'),
        })}
      </div>
    ) : (
      <Screen loaded={initialSettings} />
    )}
  </StrictMode>,
);
