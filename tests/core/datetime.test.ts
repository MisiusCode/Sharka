import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/core/clock.js';
import {
  addDays, dateOf, formatLithuanianDate, formatLocalDate, formatLocalDateTime, timeOf,
} from '../../src/core/datetime.js';

describe('fixedClock', () => {
  it('grąžina nustatytą laiką ir leidžia jį pastumti', () => {
    const clock = fixedClock('2026-08-14T10:00:00');
    expect(formatLocalDateTime(clock.now())).toBe('2026-08-14T10:00');
    clock.advance(90 * 60 * 1000);
    expect(formatLocalDateTime(clock.now())).toBe('2026-08-14T11:30');
  });
});

describe('datetime', () => {
  it('formatuoja vietinę datą su nuliais', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05');
    expect(formatLocalDateTime(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
  });

  it('prideda dienas per mėnesio ir metų ribą', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-28', 8)).toBe('2027-01-05');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('atskiria datos ir laiko dalis', () => {
    expect(dateOf('2026-08-14T18:00')).toBe('2026-08-14');
    expect(dateOf('2026-08-14')).toBe('2026-08-14');
    expect(timeOf('2026-08-14T18:00')).toBe('18:00');
    expect(timeOf('2026-08-14')).toBeNull();
  });

  it('formatuoja lietuvišką datą su mėnesio pavadinimu', () => {
    expect(formatLithuanianDate('2026-08-20', '2026-08-14')).toBe('rugpjūčio 20');
  });

  it('formatuoja lietuvišką datą su laiku', () => {
    expect(formatLithuanianDate('2026-08-20T18:00', '2026-08-14')).toBe('rugpjūčio 20, 18:00');
  });

  it('rodo metus, kai data kitais metais nei šiandien', () => {
    expect(formatLithuanianDate('2027-01-05', '2026-08-14')).toBe('2027 m. sausio 5');
  });

  it('rodo metus ir laiką, kai data kitais metais nei šiandien', () => {
    expect(formatLithuanianDate('2027-01-05T09:30', '2026-08-14')).toBe('2027 m. sausio 5, 09:30');
  });

  it('teisingai formatuoja keliamųjų metų vasario 29-ą', () => {
    expect(formatLithuanianDate('2028-02-29', '2028-01-01')).toBe('vasario 29');
  });

  it('nepridedą nulio prieš vienaženklę dieną', () => {
    expect(formatLithuanianDate('2026-08-05', '2026-08-14')).toBe('rugpjūčio 5');
  });
});
