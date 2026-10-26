import { priorityLabel, t, type Locale } from '../../core/i18n.js';
import type { Priority } from '../../core/types.js';
import type { LocalPrefs } from '../localPrefs.js';

export interface FilterBarProps {
  grouping: 'date' | 'status' | 'completed';
  prefs: LocalPrefs;
  locale: Locale;
  onGroupingChange(next: 'date' | 'status' | 'completed'): void;
  onPrefsChange(next: LocalPrefs): void;
}

export function FilterBar({ grouping, prefs, locale, onGroupingChange, onPrefsChange }: FilterBarProps) {
  const togglePriority = (p: Priority): void => {
    const next = prefs.priorities.includes(p)
      ? prefs.priorities.filter((x) => x !== p)
      : [...prefs.priorities, p].sort((a, b) => a - b);
    onPrefsChange({ ...prefs, priorities: next });
  };

  return (
    <div className="filtru-juosta">
      <span className="grupavimas">
        {(['date', 'status', 'completed'] as const).map((mode) => {
          const label = t(locale, mode === 'date' ? 'filter.date' : mode === 'status' ? 'filter.status' : 'filter.completed');
          return (
            <button
              key={mode}
              type="button"
              data-testid={`grupavimas-${mode}`}
              aria-label={label}
              data-pazymeta={grouping === mode}
              onClick={() => onGroupingChange(mode)}
            >
              {label}
            </button>
          );
        })}
      </span>

      <span className="prioriteto-filtras">
        {([1, 2, 3] as Priority[]).map((value) => {
          const label = priorityLabel(locale, value);
          return (
            <button
              key={value}
              type="button"
              aria-label={label}
              data-prioritetas={value}
              data-pazymeta={prefs.priorities.includes(value)}
              onClick={() => togglePriority(value)}
            >
              {label}
            </button>
          );
        })}
      </span>

      <label>
        <input
          type="checkbox"
          data-testid="rodyti-atliktas"
          aria-label={t(locale, 'filter.showDone')}
          checked={prefs.showDone}
          onChange={(e) => onPrefsChange({ ...prefs, showDone: e.target.checked })}
        />
        {t(locale, 'filter.showDone')}
      </label>
    </div>
  );
}
