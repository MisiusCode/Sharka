import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicSettings } from '../../src/core/settings.js';
import type { Task } from '../../src/core/types.js';
import { Board } from '../../src/ui/components/Board.js';
import * as api from '../../src/ui/api.js';

vi.mock('../../src/ui/api.js');

const TODAY = new Date(2026, 7, 14, 10, 0);

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'A', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, repeat: null, ...over,
  };
}

function setup(tasks: Task[], grouping: 'date' | 'status' | 'completed' = 'date') {
  let settings: PublicSettings = {
    grouping, theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
    port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
    backup_dir: '', last_backup: null, last_backup_error: null,
    lan: false, has_pin: false,
  };
  vi.mocked(api.fetchTasks).mockResolvedValue(tasks);
  vi.mocked(api.fetchSettings).mockResolvedValue(settings);
  // Sulieja patch'ą su esamais nustatymais, kaip tikras serveris — jei
  // grąžintume tik pradinius `settings`, `changeGrouping` po paspaudimo
  // niekada nematytų pasikeitusio `grouping`. Grąžinamas NAUJAS objektas (o
  // ne tas pats, mutuotas `Object.assign`): React `setState` lygina pagal
  // nuorodą, tad ta pati nuoroda su pakeistais laukais re-render'o
  // nesukeltų.
  vi.mocked(api.patchSettings).mockImplementation(async (patch) => {
    settings = { ...settings, ...patch };
    return settings;
  });
  vi.mocked(api.subscribeToChanges).mockReturnValue(() => {});
  render(<Board now={TODAY} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Board — datos rodinys', () => {
  it('rodo keturias kolonas lietuviškais pavadinimais', async () => {
    setup([]);
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    for (const label of ['Šiandien', 'Rytoj', 'Per savaitę', 'Vėliau']) {
      expect(screen.getByTestId(`kolona-${label}`)).toBeDefined();
    }
  });

  it('paskirsto užduotis į teisingas kolonas', async () => {
    setup([
      task({ id: 'a', title: 'Bedatė' }),
      task({ id: 'b', title: 'Rytoj darbas', due_at: '2026-08-15' }),
      task({ id: 'c', title: 'Toli', due_at: '2026-09-30' }),
    ]);
    await waitFor(() => expect(screen.getByText('Bedatė')).toBeDefined());
    expect(within(screen.getByTestId('kolona-Šiandien')).getByText('Bedatė')).toBeDefined();
    expect(within(screen.getByTestId('kolona-Rytoj')).getByText('Rytoj darbas')).toBeDefined();
    expect(within(screen.getByTestId('kolona-Vėliau')).getByText('Toli')).toBeDefined();
  });

  it('atliktas slepia, kol neįjungtas jungiklis', async () => {
    // Pavadinimas SĄMONINGAI ne „Padaryta" — nuo šios užduoties tai dabar
    // taip pat trečio perjungiklio mygtuko tekstas, ir `getByText` juos
    // painiotų.
    setup([task({ id: 'a', title: 'Atlikta užduotis', status: 'done' })]);
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    expect(screen.queryByText('Atlikta užduotis')).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Rodyti atliktas' }));
    expect(screen.getByText('Atlikta užduotis')).toBeDefined();
  });

  it('prioriteto filtras palieka tik pažymėtas', async () => {
    setup([
      task({ id: 'a', title: 'Svarbi', priority: 1 }),
      task({ id: 'b', title: 'Eilinė', priority: 3 }),
    ]);
    await waitFor(() => expect(screen.getByText('Svarbi')).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));
    expect(screen.getByText('Svarbi')).toBeDefined();
    expect(screen.queryByText('Eilinė')).toBeNull();
  });
});

