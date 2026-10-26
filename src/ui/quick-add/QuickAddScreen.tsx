import { useCallback, useEffect, useState } from 'react';
import { formatLocalDate } from '../../core/datetime.js';
import { t } from '../../core/i18n.js';
import type { PublicSettings } from '../../core/settings.js';
import type { Task, TaskInput } from '../../core/types.js';
import * as api from '../api.js';
import { GroupedList } from '../components/GroupedList.js';
import { QuickAdd } from '../components/QuickAdd.js';
import { errorText } from '../errorText.js';
import { localeOf } from '../useLocale.js';
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
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locale = localeOf(settings);

  // Kalba čia žinoma tik po asinchroninio nustatymų užkrovimo (žr. efektą
  // žemiau), tad `index.html` statinis <title>Nauja užduotis</title> (pradinė
  // reikšmė, kol puslapis kraunasi) perrašomas ČIA, o ne modulio lygyje kaip
  // alarm/digest — `lang` atributas nėra kosmetika, nuo jo priklauso rašybos
  // tikrinimas pavadinimo lauke ir ekrano skaitytuvai.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t(locale, 'quickAdd.label');
  }, [locale]);

  const reload = useCallback(async () => {
    try {
      setTasks(await api.fetchTasks());
    } catch (err) {
      setError(errorText(locale, err));
    }
    // `locale` priklausomybėse dėl tos pačios priežasties, kaip Board.tsx
    // `reload`: be jo klaida amžinai liktų pirmojo atvaizdavimo kalba.
  }, [locale]);

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
      setError(errorText(locale, err));
    }
  };

  const create = (input: TaskInput): void => { void run(() => api.createTask(input), true); };

  return (
    <div className="langelis">
      {error !== null && <div className="klaidos-juosta">{error}</div>}

      <QuickAdd now={now} locale={locale} onCreate={create} autoFocus />

      <div className="langelio-sarasas">
        <GroupedList
          tasks={tasks}
          grouping={settings?.grouping === 'status' ? 'status' : 'date'}
          today={formatLocalDate(now)}
          now={now}
          locale={locale}
          onToggleDone={(id, done) => void run(() => api.patchTask(id, { status: done ? 'done' : 'todo' }))}
          onDelete={(id) => void run(() => api.deleteTask(id))}
          onRename={(id, title) => void run(() => api.patchTask(id, { title }))}
          onReschedule={(id, due) => void run(() => api.patchTask(id, due))}
        />
      </div>

      <button type="button" className="atidaryti-lenta" onClick={onOpenBoard}>
        {t(locale, 'tray.openBoard')}
      </button>
    </div>
  );
}
