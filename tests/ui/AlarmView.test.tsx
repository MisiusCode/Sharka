import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../src/core/types.js';
import { AlarmView } from '../../src/ui/alarm/AlarmView.js';

const TASK: Task = {
  id: 't1', title: 'Paskambinti mamai', status: 'todo', priority: 1,
  due_at: '2026-08-14T18:00', due_has_time: true, remind_at: '2026-08-14T18:00',
  reminded_at: null, created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
  completed_at: null, repeat: null,
};

function renderAlarm(lateMinutes = 0, soundOn = true) {
  const handlers = { onDone: vi.fn(), onSnooze: vi.fn(), onDismiss: vi.fn() };
  render(<AlarmView task={TASK} lateMinutes={lateMinutes} soundOn={soundOn} {...handlers} />);
  return handlers;
}

describe('AlarmView', () => {
  it('rodo pavadinimą ir laiką', () => {
    renderAlarm();
    expect(screen.getByText('Paskambinti mamai')).toBeDefined();
    expect(screen.getByText('18:00')).toBeDefined();
  });

  it('vėluojant rodo kiek', () => {
    renderAlarm(40);
    expect(screen.getByText('vėluoja 40 min')).toBeDefined();
  });

  it('nevėluojant vėlavimo neminimi', () => {
    renderAlarm(0);
    expect(screen.queryByText(/vėluoja/)).toBeNull();
  });

  it('mygtukai praneša tėvui', async () => {
    const h = renderAlarm();
    await userEvent.click(screen.getByRole('button', { name: 'Atlikta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Atidėti 10 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Uždaryti' }));
    expect(h.onDone).toHaveBeenCalled();
    expect(h.onSnooze).toHaveBeenCalled();
    expect(h.onDismiss).toHaveBeenCalled();
  });

  it('garsui išjungus nutildymo mygtuko nerodo', () => {
    renderAlarm(0, false);
    expect(screen.queryByRole('button', { name: 'Nutildyti' })).toBeNull();
  });

  it('nutildymas paslepia mygtuką, bet lango neuždaro', async () => {
    renderAlarm(0, true);
    await userEvent.click(screen.getByRole('button', { name: 'Nutildyti' }));
    expect(screen.queryByRole('button', { name: 'Nutildyti' })).toBeNull();
    expect(screen.getByText('Paskambinti mamai')).toBeDefined();
  });
});
