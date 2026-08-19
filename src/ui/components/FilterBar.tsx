import type { Priority } from '../../core/types.js';
import type { LocalPrefs } from '../localPrefs.js';

export interface FilterBarProps {
  grouping: 'date' | 'status' | 'completed';
  prefs: LocalPrefs;
  onGroupingChange(next: 'date' | 'status' | 'completed'): void;
  onPrefsChange(next: LocalPrefs): void;
}

const PRIORITY_CHIPS: { value: Priority; label: string }[] = [
  { value: 1, label: 'Aukštas' },
  { value: 2, label: 'Vidutinis' },
  { value: 3, label: 'Žemas' },
];

export function FilterBar({ grouping, prefs, onGroupingChange, onPrefsChange }: FilterBarProps) {
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
          const label = mode === 'date' ? 'Datos' : mode === 'status' ? 'Progresas' : 'Padaryta';
          return (
            <button
              key={mode}
              type="button"
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
        {PRIORITY_CHIPS.map(({ value, label }) => (
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
        ))}
      </span>

      <label>
        <input
          type="checkbox"
          aria-label="Rodyti atliktas"
          checked={prefs.showDone}
          onChange={(e) => onPrefsChange({ ...prefs, showDone: e.target.checked })}
        />
        Rodyti atliktas
      </label>
    </div>
  );
}
