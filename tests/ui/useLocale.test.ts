import { describe, expect, it } from 'vitest';
import { localeOf } from '../../src/ui/useLocale.js';

describe('localeOf', () => {
  it('ima išspręstą kalbą iš nustatymų', () => {
    expect(localeOf({ resolved_locale: 'en' } as never)).toBe('en');
  });

  // Kol nustatymai dar neatkeliavo, rodom lietuvišką sąsają: tai kalba,
  // kuria programa kalbėjo iki šiol, tad blyksnis nepastebimas.
  it('be nustatymų grąžina lietuvių', () => {
    expect(localeOf(null)).toBe('lt');
  });

  it('planšetėje „system" seka naršyklės kalbą, ne serverio', () => {
    const nustatymai = { locale: 'system', resolved_locale: 'lt' } as never;
    expect(localeOf(nustatymai, { userAgent: 'Mozilla/5.0', language: 'en-GB' })).toBe('en');
  });

  it('Electron lange lieka serverio išspręsta kalba', () => {
    const nustatymai = { locale: 'system', resolved_locale: 'lt' } as never;
    expect(localeOf(nustatymai, { userAgent: 'Mozilla/5.0 Electron/43.0.0', language: 'en-GB' })).toBe('lt');
  });

  it('aiškiai pasirinkta kalba nugali visur', () => {
    const nustatymai = { locale: 'en', resolved_locale: 'en' } as never;
    expect(localeOf(nustatymai, { userAgent: 'Mozilla/5.0', language: 'lt-LT' })).toBe('en');
  });
});
