import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Task } from '../../core/types.js';
import * as api from '../api.js';
import '../theme.css';
import { applyTheme } from '../useTheme.js';
import { AlarmView } from './AlarmView.js';

const params = new URLSearchParams(window.location.search);
const id = params.get('id')!;
const lateMinutes = Number(params.get('late') ?? '0');
const soundOn = params.get('sound') === '1';

const [tasks, settings] = await Promise.all([api.fetchTasks(), api.fetchSettings()]);
applyTheme(settings.theme);

const task = tasks.find((t: Task) => t.id === id);
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
        onDone={() => void api.patchTask(id, { status: 'done' }).then(close)}
        onSnooze={() => void api.snoozeTask(id, 10).then(close)}
        onDismiss={close}
      />
    </StrictMode>,
  );
}
