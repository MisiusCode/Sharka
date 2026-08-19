import { useCallback, useEffect, useState } from 'react';
import { formatLocalDate } from '../../core/datetime.js';
import type { SettingsMap } from '../../core/settings.js';
import type { Task, TaskInput } from '../../core/types.js';
import * as api from '../api.js';
import { GroupedList } from '../components/GroupedList.js';
import { QuickAdd } from '../components/QuickAdd.js';
import { applyTheme } from '../useTheme.js';
import { useNow } from '../useNow.js';

export interface QuickAddScreenProps {
  now: Date;
  onOpenBoard(): void;
  onClose(): void;
}

export function QuickAddScreen({ now: initialNow, onOpenBoard, onClose }: QuickAddScreenProps) {
  // Bendras laikrodis (žr. `useNow.ts`). Langelis — tray aplikacija, skirta
  // veikti savaitėmis, tad jo laikrodis negali sustoti paleidimo akimirkoje:
  // po vidurnakčio „Šiandien" žymė ir toliau rašytų vakarykštę datą.
  const now = useNow(initialNow);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTasks(await api.fetchTasks());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    void api.fetchSettings().then((s) => { setSettings(s); applyTheme(s.theme); }).catch(() => {});
    return api.subscribeToChanges(() => { void reload(); }, () => {});
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (action: () => Promise<unknown>, thenClose = false): Promise<void> => {
    try {
      setError(null);
      await action();
      await reload();
      if (thenClose) onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const create = (input: TaskInput): void => { void run(() => api.createTask(input), true); };

  return (
    <div className="langelis">
      {error !== null && <div className="klaidos-juosta">{error}</div>}

      <QuickAdd now={now} onCreate={create} autoFocus />

      <div className="langelio-sarasas">
        <GroupedList
          tasks={tasks}
          grouping={settings?.grouping === 'status' ? 'status' : 'date'}
          today={formatLocalDate(now)}
          now={now}
          onToggleDone={(id, done) => void run(() => api.patchTask(id, { status: done ? 'done' : 'todo' }))}
          onDelete={(id) => void run(() => api.deleteTask(id))}
          onRename={(id, title) => void run(() => api.patchTask(id, { title }))}
          onReschedule={(id, due) => void run(() => api.patchTask(id, due))}
        />
      </div>

      <button type="button" className="atidaryti-lenta" onClick={onOpenBoard}>
        Atidaryti lentą
      </button>
    </div>
  );
}
