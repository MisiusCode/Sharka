import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../src/core/types.js';
import { GroupedList } from '../../src/ui/components/GroupedList.js';

const TODAY = '2026-08-14';
const NOW = new Date(2026, 7, 14, 10, 0);

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'A', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, repeat: null, ...over,
  };
}

function renderList(tasks: Task[], grouping: 'date' | 'status' = 'date', handlers = {}) {
  const props = {
    tasks, grouping, today: TODAY, now: NOW,
    onToggleDone: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onReschedule: vi.fn(), ...handlers,
  };
  render(<GroupedList {...props} />);
  return props;
}

describe('GroupedList', () => {
  it('rodo tik tas sekcijas, kuriose yra užduočių', () => {
    renderList([task({ id: 'a' }), task({ id: 'b', due_at: '2026-08-15' })]);
    expect(screen.getByRole('heading', { name: 'Šiandien' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Rytoj' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Vėliau' })).toBeNull();
  });

  it('sekcijos eina laiko tvarka', () => {
    renderList([
      task({ id: 'a', due_at: '2026-09-30' }),
      task({ id: 'b', due_at: '2026-08-15' }),
      task({ id: 'c' }),
    ]);
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toEqual(['Šiandien', 'Rytoj', 'Vėliau']);
  });

  it('progreso režimu rodo būsenų antraštes', () => {
    renderList([task({ id: 'a', status: 'doing' })], 'status');
    expect(screen.getByRole('heading', { name: 'Vykdoma' })).toBeDefined();
  });

  it('tuščias sąrašas rodo paaiškinimą', () => {
    renderList([]);
    expect(screen.getByText('Užduočių nėra')).toBeDefined();
  });

  it('pakeitus prioritetą datos redaktoriuje, iškviečia onReschedule su nauja reikšme', async () => {
    const props = renderList([task({ id: 'task-a', due_at: '2026-08-20', priority: 2 })]);

    // Atidaryti due redaktorių paspaudus datos žymę
    await userEvent.click(screen.getByTestId('datos-zyme'));

    // Keisti prioritetą
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas prioritetas' }));

    // Patikrinti, kad onReschedule buvo iškviesta su teisingu task ID
    expect(props.onReschedule).toHaveBeenCalledWith('task-a', {
      due_at: '2026-08-20',
      due_has_time: false,
      remind_at: null,
      priority: 1,
      repeat: null,
    });
  });
});
