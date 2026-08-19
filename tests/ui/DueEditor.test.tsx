import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DueEditor, type DueValue } from '../../src/ui/components/DueEditor.js';

const NOW = new Date(2026, 7, 14, 10, 0);
const EMPTY: DueValue = { due_at: null, due_has_time: false, remind_at: null, priority: 2, repeat: null };

function renderEditor(value: DueValue = EMPTY) {
  const onChange = vi.fn();
  render(<DueEditor value={value} now={NOW} onChange={onChange} />);
  return onChange;
}

describe('DueEditor', () => {
  it('pagal nutylėjimą pažymėtas čipas „Šiandien"', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Šiandien' }).dataset.pazymeta).toBe('true');
  });

  it('paspaudus „Rytoj" nustato rytdienos datą be žadintuvo', async () => {
    const onChange = renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Rytoj' }));
    expect(onChange).toHaveBeenCalledWith({
      due_at: '2026-08-15', due_has_time: false, remind_at: null, priority: 2, repeat: null,
    });
  });

  it('įvedus laiką prie „Šiandien" sukuria žadintuvą šiai dienai', async () => {
    const onChange = renderEditor();
    await userEvent.type(screen.getByLabelText('Laikas'), '18');
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith({
      due_at: '2026-08-14T18:00', due_has_time: true, remind_at: '2026-08-14T18:00', priority: 2, repeat: null,
    });
  });

  it('praėjusi valanda be datos keliama į rytdieną', async () => {
    const onChange = renderEditor();
    await userEvent.type(screen.getByLabelText('Laikas'), '08:00');
    await userEvent.tab();
    expect(onChange.mock.lastCall![0].due_at).toBe('2026-08-15T08:00');
  });

  it('neatpažintas laikas nieko nekeičia', async () => {
    const onChange = renderEditor();
    await userEvent.type(screen.getByLabelText('Laikas'), 'abc');
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('prioriteto taškas keičia tik prioritetą', async () => {
    const onChange = renderEditor({ ...EMPTY, due_at: '2026-08-20', due_has_time: false });
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas prioritetas' }));
    expect(onChange).toHaveBeenCalledWith({
      due_at: '2026-08-20', due_has_time: false, remind_at: null, priority: 1, repeat: null,
    });
  });

  it('konkreti data iš kalendoriaus perduodama kaip yra', () => {
    const onChange = renderEditor();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-09-01' } });
    expect(onChange.mock.lastCall![0].due_at).toBe('2026-09-01');
  });

  it('„Rytoj" čipas rodomas pažymėtas, kai terminas iš tikrųjų rytoj', () => {
    renderEditor({ ...EMPTY, due_at: '2026-08-15' });
    expect(screen.getByRole('button', { name: 'Rytoj' }).dataset.pazymeta).toBe('true');
    expect(screen.getByRole('button', { name: 'Šiandien' }).dataset.pazymeta).toBe('false');
  });

  it('įvedus laiką konkreti data išlieka, o ne sugriūva į šiandien', async () => {
    const onChange = renderEditor({ ...EMPTY, due_at: '2026-09-01' });
    await userEvent.type(screen.getByLabelText('Laikas'), '07:30');
    await userEvent.tab();
    expect(onChange.mock.lastCall![0].due_at).toBe('2026-09-01T07:30');
  });

  it('pasirinkus savaitės dieną siunčia tik repeat, be due_at/remind_at (4 radinys)', async () => {
    // Serveris tapo autoritetu terminui (4 radinys): redaktorius nebeskaičiuoja
    // nextOccurrence čia — jis siunčia tik pasikeitusį repeat, o naują datą
    // parodo gavęs serverio atsakymą. Jei čia būtų siunčiamas ir due_at, jis
    // (kaip aiškiai nurodytas) nustelbtų serverio perskaičiavimą — žr. 1 radinį.
    const onChange = renderEditor();
    await userEvent.selectOptions(screen.getByLabelText('Kartojimas'), 'w:2');

    expect(onChange).toHaveBeenCalledWith({ repeat: 'w:2' });
  });

  it('kartojimą nuėmus terminas nekeičiamas', async () => {
    const onChange = renderEditor({ ...EMPTY, due_at: '2026-08-20', repeat: 'w:2' });
    await userEvent.selectOptions(screen.getByLabelText('Kartojimas'), '');

    const paskutinis = onChange.mock.lastCall![0];
    expect(paskutinis.repeat).toBeNull();
    expect(paskutinis.due_at).toBe('2026-08-20');
  });
});
