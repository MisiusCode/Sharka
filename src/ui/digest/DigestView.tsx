import { formatLocalDate } from '../../core/datetime.js';
import type { Task } from '../../core/types.js';
import type { DuePatch } from '../components/DueEditor.js';
import { TaskCard } from '../components/TaskCard.js';

export interface DigestViewProps {
  tasks: Task[];
  now: Date;
  onToggleDone(id: string, done: boolean): void;
  onDelete(id: string): void;
  onRename(id: string, title: string): void;
  onReschedule(id: string, due: DuePatch): void;
  onClose(): void;
}

export function DigestView({ tasks, now, onClose, ...handlers }: DigestViewProps) {
  const today = formatLocalDate(now);

  return (
    <div className="apzvalga">
      <h1>Šiandienai liko {tasks.length}</h1>

      <div className="apzvalgos-sarasas">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} today={today} now={now} {...handlers} />
        ))}
      </div>

      <button type="button" onClick={onClose}>Uždaryti</button>
    </div>
  );
}
