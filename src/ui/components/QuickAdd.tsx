import { useState } from 'react';
import type { TaskInput } from '../../core/types.js';
import { DueEditor, type DueValue } from './DueEditor.js';

export interface QuickAddProps {
  now: Date;
  onCreate(input: TaskInput): void;
  autoFocus?: boolean;
}

const EMPTY_DUE: DueValue = { due_at: null, due_has_time: false, remind_at: null, priority: 2, repeat: null };

export function QuickAdd({ now, onCreate, autoFocus = false }: QuickAddProps) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<DueValue>(EMPTY_DUE);

  const submit = (): void => {
    const trimmed = title.trim();
    if (trimmed === '') return;
    onCreate({
      title: trimmed,
      due_at: due.due_at,
      due_has_time: due.due_has_time,
      remind_at: due.remind_at,
      priority: due.priority,
      repeat: due.repeat,
    });
    setTitle('');
    setDue(EMPTY_DUE);
  };

  return (
    <div className="greitas-ivedimas">
      <input
        type="text"
        aria-label="Nauja užduotis"
        placeholder="Nauja užduotis…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        autoFocus={autoFocus}
      />
      <DueEditor
        value={due}
        now={now}
        // DueEditor.onChange gali atsiųsti tik dalį laukų (4 radinys — pvz.
        // pasirinkus repeat siunčiama tik { repeat }, be due_at). QuickAdd
        // neturi serverio, į kurį persiųsti patch'ą ir gauti pilną atsakymą
        // atgal (kitaip nei TaskCard), tad juodraštis sujungiamas su ankstesne
        // pilna būsena — trūkstami laukai lieka nepakitę, o ne dingsta.
        onChange={(patch) => setDue((prev) => ({ ...prev, ...patch }))}
      />
    </div>
  );
}
