import { useRef, useState } from 'react';
import { isOverdue } from '../../core/buckets.js';
import { dateOf, formatDate } from '../../core/datetime.js';
import { t, type Locale } from '../../core/i18n.js';
import { repeatLabel } from '../../core/repeat.js';
import type { Task } from '../../core/types.js';
import { DueEditor, type DuePatch } from './DueEditor.js';

export interface TaskCardProps {
  task: Task;
  today: string;
  now: Date;
  locale: Locale;
  onToggleDone(id: string, done: boolean): void;
  onDelete(id: string): void;
  onRename(id: string, title: string): void;
  onReschedule(id: string, due: DuePatch): void;
}

// Varpelis skiria žadintuvą nuo termino nepriverčiant skaityti valandos.
// `<svg>` teksto mazgų neturi, tad `datos-zyme` textContent lieka vien data —
// testai, lyginantys jį su „rugpjūčio 20, 18:00", to nepajunta.
//
// `width`/`height` čia, o ne vien CSS: be jokio nurodyto dydžio įterptinis SVG
// lanksčiame konteineryje susitraukia iki 0×0 ir dingsta be pėdsako — pamatuota,
// ne atspėta. Atributai tai išlaiko net dingus stiliui.
function Varpelis() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.4a3.5 3.5 0 0 0-3.5 3.5v2.3L3.2 9.6a.6.6 0 0 0 .5.9h8.6a.6.6 0 0 0 .5-.9l-1.3-2.4V4.9A3.5 3.5 0 0 0 8 1.4Zm-1.6 10.5a1.6 1.6 0 0 0 3.2 0H6.4Z" />
    </svg>
  );
}

function dueLabel(locale: Locale, task: Task, today: string): string | null {
  if (task.due_at === null) return null;
  // `due_has_time=false` reiškia laikas nesvarbus, net jei `due_at` jį turi
  // (pvz., senos reikšmės) — apkerpame iki vien datos PRIEŠ formatavimą.
  const dateStr = task.due_has_time ? task.due_at : dateOf(task.due_at);
  return formatDate(locale, dateStr, today);
}

export function TaskCard({
  task, today, now, locale, onToggleDone, onDelete, onRename, onReschedule,
}: TaskCardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [editingDue, setEditingDue] = useState(false);
  const cancelling = useRef(false);
  const label = dueLabel(locale, task, today);
  const overdue = isOverdue(task, today);

  const toggleDueEditor = (): void => setEditingDue((v) => !v);

  const commit = (): void => {
    // Escape išima įvesties lauką iš DOM, o naršyklė tuo metu iššaukia blur —
    // be šitos vėliavos atmestas juodraštis vis tiek būtų išsaugotas. jsdom to
    // neatkartoja, tad testai vieni patys šito nepagautų.
    if (cancelling.current) {
      cancelling.current = false;
      setDraft(null);
      return;
    }
    const value = (draft ?? '').trim();
    if (value !== '' && value !== task.title) onRename(task.id, value);
    setDraft(null);
  };

  const cancel = (): void => {
    cancelling.current = true;
    setDraft(null);
  };

  return (
    <div className="kortele-blokas">
      <div className="kortele" data-atlikta={task.status === 'done'}>
        <span className="prioriteto-juostele" data-prioritetas={task.priority} />

        <input
          type="checkbox"
          data-testid="uzduoties-varnele"
          aria-label={t(locale, 'card.markDone')}
          checked={task.status === 'done'}
          onChange={(e) => onToggleDone(task.id, e.target.checked)}
        />

        {draft === null ? (
          <span
            className="pavadinimas"
            role="button"
            tabIndex={0}
            onClick={() => setDraft(task.title)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDraft(task.title);
              }
            }}
          >
            {task.title}
          </span>
        ) : (
          <input
            className="pavadinimas-ivestis"
            data-testid="pavadinimo-laukas"
            aria-label={t(locale, 'card.title')}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                // Escape čia reiškia „atšaukti redagavimą", ne „uždaryti langą".
                // Tray langelis klausosi Escape ant window, tad nesustabdytas
                // įvykis uždarytų visą langelį kartu su redagavimu.
                e.stopPropagation();
                cancel();
              }
            }}
          />
        )}

        {label !== null ? (
          <span
            className="datos-zyme"
            data-testid="datos-zyme"
            data-pradelsta={overdue}
            // Pradelsimas svarbesnis už žadintuvą: raudona žymė nugali mėlyną.
            // Varpelis rodomas ir tada — laikas juk niekur nedingo.
            data-zadintuvas={task.due_has_time && !overdue}
            role="button"
            tabIndex={0}
            aria-label={t(locale, 'card.due')}
            onClick={toggleDueEditor}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleDueEditor();
              }
            }}
          >
            {task.due_has_time && <Varpelis />}
            {label}
          </span>
        ) : (
          <span
            className="datos-zyme datos-zyme--tuscia"
            data-testid="datos-zyme-tuscia"
            role="button"
            tabIndex={0}
            aria-label={t(locale, 'card.due')}
            onClick={toggleDueEditor}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleDueEditor();
              }
            }}
          >
            —
          </span>
        )}

        {task.repeat !== null && (
          <span
            className="kartojimo-zenklas"
            role="img"
            title={repeatLabel(locale, task.repeat)}
            aria-label={repeatLabel(locale, task.repeat)}
          >
            ↻
          </span>
        )}

        <button type="button" className="trinti" data-testid="trinti-mygtukas" aria-label={t(locale, 'card.delete')} onClick={() => onDelete(task.id)}>
          ×
        </button>
      </div>

      {editingDue && (
        <DueEditor
          value={{
            due_at: task.due_at,
            due_has_time: task.due_has_time,
            remind_at: task.remind_at,
            priority: task.priority,
            repeat: task.repeat,
          }}
          now={now}
          locale={locale}
          onChange={(next) => {
            onReschedule(task.id, next);
            setEditingDue(false);
          }}
        />
      )}
    </div>
  );
}
