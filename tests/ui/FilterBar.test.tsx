import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '../../src/ui/components/FilterBar.js';
import { loadLocalPrefs, saveLocalPrefs } from '../../src/ui/localPrefs.js';

beforeEach(() => { localStorage.clear(); });

function renderBar(grouping: 'date' | 'status' | 'completed' = 'date', prefs = loadLocalPrefs()) {
  const onGroupingChange = vi.fn();
  const onPrefsChange = vi.fn();
  render(
    <FilterBar
      grouping={grouping}
      prefs={prefs}
      onGroupingChange={onGroupingChange}
      onPrefsChange={onPrefsChange}
    />,
  );
  return { onGroupingChange, onPrefsChange };
}

describe('localPrefs', () => {
  it('numatytai rodo visus prioritetus ir slepia atliktas', () => {
    expect(loadLocalPrefs()).toEqual({ priorities: [], showDone: false });
  });

  it('išsaugo ir atkuria', () => {
    saveLocalPrefs({ priorities: [1], showDone: true });
    expect(loadLocalPrefs()).toEqual({ priorities: [1], showDone: true });
  });

  it('sugadintą įrašą pakeičia numatytuoju', () => {
    localStorage.setItem('sarka.prefs', '{ne json');
    expect(loadLocalPrefs()).toEqual({ priorities: [], showDone: false });
  });

  it('atmeta netikrus prioritetus iš sugadinto įrašo', () => {
    localStorage.setItem('sarka.prefs', JSON.stringify({ priorities: ['nesamonė', 1, 99, 3], showDone: true }));
    expect(loadLocalPrefs()).toEqual({ priorities: [1, 3], showDone: true });
  });
});

describe('FilterBar', () => {
  it('rodo aktyvų grupavimą ir leidžia jį perjungti', async () => {
    const { onGroupingChange } = renderBar('date');
    expect(screen.getByRole('button', { name: 'Datos' }).dataset.pazymeta).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Progresas' }));
    expect(onGroupingChange).toHaveBeenCalledWith('status');
  });

  it('prioriteto čipas įjungiamas ir išjungiamas', async () => {
    const { onPrefsChange } = renderBar('date', { priorities: [], showDone: false });
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));
    expect(onPrefsChange).toHaveBeenCalledWith({ priorities: [1], showDone: false });
  });

  it('pažymėtas čipas paspaudus nusiima', async () => {
    const { onPrefsChange } = renderBar('date', { priorities: [1, 2], showDone: false });
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));
    expect(onPrefsChange).toHaveBeenCalledWith({ priorities: [2], showDone: false });
  });

  it('jungiklis „Rodyti atliktas" perduoda naują reikšmę', async () => {
    const { onPrefsChange } = renderBar('date', { priorities: [], showDone: false });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Rodyti atliktas' }));
    expect(onPrefsChange).toHaveBeenCalledWith({ priorities: [], showDone: true });
  });

  it('turi trečią perjungiklio mygtuką', async () => {
    const { onGroupingChange } = renderBar('date');
    await userEvent.click(screen.getByRole('button', { name: 'Padaryta' }));
    expect(onGroupingChange).toHaveBeenCalledWith('completed');
  });
});
