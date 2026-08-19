import { BUCKET_LABELS, DATE_BUCKETS, dateBucketOf, sortTasks } from '../../core/buckets.js';
import type { Status, Task } from '../../core/types.js';
import { TaskCard } from './TaskCard.js';
import type { DuePatch } from './DueEditor.js';

const STATUS_LABELS: Record<Status, string> = {
  todo: 'Reikia padaryti',
  doing: 'Vykdoma',
  done: 'Atlikta',
};
const STATUSES: Status[] = ['todo', 'doing', 'done'];

export interface GroupedListProps {
  tasks: Task[];
  grouping: 'date' | 'status';
  today: string;
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

export function GroupedList({ tasks, grouping, today, now, onToggleDone, onDelete, onRename, onReschedule }: GroupedListProps) {
  const sorted = sortTasks(tasks);

  const sections =
    grouping === 'status'
      ? STATUSES.map((s) => ({
          key: s,
          label: STATUS_LABELS[s],
          tasks: sorted.filter((t) => t.status === s),
        }))
      : DATE_BUCKETS.map((b) => ({
          key: b,
          label: BUCKET_LABELS[b],
          tasks: sorted.filter((t) => dateBucketOf(t, today) === b),
        }));

  const filled = sections.filter((s) => s.tasks.length > 0);
  if (filled.length === 0) return <p className="tuscia">Užduočių nėra</p>;

  return (
    <div className="sarasas">
      {filled.map((section) => (
        <section key={section.key}>
          <h3>{section.label}</h3>
          {section.tasks.map((task) => (
            <TaskCard key={task.id} task={task} today={today} now={now} onToggleDone={onToggleDone} onDelete={onDelete} onRename={onRename} onReschedule={onReschedule} />
          ))}
        </section>
      ))}
    </div>
  );
}
