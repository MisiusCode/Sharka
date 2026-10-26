import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Locale } from '../../src/core/i18n.js';
import type { Task } from '../../src/core/types.js';
import { DigestView } from '../../src/ui/digest/DigestView.js';

const NOW = new Date(2026, 7, 14, 10, 0);

function task(id: string, title: string): Task {
  return {
    id, title, status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z', completed_at: null,
    repeat: null,
  };
}

function renderDigest(tasks: Task[], handlers = {}, locale: Locale = 'lt') {
  const props = {
    tasks, now: NOW, locale,
    onToggleDone: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onReschedule: vi.fn(), onClose: vi.fn(),
    ...handlers,
  };
  render(<DigestView {...props} />);
  return props;
}

describe('DigestView', () => {
  it('rodo antraštę su užduočių skaičiumi', () => {
    renderDigest([task('a', 'A'), task('b', 'B')]);
    expect(screen.getByText('Šiandienai liko 2')).toBeDefined();
  });

  it('vienaskaitą rašo teisingai', () => {
    renderDigest([task('a', 'A')]);
    expect(screen.getByText('Šiandienai liko 1')).toBeDefined();
  });

  it('varnelė lange praneša tėvui', async () => {
    const props = renderDigest([task('a', 'A')]);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));
    expect(props.onToggleDone).toHaveBeenCalledWith('a', true);
  });

  it('mygtukas uždaro', async () => {
    const props = renderDigest([task('a', 'A')]);
    await userEvent.click(screen.getByRole('button', { name: 'Uždaryti' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('angliškai antraštė, mygtukas ir kortelės išversti', () => {
    renderDigest([task('a', 'A')], {}, 'en');
    expect(screen.getByText('1 left for today')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
    // Kortelė kalbą gauna iš to paties props — LAIKINA `locale="lt"` dingo.
    expect(screen.getByRole('checkbox', { name: 'Mark done' })).toBeDefined();
  });

  it('lietuviškai lieka kaip buvo', () => {
    renderDigest([task('a', 'A')], {}, 'lt');
    expect(screen.getByText('Šiandienai liko 1')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Uždaryti' })).toBeDefined();
  });
});
