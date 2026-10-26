import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicSettings } from '../../src/core/settings.js';
import type { Task } from '../../src/core/types.js';
import { Board } from '../../src/ui/components/Board.js';
import * as api from '../../src/ui/api.js';

vi.mock('../../src/ui/api.js');

// PIN ekranas (žr. PinGate.tsx) nuo šios užduoties kalbą ima iš
// `navigator.language`, ne iš `resolved_locale` — nustatymų jam parsisiųsti
// neįmanoma (žr. `ui/useLocale.ts` browserLocale komentarą). jsdom čia
// numatyta grąžina 'en-US', o šio failo testai tikrina lietuviškus PIN
// ekrano tekstus, tad kalbą priverčiame, kaip realiame lietuviškai
// sukonfigūruotame įrenginyje.
Object.defineProperty(window.navigator, 'language', { value: 'lt', configurable: true });

const TODAY = new Date(2026, 7, 14, 10, 0);

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'A', status: 'todo', priority: 2,
    due_at: null, due_has_time: false, remind_at: null, reminded_at: null,
    created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z',
    completed_at: null, repeat: null, ...over,
  };
}

function setup(
  tasks: Task[],
  grouping: 'date' | 'status' | 'completed' = 'date',
  over: Partial<PublicSettings> = {},
) {
  let settings: PublicSettings = {
    grouping, theme: 'system', locale: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
    port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
    backup_dir: '', last_backup: null, last_backup_error: null,
    lan: false, has_pin: false, resolved_locale: 'lt',
    ...over,
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
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());
    for (const [id, label] of [
      ['today', 'Šiandien'], ['tomorrow', 'Rytoj'], ['week', 'Per savaitę'], ['later', 'Vėliau'],
    ]) {
      expect(within(screen.getByTestId(`kolona-${id}`)).getByText(label)).toBeDefined();
    }
  });

  it('paskirsto užduotis į teisingas kolonas', async () => {
    setup([
      task({ id: 'a', title: 'Bedatė' }),
      task({ id: 'b', title: 'Rytoj darbas', due_at: '2026-08-15' }),
      task({ id: 'c', title: 'Toli', due_at: '2026-09-30' }),
    ]);
    await waitFor(() => expect(screen.getByText('Bedatė')).toBeDefined());
    expect(within(screen.getByTestId('kolona-today')).getByText('Bedatė')).toBeDefined();
    expect(within(screen.getByTestId('kolona-tomorrow')).getByText('Rytoj darbas')).toBeDefined();
    expect(within(screen.getByTestId('kolona-later')).getByText('Toli')).toBeDefined();
  });

  it('atliktas slepia, kol neįjungtas jungiklis', async () => {
    // Pavadinimas SĄMONINGAI ne „Padaryta" — nuo šios užduoties tai dabar
    // taip pat trečio perjungiklio mygtuko tekstas, ir `getByText` juos
    // painiotų.
    setup([task({ id: 'a', title: 'Atlikta užduotis', status: 'done' })]);
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());
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
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());
    vi.mocked(api.patchSettings).mockResolvedValue({
      grouping: 'status', theme: 'system', locale: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
      port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
      backup_dir: '', last_backup: null, last_backup_error: null,
      lan: false, has_pin: false, resolved_locale: 'lt',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Progresas' }));

    expect(api.patchSettings).toHaveBeenCalledWith({ grouping: 'status' });
    await waitFor(() => expect(screen.getByTestId('kolona-todo')).toBeDefined());
    expect(screen.getByTestId('kolona-doing')).toBeDefined();
    expect(screen.getByTestId('kolona-done')).toBeDefined();
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
        grouping: 'date', theme: 'system', locale: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
        port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
        backup_dir: '', last_backup: null, last_backup_error: null,
        lan: false, has_pin: false, resolved_locale: 'lt',
      });
      vi.mocked(api.subscribeToChanges).mockReturnValue(() => {});

      render(<Board now={start} />);
      // Pradinis užduočių/nustatymų gavimas vyksta per pažadėtą (jau
      // išspręstą) mock'ą — leidžiame mikrouždaviniams įvykti prieš tikrinant.
      await vi.waitFor(() => expect(screen.getByTestId('kolona-tomorrow')).toBeDefined());
      expect(within(screen.getByTestId('kolona-tomorrow')).getByText('Vidurnakčio užduotis')).toBeDefined();

      await vi.advanceTimersByTimeAsync(2 * 60_000); // peržengia vidurnaktį

      expect(
        within(screen.getByTestId('kolona-today')).getByText('Vidurnakčio užduotis'),
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
      grouping: 'date', theme: 'system', locale: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
      port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
      backup_dir: '', last_backup: null, last_backup_error: null,
      lan: false, has_pin: false, resolved_locale: 'lt',
    });
    vi.mocked(api.subscribeToChanges).mockImplementation((_onChange, onStatus) => {
      captured.onStatus = onStatus;
      return () => {};
    });
    render(<Board now={TODAY} />);
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

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

    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());
    expect(within(screen.getByTestId('kolona-today')).getByText('Padaryta šiandien')).toBeDefined();
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

    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-08-14' } });
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));

    expect(screen.queryByTestId('kolona-today')).toBeNull();
    expect(screen.getByText('Padaryta: 2')).toBeDefined();
    expect(screen.getByText('Sena užduotis')).toBeDefined();
    expect(screen.getByText('Nauja užduotis')).toBeDefined();
  });

  it('prioriteto filtras veikia ir laikotarpio peržiūroje', async () => {
    setup([
      task({ id: 'a', title: 'Svarbi padaryta', status: 'done', completed_at: '2026-08-14T09:00:00.000Z', priority: 1 }),
      task({ id: 'b', title: 'Eilinė padaryta', status: 'done', completed_at: '2026-08-14T09:00:00.000Z', priority: 3 }),
    ], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: 'Aukštas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));

    expect(screen.getByText('Padaryta: 1')).toBeDefined();
    expect(screen.getByText('Svarbi padaryta')).toBeDefined();
    expect(screen.queryByText('Eilinė padaryta')).toBeNull();
  });

  it('„Grįžti" grąžina kolonas', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));
    expect(screen.queryByTestId('kolona-today')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Grįžti' }));
    expect(screen.getByTestId('kolona-today')).toBeDefined();
  });

  it('tuščias laikotarpis paaiškinamas, o ne paliekamas tuščias', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-01-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));

    expect(screen.getByText('Padaryta: 0')).toBeDefined();
    expect(screen.getByText('Per šį laikotarpį nieko nepadaryta.')).toBeDefined();
  });

  it('apverstas intervalas išjungia mygtuką ir paaiškina', async () => {
    setup([], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-08-20' } });
    fireEvent.change(screen.getByLabelText('Iki'), { target: { value: '2026-08-10' } });

    expect((screen.getByRole('button', { name: 'Peržiūrėti' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Pradžios data vėlesnė už pabaigos.')).toBeDefined();
  });

  it('perjungus grupavimą peržiūra išjungiama', async () => {
    setup([task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })], 'completed');
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Peržiūrėti' }));
    expect(screen.queryByTestId('kolona-today')).toBeNull();

    // Grįžus į „Padaryta" turi būti kolonos, ne senas sąrašas.
    await userEvent.click(screen.getByRole('button', { name: 'Datos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Padaryta' }));

    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());
  });

  it('laikotarpio eilutės nėra kituose rodiniuose', async () => {
    setup([task({ id: 'a', title: 'A' })], 'date');
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    expect(screen.queryByLabelText('Nuo')).toBeNull();
  });
});

