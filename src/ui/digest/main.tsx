import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { dateBucketOf, sortTasks } from '../../core/buckets.js';
import { formatLocalDate } from '../../core/datetime.js';
import type { Task } from '../../core/types.js';
import * as api from '../api.js';
import '../theme.css';
import { applyTheme } from '../useTheme.js';
import { useNow } from '../useNow.js';
import { DigestView } from './DigestView.js';

const [initialTasks, settings] = await Promise.all([api.fetchTasks(), api.fetchSettings()]);
applyTheme(settings.theme);

// Langas gali stovėti atidarytas valandų valandas (10:00 priminimas iki
// 15:30 pakartojimo ir toliau), tad laikrodis turi gyvuoti savarankiškai —
// `useNow` (žr. Board/QuickAddScreen), o ne užšaldyta `new Date()` reikšmė.
function Screen() {
  const now = useNow(new Date());
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const reload = useCallback((): void => {
    void api.fetchTasks().then(setTasks).catch(() => {});
  }, []);

  // Langas ilgaamžis, tad turi girdėti ir pakeitimus, padarytus kitur — lentoje,
  // planšetėje ar žadintuvo lange. Be šito 15:30 apžvalga dažnai būtų tiesiog
  // į priekį iškelta pasenusi 10:00 apžvalga su neteisingu „Šiandienai liko N".
  useEffect(() => api.subscribeToChanges(reload, () => {}), [reload]);

  // Veiksmai keičia duomenis per HTTP API (niekada IPC ar SQLite tiesiogiai),
  // o po kiekvieno persikrauna sąrašas — kitaip pažymėjus užduotį atlikta ji
  // liktų rodoma, o antraštės skaičius neatsinaujintų, kol langas neuždaromas.
  const run = (action: () => Promise<unknown>): void => {
    void action().then(reload).catch(() => {});
  };

  const today = formatLocalDate(now);
  const todays = sortTasks(
    tasks.filter((t) => t.status !== 'done' && dateBucketOf(t, today) === 'today'),
  );

  return (
    <DigestView
      tasks={todays}
      now={now}
      onToggleDone={(id, done) => run(() => api.patchTask(id, { status: done ? 'done' : 'todo' }))}
      onDelete={(id) => run(() => api.deleteTask(id))}
      onRename={(id, title) => run(() => api.patchTask(id, { title }))}
      onReschedule={(id, due) => run(() => api.patchTask(id, due))}
      onClose={() => window.close()}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Screen />
  </StrictMode>,
);
