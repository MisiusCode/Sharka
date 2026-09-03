import { useState } from 'react';
import { formatLithuanianDate, formatLocalDate } from '../../core/datetime.js';
import type { PublicSettings, SettingsMap } from '../../core/settings.js';
import { parseTimeInput } from '../../core/timeinput.js';
import { acceleratorFromEvent } from './hotkeyCapture.js';

export interface SettingsViewProps {
  settings: PublicSettings;
  lanUrls: string[];
  onChange(values: Partial<SettingsMap>): void;
}

export function SettingsView({ settings, lanUrls, onChange }: SettingsViewProps) {
  const [portChanged, setPortChanged] = useState(false);
  const [portDraft, setPortDraft] = useState(String(settings.port));
  const [timeDrafts, setTimeDrafts] = useState(settings.digest_times);
  const [dirDraft, setDirDraft] = useState(settings.backup_dir);
  // Nustatymų langas neturi bendro gyvo laikrodžio (žr. `useNow.ts` lentoje) —
  // jis atveriamas trumpam ir vien parodo, kada buvo paskutinė kopija, tad
  // vieno karto `new Date()` čionai pakanka „šių metų“ sprendimui.
  const today = formatLocalDate(new Date());

  const commitTime = (index: number): void => {
    const parsed = parseTimeInput(timeDrafts[index]);
    if (parsed === null) {
      setTimeDrafts(settings.digest_times);
      return;
    }
    const next = [...settings.digest_times];
    next[index] = parsed;
    onChange({ digest_times: next });
  };

  return (
    <div className="nustatymai">
      <h1>Nustatymai</h1>

      <label>
        Portas
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
      {portChanged && <p className="ispejimas">Portas įsigalios paleidus programą iš naujo</p>}

      <label>
        Karštasis klavišas
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
        Garsas
        <select
          value={settings.sound}
          onChange={(e) => onChange({ sound: e.target.value as SettingsMap['sound'] })}
        >
          <option value="always">Visada</option>
          <option value="alarms">Tik žadintuvams</option>
          <option value="off">Išjungta</option>
        </select>
      </label>

      <fieldset>
        <legend>Dienos apžvalga</legend>
        {timeDrafts.map((time, i) => (
          <input
            key={i}
            type="text"
            aria-label="Apžvalgos laikas"
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
        Tema
        <select
          value={settings.theme}
          onChange={(e) => onChange({ theme: e.target.value as SettingsMap['theme'] })}
        >
          <option value="system">Pagal sistemą</option>
          <option value="light">Šviesi</option>
          <option value="dark">Tamsi</option>
        </select>
      </label>

      <label className="jungiklis">
        <input
          type="checkbox"
          aria-label="Paleisti su Windows"
          checked={settings.autostart}
          onChange={(e) => onChange({ autostart: e.target.checked })}
        />
        Paleisti su Windows
      </label>

      <label>
        Kopijų aplankas
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
          Parinkti aplanką
        </button>
      )}
      <p className="ispejimas">
        Kopija šalia originalo apsaugo nuo sugadinto failo, bet ne nuo mirusio disko.
        Nurodyk OneDrive, Dropbox ar tinklo disko aplanką.
      </p>
      <p className="busena">
        {settings.backup_dir === ''
          ? // Tuščias aplankas reiškia kopijas VISAM LAIKUI išjungtas — tai
            // turi būti matoma net jei anksčiau (kol aplankas dar buvo
            // nurodytas) yra buvusi sėkminga kopija (žr. 4 radinį).
            'Atsarginės kopijos išjungtos — aplankas nenurodytas'
          : settings.last_backup_error !== null
            ? // Nesėkmės metu „kiek sena mano naujausia gera kopija" yra
              // vertingiausias faktas ekrane — jis neturi dingti (žr. 5 radinį).
              `Paskutinė kopija: ${settings.last_backup !== null ? formatLithuanianDate(settings.last_backup, today) : 'dar nedaryta'} · ` +
              `paskutinis bandymas nepavyko — ${settings.last_backup_error}`
            : settings.last_backup !== null
              ? `Paskutinė kopija: ${formatLithuanianDate(settings.last_backup, today)}`
              : 'Paskutinė kopija: dar nedaryta'}
      </p>

      <section className="adresai">
        <h2>Planšetei</h2>
        {lanUrls.length === 0 ? (
          <p>Tinklo adresų nerasta</p>
        ) : (
          lanUrls.map((url) => <p key={url}><code>{url}</code></p>)
        )}
      </section>
    </div>
  );
}
