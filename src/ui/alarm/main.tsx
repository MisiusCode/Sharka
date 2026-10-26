import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from '../../core/i18n.js';
import type { Task } from '../../core/types.js';
import * as api from '../api.js';
import '../theme.css';
import { localeOf } from '../useLocale.js';
import { applyTheme } from '../useTheme.js';
import { AlarmView } from './AlarmView.js';

const params = new URLSearchParams(window.location.search);
const id = params.get('id')!;
const lateMinutes = Number(params.get('late') ?? '0');
const soundOn = params.get('sound') === '1';

const [tasks, settings] = await Promise.all([api.fetchTasks(), api.fetchSettings()]);
applyTheme(settings.theme);

const locale = localeOf(settings);
// `index.html` <title> lieka statinis „Priminimas" tik kaip pradinė reikšmė,
// kol puslapis kraunasi (be jos langas blykstelėtų be vardo) — Electron
// BrowserWindow neturi savo `title` šiam langui (žr. reminderWindows.ts), tad
// realų (ir, anglų kalbai, teisingą) vardą bei `lang` atributą (rašybos
// tikrinimui ir ekrano skaitytuvams) nustatome čia, kai kalba jau žinoma.
document.documentElement.lang = locale;
document.title = t(locale, 'alarm.title');

const task = tasks.find((uzd: Task) => uzd.id === id);
if (task === undefined) {
  window.close();
} else {
  const close = (): void => { window.close(); };

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AlarmView
        task={task}
        lateMinutes={lateMinutes}
        soundOn={soundOn}
        locale={locale}
        onDone={() => void api.patchTask(id, { status: 'done' }).then(close)}
        onSnooze={() => void api.snoozeTask(id, 10).then(close)}
        onDismiss={close}
      />
    </StrictMode>,
  );
}