describe('Board — progreso rodinys', () => {
  it('perjungus rodo tris būsenų kolonas ir išsaugo serveryje', async () => {
    setup([]);
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    vi.mocked(api.patchSettings).mockResolvedValue({
      grouping: 'status', theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
      port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
      backup_dir: '', last_backup: null, last_backup_error: null,
      lan: false, has_pin: false,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Progresas' }));

    expect(api.patchSettings).toHaveBeenCalledWith({ grouping: 'status' });
    await waitFor(() => expect(screen.getByTestId('kolona-Reikia padaryti')).toBeDefined());
    expect(screen.getByTestId('kolona-Vykdoma')).toBeDefined();
    expect(screen.getByTestId('kolona-Atlikta')).toBeDefined();
  });
});

describe('Board — veiksmai', () => {
  it('varnelė siunčia PATCH su status done', async () => {
    setup([task({ id: 'a', title: 'A' })]);
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    vi.mocked(api.patchTask).mockResolvedValue(task({ id: 'a', status: 'done' }));

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));

    expect(api.patchTask).toHaveBeenCalledWith('a', { status: 'done' });
  });

  it('atmestas PATCH atstato optimistiškai paslėptą užduotį', async () => {
    // Varnelė lentoje pažymima optimistiškai iš karto (žr. Board.tsx komentarą
    // prie onToggleDone), tad nepavykus PATCH užklausai serveryje užduotis
    // negali likti paslėpta vien dėl vietinio, niekada nepatvirtinto pakeitimo.
    setup([task({ id: 'a', title: 'A' })]);
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    vi.mocked(api.patchTask).mockRejectedValue(new Error('Serverio klaida'));

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));

    await waitFor(() => expect(screen.getByText('Serverio klaida')).toBeDefined());
    expect(screen.getByText('A')).toBeDefined();
  });

  it('vidurnaktį persiskaičiuoja "šiandien" ir rytdienos užduotis persikelia į "Šiandien"', async () => {
    // Lenta laikrodį valdo pati (žr. Board.tsx komentarą prie `now` būsenos):
    // `now` prop tik pasėja pradinę reikšmę, o toliau ją atnaujina periodinis
    // laikmatis. Čia jis suklastojamas, kad vidurnaktis įvyktų per testą be
    // realaus laukimo.
    vi.useFakeTimers();
    try {
      const start = new Date(2026, 7, 14, 23, 59, 0);
      vi.setSystemTime(start);

      vi.mocked(api.fetchTasks).mockResolvedValue([
        task({ id: 'a', title: 'Vidurnakčio užduotis', due_at: '2026-08-15' }),
      ]);
      vi.mocked(api.fetchSettings).mockResolvedValue({
        grouping: 'date', theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
        port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
        backup_dir: '', last_backup: null, last_backup_error: null,
        lan: false, has_pin: false,
      });
      vi.mocked(api.subscribeToChanges).mockReturnValue(() => {});

      render(<Board now={start} />);
      // Pradinis užduočių/nustatymų gavimas vyksta per pažadėtą (jau
      // išspręstą) mock'ą — leidžiame mikrouždaviniams įvykti prieš tikrinant.
      await vi.waitFor(() => expect(screen.getByTestId('kolona-Rytoj')).toBeDefined());
      expect(within(screen.getByTestId('kolona-Rytoj')).getByText('Vidurnakčio užduotis')).toBeDefined();

      await vi.advanceTimersByTimeAsync(2 * 60_000); // peržengia vidurnaktį

      expect(
        within(screen.getByTestId('kolona-Šiandien')).getByText('Vidurnakčio užduotis'),
      ).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('DueEditor iš kortelės prioriteto pakeitimą siunčia per patchTask', async () => {
    // Puslapyje jau yra viena DueEditor kopija greitame įvedime (QuickAdd),
    // tad kortelės redaktorius reikia surasti apribojus paiešką iki jos —
    // kitaip `getByRole('button', { name: 'Aukštas prioritetas' })` rastų du.
    setup([task({ id: 'a', title: 'A', due_at: '2026-08-20', priority: 2 })]);
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    vi.mocked(api.patchTask).mockResolvedValue(task({ id: 'a', due_at: '2026-08-20', priority: 1 }));

    const kortele = screen.getByTestId('datos-zyme').closest('.kortele-blokas') as HTMLElement;
    await userEvent.click(screen.getByTestId('datos-zyme'));
    await userEvent.click(within(kortele).getByRole('button', { name: 'Aukštas prioritetas' }));

    expect(api.patchTask).toHaveBeenCalledWith('a', {
      due_at: '2026-08-20', due_has_time: false, remind_at: null, priority: 1, repeat: null,
    });
  });

  it('rodo ryšio juostą praradus SSE', async () => {
    // Tvarkyklė laikoma objekto lauke, o ne kintamajame: kintamąjį TypeScript
    // susiaurintų iki `null`, nes priskyrimo uždarinio viduje jis nemato.
    //
    // Nesinaudojama bendra `setup()` pagalbine funkcija: ji pati nustato
    // savo numatytąją `subscribeToChanges` realizaciją, kuri, iškviesta po
    // šio testo `mockImplementation`, ją perrašytų ir `captured.onStatus`
    // niekada nebūtų priskirtas.
    const captured: { onStatus?: (s: 'connected' | 'disconnected') => void } = {};
    vi.mocked(api.fetchTasks).mockResolvedValue([]);
    vi.mocked(api.fetchSettings).mockResolvedValue({
      grouping: 'date', theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
      port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
      backup_dir: '', last_backup: null, last_backup_error: null,
      lan: false, has_pin: false,
    });
    vi.mocked(api.subscribeToChanges).mockImplementation((_onChange, onStatus) => {
      captured.onStatus = onStatus;
      return () => {};
    });
    render(<Board now={TODAY} />);
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    captured.onStatus!('disconnected');

    await waitFor(() =>
      expect(screen.getByText('Nėra ryšio su serveriu')).toBeDefined(),
    );
  });
});

describe('Board — padaryta', () => {
  it('rodo tik atliktas, sugrupuotas pagal atlikimo laiką', async () => {
    setup([
      task({ id: 'a', title: 'Padaryta šiandien', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' }),
      task({ id: 'b', title: 'Dar nepadaryta' }),
    ], 'completed');

    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    expect(within(screen.getByTestId('kolona-Šiandien')).getByText('Padaryta šiandien')).toBeDefined();
    expect(screen.queryByText('Dar nepadaryta')).toBeNull();
  });

  it('rodo savaitės suvestinę', async () => {
    setup([
      task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' }),
      task({ id: 'b', status: 'done', completed_at: '2026-08-13T09:00:00.000Z' }),
    ], 'completed');

    await waitFor(() => expect(screen.getByText('Per savaitę padaryta 2')).toBeDefined());
  });

  it('varnelės nuėmimas grąžina užduotį atgal ir ji dingsta iš šio rodinio', async () => {
    setup([task({ id: 'a', title: 'A', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());

    // PATCH pakabinamas neišspręstas: taip tikrinamas kliento optimistinis
    // atnaujinimas ir kolonų filtras atskirai nuo `reload()`. `reload()`
    // įvyktų tik PATCH pažadui pasibaigus ir grąžintų tą patį, šiame teste
    // nepakeistą `fetchTasks` mock'ą (vis dar „atlikta" būsenos) — jei
    // patikra lauktų iki tada, ji priklausytų nuo šio testo dvigubo
    // fetch'o keistenybės, o ne nuo realaus elgesio.
    let resolvePatch: (value: Task) => void = () => {};
    vi.mocked(api.patchTask).mockReturnValue(
      new Promise<Task>((resolve) => { resolvePatch = resolve; }),
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));

    expect(api.patchTask).toHaveBeenCalledWith('a', { status: 'todo' });
    expect(screen.queryByText('A')).toBeNull();

    // Išsprendžiam pažadą, kad `run()` galėtų baigti savo `reload()` grandinę
    // ir testas nepaliktų kabančių pažadų / neapdorotų `act()` įspėjimų.
    resolvePatch(task({ id: 'a', title: 'A', status: 'todo' }));
    await waitFor(() => expect(api.fetchTasks).toHaveBeenCalledTimes(2));
  });

  it('prioriteto filtras veikia ir šiame rodinyje', async () => {
    setup([
      task({ id: 'a', title: 'Svarbi padaryta', status: 'done', completed_at: '2026-08-14T09:00:00.000Z', priority: 1 }),
      task({ id: 'b', title: 'Eilinė padaryta', status: 'done', completed_at: '2026-08-14T09:00:00.000Z', priority: 3 }),
    ], 'completed');
    await waitFor(() => expect(screen.getByText('Svarbi padaryta')).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));

    expect(screen.getByText('Svarbi padaryta')).toBeDefined();
    expect(screen.queryByText('Eilinė padaryta')).toBeNull();
  });

  it('tempimo šiame rodinyje nėra', async () => {
    setup([task({ id: 'a', title: 'A', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    // Tempiamas apvalkalas turi savo prieinamą vardą; apžvalgos režime jo nėra.
    expect(screen.queryByLabelText('Užduoties kortelė, tempiama')).toBeNull();
  });
});

describe('Board — laikotarpio peržiūra', () => {
  it('„Peržiūrėti" pakeičia kolonas sąrašu su bendru skaičiumi', async () => {
    setup([
      task({ id: 'a', title: 'Sena užduotis', status: 'done', completed_at: '2026-07-20T09:00:00.000Z' }),
      task({ id: 'b', title: 'Nauja užduotis', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' }),
    ], 'completed');

    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-08-14' } });
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));

    expect(screen.queryByTestId('kolona-Šiandien')).toBeNull();
    expect(screen.getByText('Padaryta: 2')).toBeDefined();
    expect(screen.getByText('Sena užduotis')).toBeDefined();
    expect(screen.getByText('Nauja užduotis')).toBeDefined();
  });

  it('prioriteto filtras veikia ir laikotarpio peržiūroje', async () => {
    setup([
      task({ id: 'a', title: 'Svarbi padaryta', status: 'done', completed_at: '2026-08-14T09:00:00.000Z', priority: 1 }),
      task({ id: 'b', title: 'Eilinė padaryta', status: 'done', completed_at: '2026-08-14T09:00:00.000Z', priority: 3 }),
    ], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));

    expect(screen.getByText('Padaryta: 1')).toBeDefined();
    expect(screen.getByText('Svarbi padaryta')).toBeDefined();
    expect(screen.queryByText('Eilinė padaryta')).toBeNull();
  });

  it('„Grįžti" grąžina kolonas', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));
    expect(screen.queryByTestId('kolona-Šiandien')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Grįžti' }));
    expect(screen.getByTestId('kolona-Šiandien')).toBeDefined();
  });

  it('tuščias laikotarpis paaiškinamas, o ne paliekamas tuščias', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-01-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));

    expect(screen.getByText('Padaryta: 0')).toBeDefined();
    expect(screen.getByText('Per šį laikotarpį nieko nepadaryta.')).toBeDefined();
  });

  it('apverstas intervalas išjungia mygtuką ir paaiškina', async () => {
    setup([], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-08-20' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-08-10' } });

    expect((screen.getByRole('button', { name: 'Peržiūrėti' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Pradžios data vėlesnė už pabaigos.')).toBeDefined();
  });

  it('perjungus grupavimą peržiūra išjungiama', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));
    expect(screen.queryByTestId('kolona-Šiandien')).toBeNull();

    // Grįžus į „Padaryta" turi būti kolonos, ne senas sąrašas.
    await userEvent.click(screen.getByRole('button', { name: 'Datos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Padaryta' }));

    await waitFor(() => expect(screen.getByTestId('kolona-Šiandien')).toBeDefined());
  });

  it('laikotarpio eilutės nėra kituose rodiniuose', async () => {
    setup([task({ id: 'a', title: 'A' })], 'date');
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    expect(screen.queryByLabelText('Nuo')).toBeNull();
  });
});
