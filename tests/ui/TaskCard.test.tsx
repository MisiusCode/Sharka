import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../src/core/types.js';
import { TaskCard } from '../../src/ui/components/TaskCard.js';

const TODAY = '2026-08-14';
const NOW = new Date(2026, 7, 14, 10, 0);

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'Nupirkti pieną', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, repeat: null, ...over,
  };
}

function renderCard(over: Partial<Task> = {}, handlers = {}) {
  const props = {
    task: task(over), today: TODAY, now: NOW,
    onToggleDone: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onReschedule: vi.fn(), ...handlers,
  };
  render(<TaskCard {...props} />);
  return props;
}

describe('TaskCard', () => {
  it('rodo pavadinimą, o bedatei nerodo datos žymės', () => {
    renderCard();
    expect(screen.getByText('Nupirkti pieną')).toBeDefined();
    expect(screen.queryByTestId('datos-zyme')).toBeNull();
  });

  it('datuotai rodo datą, o turinčiai laiką — ir valandą', () => {
    const { unmount } = render(
      <TaskCard
        task={task({ due_at: '2026-08-20' })} today={TODAY} now={NOW}
        onToggleDone={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} onReschedule={vi.fn()}
      />,
    );
    expect(screen.getByTestId('datos-zyme').textContent).toBe('rugpjūčio 20');
    unmount();

    renderCard({ due_at: '2026-08-20T18:00', due_has_time: true });
    expect(screen.getByTestId('datos-zyme').textContent).toBe('rugpjūčio 20, 18:00');
  });

  it('pradelstą pažymi', () => {
    renderCard({ due_at: '2026-08-10' });
    expect(screen.getByTestId('datos-zyme').dataset.pradelsta).toBe('true');
  });

  it('varnelė praneša apie pažymėjimą', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));
    expect(props.onToggleDone).toHaveBeenCalledWith('t1', true);
  });

  it('ištrynimas praneša su id', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Ištrinti' }));
    expect(props.onDelete).toHaveBeenCalledWith('t1');
  });

  it('pavadinimas redaguojamas vietoje, Enter išsaugo', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByText('Nupirkti pieną'));
    const input = screen.getByRole('textbox', { name: 'Užduoties pavadinimas' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Nupirkti duonos{Enter}');
    expect(props.onRename).toHaveBeenCalledWith('t1', 'Nupirkti duonos');
  });

  it('Esc atšaukia redagavimą', async () => {
    const props = renderCard();
    await userEvent.click(screen.getByText('Nupirkti pieną'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Užduoties pavadinimas' }), 'Kita{Escape}');
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByText('Nupirkti pieną')).toBeDefined();
  });

  it('paspaudus datos žymę atidaro DueEditor', async () => {
    renderCard({ due_at: '2026-08-20' });
    expect(screen.queryByRole('button', { name: 'Vidutinis prioritetas' })).toBeNull();

    await userEvent.click(screen.getByTestId('datos-zyme'));

    expect(screen.getByRole('button', { name: 'Vidutinis prioritetas' })).toBeDefined();
  });

  it('bedatei rodomas pakaitalas, kuris taip pat atidaro DueEditor', async () => {
    renderCard();
    const placeholder = screen.getByTestId('datos-zyme-tuscia');
    expect(placeholder.getAttribute('aria-label')).toBe('Keisti terminą');

    await userEvent.click(placeholder);

    expect(screen.getByRole('button', { name: 'Šiandien' })).toBeDefined();
  });

  it('Enter ant datos žymės taip pat atidaro DueEditor (klaviatūra)', async () => {
    renderCard({ due_at: '2026-08-20' });
    screen.getByTestId('datos-zyme').focus();

    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Vidutinis prioritetas' })).toBeDefined();
  });

  it('prioriteto keitimas per įterptinį DueEditor praneša onReschedule ir uždaro redaktorių', async () => {
    const props = renderCard({ due_at: '2026-08-20', priority: 2 });
    await userEvent.click(screen.getByTestId('datos-zyme'));

    await userEvent.click(screen.getByRole('button', { name: 'Aukštas prioritetas' }));

    expect(props.onReschedule).toHaveBeenCalledWith('t1', {
      due_at: '2026-08-20', due_has_time: false, remind_at: null, priority: 1, repeat: null,
    });
    expect(screen.queryByRole('button', { name: 'Aukštas prioritetas' })).toBeNull();
  });

  // Escape+blur atvejis, kuris kadaise buvo čia patikrintas su `fireEvent.blur`
  // po Escape, nebeteko prasmės: Escape jau ištraukia įvesties lauką iš DOM,
  // tad `fireEvent.blur` po jo taikinio nebepasiekia — testas praeidavo
  // nepriklausomai nuo to, ar produkcinis `cancelling` apsaugas iš tikrųjų
  // veikia. Tikra šio elgesio patikra yra Playwright teste
  // tests/e2e/board.spec.ts: „Escape atšaukia pavadinimo redagavimą net
  // paspaudus šalia".

  it('pasikartojančią užduotį žymi ženklu, ne tekstu', () => {
    renderCard({ due_at: '2026-08-18', repeat: 'w:2' });
    const zenklas = screen.getByTitle('kas antradienį');
    expect(zenklas.textContent).toBe('↻');
    expect(screen.queryByText('kas antradienį')).toBeNull();
  });

  it('kartojimo ženklas turi role="img", kad ekrano skaitytuvas perskaitytų aria-label (8 radinys)', () => {
    renderCard({ due_at: '2026-08-18', repeat: 'w:2' });
    expect(screen.getByRole('img', { name: 'kas antradienį' }).textContent).toBe('↻');
  });

  it('nepasikartojanti ženklo neturi', () => {
    renderCard({ due_at: '2026-08-18' });
    expect(screen.queryByTitle(/^kas /)).toBeNull();
  });

  it('Escape neprasiskverbia iki lango — kitaip tray langelis užsidarytų', async () => {
    const langoKlausytojas = vi.fn();
    window.addEventListener('keydown', langoKlausytojas);

    const props = renderCard();
    await userEvent.click(screen.getByText('Nupirkti pieną'));
    const input = screen.getByRole('textbox', { name: 'Užduoties pavadinimas' });
    await userEvent.type(input, 'Kita{Escape}');

    const escapeIvykiai = langoKlausytojas.mock.calls.filter(
      ([e]) => (e as KeyboardEvent).key === 'Escape',
    );
    expect(escapeIvykiai).toHaveLength(0);
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByText('Nupirkti pieną')).toBeDefined();

    window.removeEventListener('keydown', langoKlausytojas);
  });
});
