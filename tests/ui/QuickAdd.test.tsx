import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAdd } from '../../src/ui/components/QuickAdd.js';

const NOW = new Date(2026, 7, 14, 10, 0);

function renderQuickAdd() {
  const onCreate = vi.fn();
  render(<QuickAdd now={NOW} onCreate={onCreate} />);
  return onCreate;
}

describe('QuickAdd', () => {
  it('Enter sukuria bedatę užduotį', async () => {
    const onCreate = renderQuickAdd();
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Nupirkti pieną{Enter}');
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Nupirkti pieną', due_at: null, due_has_time: false, remind_at: null, priority: 2, repeat: null,
    });
  });

  it('po išsaugojimo išvalo lauką ir grąžina numatytąjį terminą', async () => {
    const onCreate = renderQuickAdd();
    const input = screen.getByLabelText('Nauja užduotis');
    await userEvent.click(screen.getByRole('button', { name: 'Rytoj' }));
    await userEvent.type(input, 'A{Enter}');
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Šiandien' }).dataset.pazymeta).toBe('true');
    onCreate.mockClear();

    await userEvent.type(input, 'B{Enter}');
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'B', due_at: null }));
  });

  it('perduoda pasirinktą terminą ir prioritetą', async () => {
    const onCreate = renderQuickAdd();
    await userEvent.click(screen.getByRole('button', { name: 'Rytoj' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas prioritetas' }));
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Skambutis{Enter}');
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Skambutis', due_at: '2026-08-15', due_has_time: false, remind_at: null, priority: 1, repeat: null,
    });
  });

  it('tuščias pavadinimas nieko nesukuria', async () => {
    const onCreate = renderQuickAdd();
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), '   {Enter}');
    expect(onCreate).not.toHaveBeenCalled();
  });
});