describe('Board — autentikacija', () => {
  it('gavusi 401 lenta rodo PIN ekraną vietoj užduočių', async () => {
    // Realiame pirmame apsilankyme be sesijos abu pradiniai užklausimai —
    // ir užduotys, ir nustatymai — gauna 401 vienu metu (žr. server/app.ts
    // grandinę: ji saugo visą /api, ne tik /api/tasks). Mokome abi, kad
    // testas netyčia nesiremtų ankstesnio testo paliktu `fetchSettings`
    // mock'o rezultatu (modulis automatiškai mockinamas failo viršuje, o
    // `vi.clearAllMocks()` `beforeEach` valo tik iškvietimų istoriją, ne
    // implementaciją).
    vi.spyOn(api, 'fetchTasks').mockRejectedValue(new api.UnauthorizedError());
    vi.spyOn(api, 'fetchSettings').mockRejectedValue(new api.UnauthorizedError());
    render(<Board now={new Date('2026-09-02T10:00:00')} />);
    expect(await screen.findByLabelText('PIN kodas')).toBeInTheDocument();
  });

  it('mutacija (varnelė) gavusi 401 taip pat rodo PIN ekraną', async () => {
    // Ne `reload()`, o `run()` apvalkalo atšaka — ji saugo VISAS mutacijas
    // (varnelę, trynimą, pervadinimą, tempimą), ne vien pradinį įkėlimą.
    // Sesija gali baigtis ir tada, kai lenta jau atidaryta ir rodo užduotis.
    setup([task({ id: 'a', title: 'A' })]);
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());

    vi.mocked(api.patchTask).mockRejectedValue(new api.UnauthorizedError());

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));

    expect(await screen.findByLabelText('PIN kodas')).toBeInTheDocument();
  });

  it('sėkmingas PIN įvedimas išvalo senesnę klaidos žinutę', async () => {
    // Netiesiogiai kviečiam `reload()` per SSE `onChange`, o ne per `run()`:
    // `run()` savo klaidą PATS išsivalo pradžioje (`setError(null)` prieš
    // veiksmą), tad juo šio scenarijaus atkurti negalima — reikalinga būtent
    // `reload()`, kuri savo tikrintuvo pradžioje klaidos nevalo (Board.tsx:78).
    let onChange: () => void = () => {};
    const settings: PublicSettings = {
      grouping: 'date', theme: 'system', locale: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
      port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
      backup_dir: '', last_backup: null, last_backup_error: null,
      lan: false, has_pin: false, resolved_locale: 'lt',
    };
    vi.mocked(api.fetchTasks).mockResolvedValue([task({ id: 'a', title: 'A' })]);
    vi.mocked(api.fetchSettings).mockResolvedValue(settings);
    vi.mocked(api.subscribeToChanges).mockImplementation((change, _onStatus) => {
      onChange = change;
      return () => {};
    });
    render(<Board now={TODAY} />);
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());

    // 1. Nesusijusi klaida per mutaciją — lieka rodoma klaidos juosta.
    vi.mocked(api.patchTask).mockRejectedValueOnce(new Error('Serverio klaida'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pažymėti atlikta' }));
    await waitFor(() => expect(screen.getByText('Serverio klaida')).toBeDefined());

    // 2. Sesija baigėsi — sekantis SSE atnaujinimas (reload) gauna 401.
    // Sena klaida NEIŠVALOMA — būtent tai ir yra tikrinamas defektas.
    vi.mocked(api.fetchTasks).mockRejectedValue(new api.UnauthorizedError());
    onChange();
    await screen.findByLabelText('PIN kodas');

    // 3. Vartotojas įveda teisingą PIN — lenta turi grįžti ŠVARI, be senos klaidos.
    vi.mocked(api.fetchTasks).mockResolvedValue([task({ id: 'a', title: 'A' })]);
    vi.spyOn(api, 'login').mockResolvedValue();
    await userEvent.type(screen.getByLabelText('PIN kodas'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    expect(screen.queryByText('Serverio klaida')).toBeNull();
  });

  it('po PIN įvedimo pakartoja nutrūkusią užduoties kūrimo užklausą', async () => {
    setup([]);
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    vi.mocked(api.createTask).mockRejectedValueOnce(new api.UnauthorizedError());
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Pirkti pieno{Enter}');

    // Parodomas PIN ekranas, o veiksmas laukia.
    await waitFor(() => expect(screen.getByLabelText('PIN kodas')).toBeDefined());
    expect(api.createTask).toHaveBeenCalledTimes(1);

    vi.mocked(api.login).mockResolvedValue(undefined);
    vi.mocked(api.createTask).mockResolvedValue(task({ id: 'n', title: 'Pirkti pieno' }));
    await userEvent.type(screen.getByLabelText('PIN kodas'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    // Ta pati užklausa pakartojama, o ne prarandama.
    await waitFor(() => expect(api.createTask).toHaveBeenCalledTimes(2));
  });

  it('pakartota užklausa nesikartoja antrą kartą po sekančio PIN įvedimo', async () => {
    // Po sėkmingo pakartojimo nuoroda į nutrūkusį veiksmą privalo būti
    // išvalyta — kitaip kitas PIN įvedimas (pvz., dėl visiškai kito, vėlesnio
    // 401) pakartotų SENĄ veiksmą dar kartą, sukurdamas dublikatą.
    setup([]);
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    vi.mocked(api.createTask).mockRejectedValueOnce(new api.UnauthorizedError());
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Pirkti pieno{Enter}');
    await waitFor(() => expect(screen.getByLabelText('PIN kodas')).toBeDefined());

    vi.mocked(api.login).mockResolvedValue(undefined);
    vi.mocked(api.createTask).mockResolvedValue(task({ id: 'n', title: 'Pirkti pieno' }));
    await userEvent.type(screen.getByLabelText('PIN kodas'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));
    await waitFor(() => expect(api.createTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByLabelText('PIN kodas')).toBeNull());

    // Sesija baigiasi dar kartą (nesusijusi priežastis — grupavimo keitimas,
    // ne užduoties kūrimas) — PIN ekranas grįžta.
    vi.mocked(api.patchSettings).mockRejectedValueOnce(new api.UnauthorizedError());
    await userEvent.click(screen.getByRole('button', { name: 'Progresas' }));
    await waitFor(() => expect(screen.getByLabelText('PIN kodas')).toBeDefined());

    vi.mocked(api.login).mockResolvedValue(undefined);
    await userEvent.type(screen.getByLabelText('PIN kodas'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    // `createTask` NEBĖRA kviečiamas trečią kartą — sena nuoroda buvo išvalyta.
    await waitFor(() => expect(screen.queryByLabelText('PIN kodas')).toBeNull());
    expect(api.createTask).toHaveBeenCalledTimes(2);
  });

  it('nesėkmingas pakartojimas po PIN vėl parodo PIN ekraną, o ne pakimba tyliai', async () => {
    setup([]);
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    vi.mocked(api.createTask).mockRejectedValueOnce(new api.UnauthorizedError());
    await userEvent.type(screen.getByLabelText('Nauja užduotis'), 'Pirkti pieno{Enter}');
    await waitFor(() => expect(screen.getByLabelText('PIN kodas')).toBeDefined());

    // PIN priimamas (naujas prisijungimas pavyksta), bet pati pakartota
    // užklausa VĖL grąžina 401 (pvz., sesija akimirksniu baigėsi iš naujo).
    vi.mocked(api.login).mockResolvedValue(undefined);
    vi.mocked(api.createTask).mockRejectedValueOnce(new api.UnauthorizedError());
    await userEvent.type(screen.getByLabelText('PIN kodas'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    // Programa negali likti tyliai pakibusi be jokio ekrano — PIN vėl rodomas.
    await waitFor(() => expect(api.createTask).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('PIN kodas')).toBeInTheDocument();
  });
});

describe('Board — kalba', () => {
  // Nustatymuose `locale` lieka numatytas `'system'`, o `resolved_locale`
  // šiuose testuose (be Electron testo apačioje) NIEKO nelemia: nuo šios
  // užduoties „system" ne-Electron lange ima ne serverio išspręstą kalbą, o
  // naršyklės. Be šio stub'o testai gautų failinį `navigator.language`
  // (nustatytą 'lt' visam failui, žr. pastabą failo viršuje) ir vietoj
  // angliškų tekstų gautų lietuviškus.
  const ORIGINALUS_USER_AGENT = window.navigator.userAgent;
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'language', { value: 'en', configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(window.navigator, 'language', { value: 'lt', configurable: true });
    // Vieninteliam testui žemiau reikia Electron žymės userAgent'e — grąžinam
    // atgal, kad ji „nenutekėtų" į kitus testus, jei kada pakistų tvarka.
    Object.defineProperty(window.navigator, 'userAgent', { value: ORIGINALUS_USER_AGENT, configurable: true });
  });

  it('angliškai kolonų antraštės ir juostos išverstos', async () => {
    // `resolved_locale` čia NEskaitomas — šioje (ne-Electron) šakoje kalbą
    // lemia vien `beforeEach` nustatytas `navigator.language`. Argumento
    // nerašome sąmoningai, kad skaitytojas nemanytų priešingai; Electron
    // šaka, kur `resolved_locale` kaip tik ir veikia, tikrinama atskirai
    // testu žemiau.
    setup([], 'date');
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    // Skaitoma `within` kolonos antraštę, ne visą ekraną: nuo šios užduoties
    // (1 užduotis, 2c dalis) `QuickAdd` visada rodo `DueEditor`, o jo „Today"
    // čipas sąmoningai dalijasi tuo pačiu tekstu su kolonos antrašte
    // (`bucketLabel`) — plikas `getByText('Today')` rastų abu ir kristų.
    expect(within(screen.getByTestId('kolona-today')).getByText('Today')).toBeDefined();
    expect(screen.getByText('Next 7 days')).toBeDefined();
  });

  it('anglų kalba „Padaryta" rodinio juostos ir suvestinė išverstos', async () => {
    setup(
      [task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })],
      'completed',
    );

    await waitFor(() => expect(screen.getByText('Completed this week: 1')).toBeDefined());
    expect(screen.getByLabelText('From')).toBeDefined();
    expect(screen.getByLabelText('To')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Show' })).toBeDefined();
  });

  it('anglų kalba laikotarpio peržiūra ir jos tekstai išversti', async () => {
    setup(
      [task({ id: 'a', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })],
      'completed',
    );
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    // Apverstas intervalas — įspėjimas anglų kalba.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-20' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-10' } });
    expect(screen.getByText('The start date is after the end date.')).toBeDefined();

    // Tuščias, bet teisingas intervalas — tuštumos paaiškinimas ir „Back".
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-01-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));

    expect(screen.getByText('Completed: 0')).toBeDefined();
    expect(screen.getByText('Nothing was completed in this period.')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('kolona-today')).toBeDefined();
  });

  it('anglų kalba rodo atsijungimo juostą ir kortelės tempimo žymę išverstas', async () => {
    const captured: { onStatus?: (s: 'connected' | 'disconnected') => void } = {};
    vi.mocked(api.fetchTasks).mockResolvedValue([task({ id: 'a', title: 'A' })]);
    vi.mocked(api.fetchSettings).mockResolvedValue({
      grouping: 'date', theme: 'system', locale: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
      port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
      backup_dir: '', last_backup: null, last_backup_error: null,
      lan: false, has_pin: false,
      // `resolved_locale` — privalomas `PublicSettings` laukas, bet šioje
      // (ne-Electron) šakoje jo NESKAITO niekas: kalbą lemia `beforeEach`
      // nustatytas `navigator.language`. Reikšmė čia tik užpildo tipą.
      resolved_locale: 'en',
    });
    vi.mocked(api.subscribeToChanges).mockImplementation((_onChange, onStatus) => {
      captured.onStatus = onStatus;
      return () => {};
    });
    render(<Board now={TODAY} />);
    await waitFor(() => expect(screen.getByText('A')).toBeDefined());
    expect(screen.getByLabelText('Task card, draggable')).toBeDefined();

    captured.onStatus!('disconnected');

    await waitFor(() => expect(screen.getByText('No connection to the server')).toBeDefined());
  });

  it('anglų kalba laikotarpio sąrašo atlikimo data išversta', async () => {
    setup(
      [task({ id: 'a', title: 'A', status: 'done', completed_at: '2026-08-14T09:00:00.000Z' })],
      'completed',
    );
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));

    expect(screen.getByText('August 14')).toBeDefined();
    expect(screen.queryByText('rugpjūčio 14')).toBeNull();
  });

  it('lango pavadinimas — programos vardas pasirinkta kalba', async () => {
    // `index.html` <title>Šarka</title> tėra pradinė reikšmė; Electron lango
    // antraštę ima iš `document.title`, tad ją nustato pati lenta.
    document.title = '';
    setup([], 'date');
    await waitFor(() => expect(document.title).toBe('Sharka'));
  });

  it('Electron lange „system" seka serverio, ne naršyklės kalbą', async () => {
    // Lemiamas testas: naršyklės ir serverio kalbos ČIA SĄMONINGAI
    // PRIEŠINGOS (naršyklė 'lt', serveris 'en'). Visi testai aukščiau šiame
    // apraše naršyklės kalbą turi tokią pat kaip norimą rezultatą, tad jie
    // praeitų net jei `localeOf` per klaidą imtų ne tą šaltinį — nė vienas jų
    // to nebūtų sugavęs (žr. peržiūros radinį). Jei `useLocale.ts` šakos
    // sukeistos vietomis arba Electron žymė ignoruojama, ši sąsaja rodytų
    // lietuviškus tekstus ir testas kristų.
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/43.0.0 Sarka/1.0.0',
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'language', { value: 'lt', configurable: true });

    setup([], 'date', { resolved_locale: 'en' });
    await waitFor(() => expect(screen.getByTestId('kolona-today')).toBeDefined());

    expect(within(screen.getByTestId('kolona-today')).getByText('Today')).toBeDefined();
    expect(screen.getByText('Next 7 days')).toBeDefined();
  });

});
