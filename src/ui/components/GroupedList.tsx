import { bucketLabel, DATE_BUCKETS, dateBucketOf, sortTasks } from '../../core/buckets.js';
import { statusLabel, t, type Locale } from '../../core/i18n.js';
import type { Status, Task } from '../../core/types.js';
import { TaskCard } from './TaskCard.js';
import type { DuePatch } from './DueEditor.js';

const STATUSES: Status[] = ['todo', 'doing', 'done'];

export interface GroupedListProps {
  tasks: Task[];
  grouping: 'date' | 'status';
  today: string;
  locale: Locale;
  // `now` ir `onReschedule` yra PRIVALOMI, nes tokie jie yra ir TaskCard'e.
  // Neprivalomi su tyliais numatytaisiais reikštų, kad pamiršus onReschedule
  // naudotojo datos pakeitimas dingtų tyliai, o `new Date()` numatytasis
  // sugriautų gyvojo laikrodžio logiką.
  now: Date;
  onToggleDone(id: string, done: boolean): void;
  onDelete(id: string): void;
  onRename(id: string, title: string): void;
  onReschedule(id: string, due: DuePatch): void;
}

export function GroupedList({ tasks, grouping, today, now, locale, onToggleDone, onDelete, onRename, onReschedule }: GroupedListProps) {
  const sorted = sortTasks(tasks);

  const sections =
    grouping === 'status'
      ? STATUSES.map((s) => ({
          key: s,
          label: statusLabel(locale, s),
          tasks: sorted.filter((task) => task.status === s),
        }))
      : DATE_BUCKETS.map((b) => ({
          key: b,
          label: bucketLabel(locale, b),
          tasks: sorted.filter((task) => dateBucketOf(task, today) === b),
        }));

  const filled = sections.filter((s) => s.tasks.length > 0);
  if (filled.length === 0) return <p className="tuscia">{t(locale, 'list.empty')}</p>;

  return (
    <div className="sarasas">
      {filled.map((section) => (
        <section key={section.key}>
          <h3>{section.label}</h3>
          {section.tasks.map((task) => (
            <TaskCard key={task.id} task={task} today={today} now={now} locale={locale} onToggleDone={onToggleDone} onDelete={onDelete} onRename={onRename} onReschedule={onReschedule} />
          ))}
        </section>
      ))}
    </div>
  );
}
