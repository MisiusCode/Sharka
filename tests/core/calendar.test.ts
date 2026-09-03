import { describe, expect, it } from 'vitest';
import {
  isValidDateString,
  LITHUANIAN_WEEKDAYS_SHORT,
  monthGrid,
  monthTitle,
  monthTitleIn,
  shiftMonth,
  WEEKDAYS_SHORT,
} from '../../src/core/calendar.js';

describe('isValidDateString', () => {
  it('priima tikrą datą', () => {
    expect(isValidDateString('2026-08-19')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true); // keliamieji metai
  });

  it('atmeta neteisingą formatą', () => {
    for (const bloga of ['', '2026-8-19', '19/08/2026', '2026-08-19T10:00', 'labas']) {
      expect(isValidDateString(bloga)).toBe(false);
    }
  });

  // Formatą atitinka, bet tokios dienos nėra. Be šito `new Date` tyliai
  // persiverstų į kitą mėnesį, ir naudotojas gautų datą, kurios nepasirinko.
  it('atmeta neegzistuojančią dieną', () => {
    expect(isValidDateString('2026-02-31')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2025-02-29')).toBe(false); // ne keliamieji
  });
});

describe('monthGrid', () => {
  it('visada grąžina 42 dienas, kad kalendorius nekeistų aukščio', () => {
    // Vasaris 2026 prasideda sekmadienį — trumpiausias įmanomas atvejis.
    expect(monthGrid(2026, 2)).toHaveLength(42);
    // Rugpjūtis 2026 prasideda šeštadienį — reikalauja šešių savaičių.
    expect(monthGrid(2026, 8)).toHaveLength(42);
  });

  it('prasideda pirmadieniu, ne sekmadieniu', () => {
    // 2026-08-01 yra šeštadienis, tad pirma tinklelio diena — liepos 27,
    // pirmadienis. Angliška lokalė čia rodytų liepos 26, sekmadienį.
    const grid = monthGrid(2026, 8);
    expect(grid[0].date).toBe('2026-07-27');
    expect(new Date(2026, 6, 27).getDay()).toBe(1);
  });

  it('mėnesio dienas atskiria nuo užpildo', () => {
    const grid = monthGrid(2026, 8);
    expect(grid[0].inMonth).toBe(false);
    expect(grid.find((d) => d.date === '2026-08-01')?.inMonth).toBe(true);
    expect(grid.find((d) => d.date === '2026-08-31')?.inMonth).toBe(true);
    expect(grid.find((d) => d.date === '2026-09-01')?.inMonth).toBe(false);
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
  });

  it('eina be tarpų nuo pradžios iki pabaigos', () => {
    const grid = monthGrid(2026, 2);
    for (let i = 1; i < grid.length; i += 1) {
      const ankstesne = new Date(grid[i - 1].date);
      const dabartine = new Date(grid[i].date);
      expect(dabartine.getTime() - ankstesne.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });
});

describe('shiftMonth', () => {
  it('verčia per metų ribą į abi puses', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('juda per kelis mėnesius', () => {
    expect(shiftMonth(2026, 8, 5)).toEqual({ year: 2027, month: 1 });
  });
});

describe('monthTitle', () => {
  it('rašo mėnesį vardininku', () => {
    expect(monthTitle(2026, 8)).toBe('2026 rugpjūtis');
    expect(monthTitle(2027, 1)).toBe('2027 sausis');
  });
});

describe('LITHUANIAN_WEEKDAYS_SHORT', () => {
  it('septynios dienos, pirmadienis pirmas', () => {
    expect(LITHUANIAN_WEEKDAYS_SHORT).toHaveLength(7);
    expect(LITHUANIAN_WEEKDAYS_SHORT[0]).toBe('Pr');
    expect(LITHUANIAN_WEEKDAYS_SHORT[6]).toBe('Sk');
  });

  it('mėnesio antraštė kiekvienoje kalboje savo tvarka', () => {
    // Lietuviškai metai eina pirma, angliškai — po mėnesio.
    expect(monthTitleIn('lt', 2026, 9)).toBe('2026 rugsėjis');
    expect(monthTitleIn('en', 2026, 9)).toBe('September 2026');
  });

  it('savaitės dienos yra abiem kalbomis ir abi prasideda pirmadieniu', () => {
    expect(WEEKDAYS_SHORT.lt[0]).toBe('Pr');
    expect(WEEKDAYS_SHORT.en[0]).toBe('Mon');
    expect(WEEKDAYS_SHORT.lt).toHaveLength(7);
    expect(WEEKDAYS_SHORT.en).toHaveLength(7);
  });

  it('senieji lietuviški eksportai nepasikeitė', () => {
    expect(LITHUANIAN_WEEKDAYS_SHORT).toEqual(WEEKDAYS_SHORT.lt);
    expect(monthTitle(2026, 9)).toBe(monthTitleIn('lt', 2026, 9));
  });
});
