import { useEffect, useRef, useState } from 'react';
import { formatTime, timeOf } from '../../core/datetime.js';
import { t, type Locale } from '../../core/i18n.js';
import type { Task } from '../../core/types.js';
import garsas from '../assets/alarm.wav';

export interface AlarmViewProps {
  task: Task;
  lateMinutes: number;
  soundOn: boolean;
  locale: Locale;
  onDone(): void;
  onSnooze(): void;
  onDismiss(): void;
}

export function AlarmView({ task, lateMinutes, soundOn, locale, onDone, onSnooze, onDismiss }: AlarmViewProps) {
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

  // API leidžia priminimą be termino, tad krentam atgal į remind_at — kitaip
  // toks žadintuvas rodytų tuščią laiko eilutę. Tuščia eilutė lieka „laiko
  // nėra“ žyme ir per `formatTime` neina — jai 12 valandų vertimas neturi prasmės.
  const laikas = task.due_at !== null ? timeOf(task.due_at) : task.remind_at !== null ? timeOf(task.remind_at) : '';

  return (
    <div className="zadintuvas" data-prioritetas={task.priority}>
      <p className="zadintuvo-laikas">
        {laikas ? formatTime(locale, laikas) : laikas}
        {lateMinutes > 0 && (
          <span className="veluoja"> {t(locale, 'alarm.late', { minutes: lateMinutes })}</span>
        )}
      </p>

      <h1>{task.title}</h1>

      <div className="zadintuvo-mygtukai">
        <button type="button" onClick={onDone}>{t(locale, 'alarm.done')}</button>
        <button type="button" onClick={onSnooze}>{t(locale, 'alarm.snooze')}</button>
        <button type="button" onClick={onDismiss}>{t(locale, 'common.close')}</button>
        {!muted && (
          <button type="button" onClick={() => setMuted(true)}>{t(locale, 'alarm.mute')}</button>
        )}
      </div>
    </div>
  );
}
