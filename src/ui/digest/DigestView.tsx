import { formatLocalDate } from '../../core/datetime.js';
import { t, type Locale } from '../../core/i18n.js';
import type { Task } from '../../core/types.js';
import type { DuePatch } from '../components/DueEditor.js';
import { TaskCard } from '../components/TaskCard.js';

export interface DigestViewProps {
  tasks: Task[];
  now: Date;
  locale: Locale;
  onToggleDone(id: string, done: boolean): void;
  onDelete(id: string): void;
  onRename(id: string, title: string): void;
  onReschedule(id: string, due: DuePatch): void;
  onClose(): void;
}

export function DigestView({ tasks, now, locale, onClose, ...handlers }: DigestViewProps) {
  const today = formatLocalDate(now);

  return (
    <div className="apzvalga">
      <h1>{t(locale, 'digest.remaining', { count: tasks.length })}</h1>

      <div className="apzvalgos-sarasas">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} today={today} now={now} locale={locale} {...handlers} />
        ))}
      </div>

      <button type="button" onClick={onClose}>{t(locale, 'common.close')}</button>
    </div>
  );
}
