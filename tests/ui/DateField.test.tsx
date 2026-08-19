import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateField } from '../../src/ui/components/DateField.js';

const TODAY = '2026-08-19';

function renderField(value = '', onChange = vi.fn()) {
  render(<DateField label="Data" value={value} today={TODAY} onChange={onChange} />);
  return onChange;
}

const atidaryk = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Data — kalendorius' }));
};

describe('DateField', () => {
  it('laukas rodo reikšmę yyyy-mm-dd formatu ir turi tokią pat užuominą', () => {
    renderField('2026-08-20');
    const input = screen.getByLabelText('Data') as HTMLInputElement;
    expect(input.value).toBe('2026-08-20');
    // Natyviam `<input type="date">` `placeholder` negalioja, ir lietuvių
    // lokalėje jis pats piešė „mmmm-mm-dd". Savame lauke užuominą nurodom mes.
    expect(input.getAttribute('placeholder')).toBe('yyyy-mm-dd');
  });

  it('kalendoriaus antraštė lietuviška, mėnuo vardininku', async () => {
    renderField('2026-08-20');
    await atidaryk();
    expect(screen.getByText('2026 rugpjūtis')).toBeDefined();
  });

  it('savaitė prasideda pirmadieniu', async () => {
    renderField('2026-08-20');
    await atidaryk();
    const dienos = document.querySelectorAll('.savaites-dienos span');
    expect([...dienos].map((d) => d.textContent)).toEqual(['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk']);
  });

  it('paspaudus dieną praneša datą ir užsidaro', async () => {
    const onChange = renderField('2026-08-20');
    await atidaryk();

    await userEvent.click(document.querySelector('[data-data="2026-08-25"]') as HTMLElement);

    expect(onChange).toHaveBeenCalledWith('2026-08-25');
    expect(screen.queryByText('2026 rugpjūtis')).toBeNull();
  });

  it('mėnesio vertimas eina per metų ribą', async () => {
    renderField('2026-12-10');
    await atidaryk();
    expect(screen.getByText('2026 gruodis')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Kitas mėnuo' }));

    expect(screen.getByText('2027 sausis')).toBeDefined();
  });

  it('be reikšmės atsiveria šios dienos mėnuo', async () => {
    renderField('');
    await atidaryk();
    expect(screen.getByText('2026 rugpjūtis')).toBeDefined();
  });

  it('pusiau surinkta data nekeliauja į viršų, o pilna — keliauja', async () => {
    const onChange = renderField('');
    const input = screen.getByLabelText('Data');

    await userEvent.type(input, '2026-08-2');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(input, '0');
    expect(onChange).toHaveBeenCalledWith('2026-08-20');
  });

  it('neegzistuojanti diena atmetama ir nuėjus nuo lauko atstatoma', async () => {
    const onChange = renderField('2026-08-20');
    const input = screen.getByLabelText('Data') as HTMLInputElement;

    await userEvent.clear(input);
    await userEvent.type(input, '2026-02-31');
    expect(onChange).not.toHaveBeenCalledWith('2026-02-31');

    await userEvent.tab();
    expect(input.value).toBe('2026-08-20');
  });

  // Ta pati klaidų šeima kaip `TaskCard` Escape atveju: tray langelis klausosi
  // Escape ant `window`, tad nesustabdytas įvykis uždarytų visą langelį vietoj
  // vieno kalendoriaus.
  it('Escape uždaro kalendorių ir neprasiskverbia iki lango', async () => {
    renderField('2026-08-20');
    await atidaryk();
    expect(screen.getByText('2026 rugpjūtis')).toBeDefined();

    const langoKlausytojas = vi.fn();
    window.addEventListener('keydown', langoKlausytojas);

    screen.getByLabelText('Data').focus();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText('2026 rugpjūtis')).toBeNull();
    const escapeIvykiai = langoKlausytojas.mock.calls.filter(
      ([e]) => (e as KeyboardEvent).key === 'Escape',
    );
    expect(escapeIvykiai).toHaveLength(0);

    window.removeEventListener('keydown', langoKlausytojas);
  });
});
