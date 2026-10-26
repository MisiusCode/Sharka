import { useState } from 'react';
import { formatDate, formatLocalDate, formatTime } from '../../core/datetime.js';
import type { Locale } from '../../core/i18n.js';
import { t } from '../../core/i18n.js';
import type { PublicSettings, SettingsMap } from '../../core/settings.js';
import { parseTimeInput } from '../../core/timeinput.js';
import { acceleratorFromEvent } from './hotkeyCapture.js';

export interface SettingsViewProps {
  settings: PublicSettings;
  lanUrls: string[];
  locale: Locale;
  onChange(values: Partial<SettingsMap>): void;
  // Grąžina Promise, o ne veikia kaip `onChange` (fire-and-forget): laukas
  // išsivalo tik pavykus, tad komponentas turi sulaukti rezultato, o klaidos
  // pranešimą (ir `has_pin`/`lan` atnaujinimą po pašalinimo) parodo kvietėjas
  // (`settings/main.tsx`), ne šis presentacinis komponentas.
  onSetPin(pin: string | null): Promise<void>;
}

export function SettingsView({ settings, lanUrls, locale, onChange, onSetPin }: SettingsViewProps) {
  const [portChanged, setPortChanged] = useState(false);
  const [portDraft, setPortDraft] = useState(String(settings.port));
  // Rodoma pagal kalbą (angliškai „3:30 PM"), saugoma visada 24 valandų —
  // `parseTimeInput` paverčia atgal.
  const [timeDrafts, setTimeDrafts] = useState(
    settings.digest_times.map((laikas) => formatTime(locale, laikas)),
  );
  const [dirDraft, setDirDraft] = useState(settings.backup_dir);
  const [pinDraft, setPinDraft] = useState('');
  // Nustatymų langas neturi bendro gyvo laikrodžio (žr. `useNow.ts` lentoje) —
  // jis atveriamas trumpam ir vien parodo, kada buvo paskutinė kopija, tad
  // vieno karto `new Date()` čionai pakanka „šių metų“ sprendimui.
  const today = formatLocalDate(new Date());

  const commitTime = (index: number): void => {
    const parsed = parseTimeInput(timeDrafts[index], locale);
    if (parsed === null) {
      setTimeDrafts(settings.digest_times.map((laikas) => formatTime(locale, laikas)));
      return;
    }
    const next = [...settings.digest_times];
    next[index] = parsed;
    onChange({ digest_times: next });
  };

  return (
    <div className="nustatymai">
      <h1>{t(locale, 'settings.title')}</h1>

      <label>
        {t(locale, 'settings.port')}
        {/* Juodraštis su išsaugojimu nuėjus nuo lauko — kaip ir apžvalgos
            laikuose. Rašant `18080` `onChange` kitaip išsiųstų penkis
            pakeitimus (1, 18, 180, 1808, 18080), o pasitraukus įpusėjus
            bazėje liktų dalinis portas, kuris įsigaliotų kitą paleidimą. */}
        <input
          type="number"
          value={portDraft}
          onChange={(e) => setPortDraft(e.target.value)}
          onBlur={() => {
            const port = Number(portDraft);
            if (Number.isInteger(port) && port >= 1 && port <= 65535) {
              if (port !== settings.port) {
                setPortChanged(true);
                onChange({ port });
              }
            } else {
              setPortDraft(String(settings.port));
            }
          }}
        />
      </label>
      {portChanged && <p className="ispejimas">{t(locale, 'settings.portRestart')}</p>}

      <label>
        {t(locale, 'settings.hotkey')}
        <input
          type="text"
          readOnly
          value={settings.hotkey}
          onKeyDown={(e) => {
            // `Tab`/`Shift+Tab` neturi būti sugaunami: naudotojas, patekęs į
            // šį lauką klaviatūra, turi galėti iš jo ir išeiti klaviatūra.
            // Be šio patikrinimo `acceleratorFromEvent` grąžintų "Shift+Tab"
            // kaip tinkamą kombinaciją (Tab nėra modifikatorius), tad
            // `preventDefault` žemiau užrakintų fokusą lauke abiem kryptimis.
            if (e.key === 'Tab') return;
            const acc = acceleratorFromEvent(e);
            if (acc !== null) {
              e.preventDefault();
              onChange({ hotkey: acc });
            }
          }}
        />
      </label>

      <label>
        {t(locale, 'settings.sound')}
        <select
          value={settings.sound}
          onChange={(e) => onChange({ sound: e.target.value as SettingsMap['sound'] })}
        >
          <option value="always">{t(locale, 'settings.soundAlways')}</option>
          <option value="alarms">{t(locale, 'settings.soundAlarms')}</option>
          <option value="off">{t(locale, 'settings.soundOff')}</option>
        </select>
      </label>

      <fieldset>
        <legend>{t(locale, 'settings.digest')}</legend>
        {timeDrafts.map((time, i) => (
          <input
            key={i}
            type="text"
            aria-label={t(locale, 'settings.digestTime')}
            value={time}
            onChange={(e) => {
              const next = [...timeDrafts];
              next[i] = e.target.value;
              setTimeDrafts(next);
            }}
            onBlur={() => commitTime(i)}
          />
        ))}
      </fieldset>

      <label>
        {t(locale, 'settings.theme')}
        <select
          value={settings.theme}
          onChange={(e) => onChange({ theme: e.target.value as SettingsMap['theme'] })}
        >
          <option value="system">{t(locale, 'settings.themeSystem')}</option>
          <option value="light">{t(locale, 'settings.themeLight')}</option>
          <option value="dark">{t(locale, 'settings.themeDark')}</option>
        </select>
      </label>

      <label>
        {t(locale, 'settings.language')}
        <select
          value={settings.locale}
          onChange={(e) => onChange({ locale: e.target.value as SettingsMap['locale'] })}
        >
          <option value="system">{t(locale, 'settings.langSystem')}</option>
          <option value="lt">Lietuvių</option>
          <option value="en">English</option>
        </select>
      </label>

      <label className="jungiklis">
        <input
          type="checkbox"
          aria-label={t(locale, 'settings.autostart')}
          checked={settings.autostart}
          onChange={(e) => onChange({ autostart: e.target.checked })}
        />
        {t(locale, 'settings.autostart')}
      </label>

      <label>
        {t(locale, 'settings.backupDir')}
        <input
          type="text"
          value={dirDraft}
          onChange={(e) => setDirDraft(e.target.value)}
          onBlur={() => {
            if (dirDraft !== settings.backup_dir) onChange({ backup_dir: dirDraft });
          }}
        />
      </label>
      {typeof window.sarka?.pickBackupDir === 'function' && (
        <button
          type="button"
          onClick={() => {
            void window.sarka?.pickBackupDir?.().then((kelias) => {
              if (kelias !== null && kelias !== undefined) {
                setDirDraft(kelias);
                onChange({ backup_dir: kelias });
              }
            });
          }}
        >
          {t(locale, 'settings.pickDir')}
        </button>
      )}
      <p className="ispejimas">{t(locale, 'settings.backupHint')}</p>
      <p className="busena">
        {settings.backup_dir === ''
          ? // Tuščias aplankas reiškia kopijas VISAM LAIKUI išjungtas — tai
            // turi būti matoma net jei anksčiau (kol aplankas dar buvo
            // nurodytas) yra buvusi sėkminga kopija (žr. 4 radinį).
            t(locale, 'settings.backupOff')
          : settings.last_backup_error !== null
            ? // Nesėkmės metu „kiek sena mano naujausia gera kopija" yra
              // vertingiausias faktas ekrane — jis neturi dingti (žr. 5 radinį).
              // `last_backup_error` pats lieka neverstas — tai operacinės
              // sistemos klaidos tekstas.
              `${t(locale, 'settings.backupLast', {
                when: settings.last_backup !== null
                  ? formatDate(locale, settings.last_backup, today)
                  : t(locale, 'settings.backupNever'),
              })} · ${t(locale, 'settings.backupFailed', { error: settings.last_backup_error })}`
            : settings.last_backup !== null
              ? t(locale, 'settings.backupLast', { when: formatDate(locale, settings.last_backup, today) })
              : t(locale, 'settings.backupLast', { when: t(locale, 'settings.backupNever') })}
      </p>

      <label>
        {t(locale, 'settings.newPin')}
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label={t(locale, 'settings.newPin')}
          value={pinDraft}
          onChange={(e) => setPinDraft(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          // Laukas išsivalo tik pavykus — jei serveris atmeta (pvz., PIN ne
          // 4–8 skaitmenys), naudotojas turi matyti, ką jis įvedė, kad galėtų
          // pataisyti, ne rašyti iš naujo. Klaidos pranešimą jau parodo
          // `onSetPin` savo pusėje (`settings/main.tsx`), tad čia tik
          // nutildome nepasigautą atmetimą.
          void onSetPin(pinDraft).then(() => setPinDraft('')).catch(() => {});
        }}
      >
        {t(locale, 'settings.savePin')}
      </button>
      {settings.has_pin && (
        <button type="button" onClick={() => { void onSetPin(null).catch(() => {}); }}>
          {t(locale, 'settings.removePin')}
        </button>
      )}

      <label className="jungiklis">
        <input
          type="checkbox"
          aria-label={t(locale, 'settings.lan')}
          checked={settings.lan}
          disabled={!settings.has_pin}
          onChange={(e) => onChange({ lan: e.target.checked })}
        />
        {t(locale, 'settings.lan')}
      </label>
      {!settings.has_pin && (
        <p className="busena">{t(locale, 'settings.lanNeedsPin')}</p>
      )}
      {settings.lan && (
        <p className="ispejimas">{t(locale, 'settings.lanRestart')}</p>
      )}

      {settings.lan && (
        <section className="adresai">
          <h2>{t(locale, 'settings.forTablet')}</h2>
          {lanUrls.length === 0 ? (
            <p>{t(locale, 'settings.noAddresses')}</p>
          ) : (
            lanUrls.map((url) => <p key={url}><code>{url}</code></p>)
          )}
        </section>
      )}
    </div>
  );
}
