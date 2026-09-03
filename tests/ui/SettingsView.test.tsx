import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SettingsMap } from '../../src/core/settings.js';
import { SettingsView } from '../../src/ui/settings/SettingsView.js';

const SETTINGS: SettingsMap = {
  grouping: 'date', theme: 'system', sound: 'alarms', digest_times: ['10:00', '15:30'],
  port: 8080, hotkey: 'Ctrl+Alt+Space', autostart: true, last_digest: null,
  backup_dir: '', last_backup: null, last_backup_error: null,
  lan: false, pin_hash: null, pin_salt: null,
};

function renderView(over: Partial<SettingsMap> = {}) {
  const onChange = vi.fn();
  render(
    <SettingsView
      settings={{ ...SETTINGS, ...over }}
      lanUrls={['http://192.168.1.10:8080']}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('SettingsView', () => {
  it('rodo LAN adresą planšetei', () => {
    renderView();
    expect(screen.getByText('http://192.168.1.10:8080')).toBeDefined();
  });

  it('temos pasirinkimas perduodamas', async () => {
    const onChange = renderView();
    await userEvent.selectOptions(screen.getByLabelText('Tema'), 'dark');
    expect(onChange).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('garso pasirinkimas perduodamas', async () => {
    const onChange = renderView();
    await userEvent.selectOptions(screen.getByLabelText('Garsas'), 'off');
    expect(onChange).toHaveBeenCalledWith({ sound: 'off' });
  });

  it('autostarto jungiklis perduodamas', async () => {
    const onChange = renderView();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Paleisti su Windows' }));
    expect(onChange).toHaveBeenCalledWith({ autostart: false });
  });

  it('portą išsaugo tik nuėjus nuo lauko, ne su kiekvienu klavišu', () => {
    const onChange = renderView();
    const laukas = screen.getByLabelText('Portas');

    // Rašant tarpinės reikšmės neturi keliauti į serverį — kitaip „9090"
    // įrašytų 9, 90, 909 ir 9090, o pasitraukus įpusėjus liktų dalinis portas.
    fireEvent.change(laukas, { target: { value: '9' } });
    fireEvent.change(laukas, { target: { value: '90' } });
    fireEvent.change(laukas, { target: { value: '9090' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(laukas);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ port: 9090 });
    expect(screen.getByText('Portas įsigalios paleidus programą iš naujo')).toBeDefined();
  });

  it('netinkamą portą grąžina į ankstesnę reikšmę', () => {
    const onChange = renderView();
    const laukas = screen.getByLabelText('Portas');

    fireEvent.change(laukas, { target: { value: '70000' } });
    fireEvent.blur(laukas);

    expect(onChange).not.toHaveBeenCalled();
    expect((laukas as HTMLInputElement).value).toBe('8080');
  });

  it('karštasis klavišas nuskaitomas iš paspaudimo', () => {
    const onChange = renderView();
    fireEvent.keyDown(screen.getByLabelText('Karštasis klavišas'), {
      key: 't', ctrlKey: true, altKey: true,
    });
    expect(onChange).toHaveBeenCalledWith({ hotkey: 'Ctrl+Alt+T' });
  });

  it('Tab klavišas karštojo klavišo lauke neužblokuojamas', () => {
    renderView();
    const laukas = screen.getByLabelText('Karštasis klavišas');
    expect(fireEvent.keyDown(laukas, { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(laukas, { key: 'Tab', shiftKey: true })).toBe(true);
  });

  it('portas priimamas tik 1-65535 diapazone sveikas skaičius', () => {
    // `change` savaime niekada nekviečia `onChange` — laukas taiso reikšmę
    // tik nuėjus nuo lauko (`blur`), žr. testą aukščiau. Be `blur` čia šis
    // testas praeitų net jei visa diapazono patikra būtų ištrinta iš
    // `SettingsView.tsx`, tad tikriname ir grąžinimą į ankstesnę reikšmę.
    const onChange = renderView();
    const laukas = screen.getByLabelText('Portas') as HTMLInputElement;

    fireEvent.change(laukas, { target: { value: '70000' } });
    fireEvent.blur(laukas);
    expect(onChange).not.toHaveBeenCalled();
    expect(laukas.value).toBe('8080');

    fireEvent.change(laukas, { target: { value: '0' } });
    fireEvent.blur(laukas);
    expect(onChange).not.toHaveBeenCalled();
    expect(laukas.value).toBe('8080');

    fireEvent.change(laukas, { target: { value: '8081.5' } });
    fireEvent.blur(laukas);
    expect(onChange).not.toHaveBeenCalled();
    expect(laukas.value).toBe('8080');
  });

  it('apžvalgos laikas priimamas tik atpažintas', async () => {
    const onChange = renderView();
    const laukas = screen.getAllByLabelText('Apžvalgos laikas')[0];

    fireEvent.change(laukas, { target: { value: '0930' } });
    fireEvent.blur(laukas);
    expect(onChange).toHaveBeenCalledWith({ digest_times: ['09:30', '15:30'] });

    onChange.mockClear();
    fireEvent.change(laukas, { target: { value: '99:99' } });
    fireEvent.blur(laukas);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rodo kopijų aplanką ir leidžia jį pakeisti nuėjus nuo lauko', () => {
    const onChange = renderView({ backup_dir: 'D:\\Kopijos' });
    const laukas = screen.getByLabelText('Kopijų aplankas');
    expect((laukas as HTMLInputElement).value).toBe('D:\\Kopijos');

    fireEvent.change(laukas, { target: { value: 'E:\\Kitas' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(laukas);
    expect(onChange).toHaveBeenCalledWith({ backup_dir: 'E:\\Kitas' });
  });

  // `SettingsView` neturi bendro gyvo laikrodžio prop'o (žr. komentarą prie
  // `today` komponente) — datos formatavimas ima „šiandien" iš tikro
  // `new Date()`, tad šie testai suklastoja sistemos laiką, kad rezultatas
  // nepriklausytų nuo to, kada realiai paleista testų eiga.
  it('rodo paskutinės kopijos būseną', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 14));
      renderView({ backup_dir: 'D:\\Kopijos', last_backup: '2026-08-17' });
      expect(screen.getByText('Paskutinė kopija: rugpjūčio 17')).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('nepavykusią kopiją parodo su priežastimi', () => {
    renderView({ backup_dir: 'D:\\Kopijos', last_backup_error: 'ENOENT: kelias nerastas' });
    expect(screen.getByText(/nepavyko/i)).toBeDefined();
    expect(screen.getByText(/ENOENT: kelias nerastas/)).toBeDefined();
  });

  it('dar nedarytą kopiją pasako aiškiai', () => {
    renderView({ backup_dir: 'D:\\Kopijos' });
    expect(screen.getByText('Paskutinė kopija: dar nedaryta')).toBeDefined();
  });

  it('ištuštintas aplanko laukas rodo kopijas kaip išjungtas, o ne seną sėkmę (4 radinys)', () => {
    // Vartotojas pažymėjo viską ir ištrynė lauką — kopijos išjungtos VISAM
    // LAIKUI, bet be šio pataisymo būsenos eilutė toliau rodytų seniausios
    // sėkmės datą, lyg viskas tebeveiktų.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 14));
      renderView({ backup_dir: '', last_backup: '2026-08-10' });
      expect(screen.getByText('Atsarginės kopijos išjungtos — aplankas nenurodytas')).toBeDefined();
      expect(screen.queryByText(/Paskutinė kopija: rugpjūčio 10/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('nepavykus rodo IR paskutinę sėkmingą datą (5 radinys)', () => {
    // Gedimo metu „kiek sena mano naujausia gera kopija" yra vertingiausias
    // faktas ekrane — jis neturi dingti vien todėl, kad paskutinis bandymas
    // nepavyko.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 14));
      renderView({
        backup_dir: 'D:\\Kopijos',
        last_backup: '2026-08-15',
        last_backup_error: 'ENOENT: kelias nerastas',
      });
      expect(screen.getByText(/Paskutinė kopija: rugpjūčio 15/)).toBeDefined();
      expect(screen.getByText(/nepavyko/i)).toBeDefined();
      expect(screen.getByText(/ENOENT: kelias nerastas/)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('nepavykus be jokios ankstesnės sėkmės rodo „dar nedaryta" (5 radinys)', () => {
    renderView({
      backup_dir: 'D:\\Kopijos',
      last_backup: null,
      last_backup_error: 'ENOENT: kelias nerastas',
    });
    expect(screen.getByText(/Paskutinė kopija: dar nedaryta/)).toBeDefined();
    expect(screen.getByText(/nepavyko/i)).toBeDefined();
  });

  describe('Kopijų aplanko parinkimo mygtukas (E radinys)', () => {
    afterEach(() => {
      delete (window as { sarka?: unknown }).sarka;
    });

    it('mygtuko nėra, kai preload tiltas nepasiekiamas (naršyklė be Electron)', () => {
      renderView();
      expect(screen.queryByRole('button', { name: 'Parinkti aplanką' })).toBeNull();
    });

    it('mygtukas rodomas ir paspaudus įrašo grąžintą kelią, kai tiltas yra', async () => {
      const pickBackupDir = vi.fn().mockResolvedValue('D:\\Nauja');
      (window as unknown as { sarka: { pickBackupDir: typeof pickBackupDir } }).sarka = {
        pickBackupDir,
      };
      const onChange = renderView();

      const mygtukas = screen.getByRole('button', { name: 'Parinkti aplanką' });
      await userEvent.click(mygtukas);

      expect(pickBackupDir).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ backup_dir: 'D:\\Nauja' });
      expect((screen.getByLabelText('Kopijų aplankas') as HTMLInputElement).value).toBe('D:\\Nauja');
    });
  });
});
