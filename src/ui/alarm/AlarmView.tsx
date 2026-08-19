import { useEffect, useRef, useState } from 'react';
import { timeOf } from '../../core/datetime.js';
import type { Task } from '../../core/types.js';
import garsas from '../assets/alarm.wav';

export interface AlarmViewProps {
  task: Task;
  lateMinutes: number;
  soundOn: boolean;
  onDone(): void;
  onSnooze(): void;
  onDismiss(): void;
}

export function AlarmView({ task, lateMinutes, soundOn, onDone, onSnooze, onDismiss }: AlarmViewProps) {
  const [muted, setMuted] = useState(!soundOn);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (muted) {
      audio.current?.pause();
      return;
    }
    try {
      audio.current = new Audio(garsas);
      audio.current.loop = true;
      void audio.current.play()?.catch(() => {});
    } catch {
      // jsdom ir dalis aplinkų garso negroja — tyla čia nėra klaida.
    }
    return () => { audio.current?.pause(); };
  }, [muted]);

  return (
    <div className="zadintuvas" data-prioritetas={task.priority}>
      <p className="zadintuvo-laikas">
        {/* API leidžia priminimą be termino, tad krentam atgal į remind_at —
            kitaip toks žadintuvas rodytų tuščią laiko eilutę. */}
        {task.due_at !== null ? timeOf(task.due_at) : task.remind_at !== null ? timeOf(task.remind_at) : ''}
        {lateMinutes > 0 && <span className="veluoja"> vėluoja {lateMinutes} min</span>}
      </p>

      <h1>{task.title}</h1>

      <div className="zadintuvo-mygtukai">
        <button type="button" onClick={onDone}>Atlikta</button>
        <button type="button" onClick={onSnooze}>Atidėti 10 min</button>
        <button type="button" onClick={onDismiss}>Uždaryti</button>
        {!muted && (
          <button type="button" onClick={() => setMuted(true)}>Nutildyti</button>
        )}
      </div>
    </div>
  );
}
