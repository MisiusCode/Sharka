import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicSettings } from '../../src/core/settings.js';
import * as api from '../../src/ui/api.js';
import { QuickAddScreen } from '../../src/ui/quick-add/QuickAddScreen.js';

vi.mock('../../src/ui/api.js');

const NOW = new Date(2026, 7, 14, 10, 0);

const SETTINGS: PublicSettings = {
  grouping: 'date', theme: 'system', locale: 'system', sound: 'alarms',
  digest_times: ['10:00', '15:30'], port: 8080, hotkey: 'Ctrl+Alt+Space',
  autostart: true, last_digest: null,
  backup_dir: '', last_backup: null, last_backup_error: null,
  lan: false, has_pin: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchTasks).mockResolvedValue([]);
  vi.mocked(api.fetchSettings).mockResolvedValue(SETTINGS);
  vi.mocked(api.subscribeToChanges).mockReturnValue(() => {});
});

describe('QuickAddScreen', () => {
  it('įvedimo laukas gauna fokusą iškart', async () => {
    render(<QuickAddScreen now={NOW} onOpenBoard={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Nauja užduotis')));
  });

  it('Enter sukuria užduotį ir uždaro langą', async () => {
    const onClose = vi.fn();
    vi.mocked(api.createTask).mockResolvedValue({} as never);
    render(<QuickAddScreen now={NOW} onOpenBoard={vi.fn()} onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Nupirkti pieną{Enter}');

    await waitFor(() => expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nupirkti pieną', due_at: null }),
    ));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Esc uždaro langą nieko nesukūręs', async () => {
    const onClose = vi.fn();
    render(<QuickAddScreen now={NOW} onOpenBoard={vi.fn()} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('nuoroda „Atidaryti lentą" praneša tėvui', async () => {
    const onOpenBoard = vi.fn();
    render(<QuickAddScreen now={NOW} onOpenBoard={onOpenBoard} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Atidaryti lentą' }));
    expect(onOpenBoard).toHaveBeenCalled();
  });

  it('vidurnaktį persiskaičiuoja „šiandien" ir rytdienos užduotis persikelia į „Šiandien"', async () => {
    // Langelis — tray aplikacija, skirta veikti savaitėmis, tad `now` prop tik
    // sėja pradinę reikšmę, o toliau ją atnaujina bendras `useNow` laikrodis
    // (žr. Board.test.tsx analogišką testą ir useNow.ts komentarą). Čia
    // vidurnaktis suklastojamas, kad įvyktų per testą be realaus laukimo.
    vi.useFakeTimers();
    try {
      const start = new Date(2026, 7, 14, 23, 59, 0);
      vi.setSystemTime(start);

      vi.mocked(api.fetchTasks).mockResolvedValue([
        { id: 'a', title: 'Vidurnakčio užduotis', status: 'todo', priority: 2, due_at: '2026-08-15',
          due_has_time: false, remind_at: null, reminded_at: null,
          created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z', completed_at: null,
          repeat: null },
      ]);
      vi.mocked(api.fetchSettings).mockResolvedValue(SETTINGS);
      vi.mocked(api.subscribeToChanges).mockReturnValue(() => {});

      render(<QuickAddScreen now={start} onOpenBoard={vi.fn()} onClose={vi.fn()} />);
      // Pradinis užduočių/nustatymų gavimas vyksta per pažadėtą (jau
      // išspręstą) mock'ą — leidžiame mikrouždaviniams įvykti prieš tikrinant.
      await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Rytoj' })).toBeDefined());
      expect(screen.getByText('Vidurnakčio užduotis')).toBeDefined();
      expect(screen.queryByRole('heading', { name: 'Šiandien' })).toBeNull();

      await vi.advanceTimersByTimeAsync(2 * 60_000); // peržengia vidurnaktį

      await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Šiandien' })).toBeDefined());
      expect(screen.getByText('Vidurnakčio užduotis')).toBeDefined();
      expect(screen.queryByRole('heading', { name: 'Rytoj' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('grupavimas „completed" langelyje krenta atgal į datas, ne rodo atliktų suvestinę', async () => {
    // Tray langelis neturi lentos „Padaryta" rodinio — jis visada rodo darbinį
    // sąrašą. Jei nustatymuose išsaugotas grouping: 'completed' (perjungta
    // lentoje), langelis vis tiek turi grupuoti pagal datą, kaip ir dar
    // nežinomos ateities reikšmės atveju. Įrodymui naudojama sena atlikta
    // užduotis be termino: „completed" grupavime ji patektų po antrašte
    // „Anksčiau" (COMPLETED_LABELS.earlier), o datos rodinyje — visada po
    // „Šiandien" (dateBucketOf grąžina 'today', kai due_at yra null).
    vi.mocked(api.fetchTasks).mockResolvedValue([
      { id: 'a', title: 'Seniai atlikta', status: 'done', priority: 2, due_at: null,
        due_has_time: false, remind_at: null, reminded_at: null,
        created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
        completed_at: '2026-08-01T10:00:00.000Z', repeat: null },
    ]);
    vi.mocked(api.fetchSettings).mockResolvedValue({ ...SETTINGS, grouping: 'completed' });

    render(<QuickAddScreen now={NOW} onOpenBoard={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Šiandien' })).toBeDefined());
    expect(screen.getByText('Seniai atlikta')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Anksčiau' })).toBeNull();
  });
});
