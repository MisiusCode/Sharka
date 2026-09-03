import { describe, expect, it } from 'vitest';
import { LOCALES, MESSAGES, priorityLabel, statusLabel, t } from '../../src/core/i18n.js';

describe('žinučių lentelės', () => {
  // TypeScript raktų sutapimą užtikrina jau kompiliuojant (angliška lentelė
  // aprašyta kaip `Record<MessageKey, string>`), bet testas lieka: jis pagauta
  // atvejį, kai tipas kada nors būtų praplėstas iki `string`.
  it('abiejų kalbų raktų aibės sutampa', () => {
    const lt = Object.keys(MESSAGES.lt).sort();
    const en = Object.keys(MESSAGES.en).sort();
    expect(en).toEqual(lt);
  });

  it('nė viena reikšmė nėra tuščia', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value, `${locale}/${key}`).not.toBe('');
      }
    }
  });
});

describe('t', () => {
  it('grąžina reikšmę pagal kalbą', () => {
    expect(t('lt', 'bucket.today')).toBe('Šiandien');
    expect(t('en', 'bucket.today')).toBe('Today');
  });

  it('įstato parametrus', () => {
    expect(t('lt', 'repeat.monthday', { day: 15 })).toBe('kas 15 dieną');
    expect(t('en', 'repeat.monthday', { day: 15 })).toBe('on day 15 of each month');
  });

  // Neatpažintas vietaženklis paliekamas kaip yra, o ne verčiamas į
  // „undefined": tekste likęs `{day}` iš karto matomas kaip klaida, o
  // „undefined" atrodo kaip tikras žodis.
  it('nepaduotą parametrą palieka nepakeistą', () => {
    expect(t('lt', 'repeat.monthday', {})).toBe('kas {day} dieną');
  });
});

describe('statusLabel ir priorityLabel', () => {
  it('grąžina abiejų kalbų pavadinimus', () => {
    expect(statusLabel('lt', 'todo')).toBe('Reikia padaryti');
    expect(statusLabel('en', 'todo')).toBe('To do');
    expect(priorityLabel('lt', 1)).toBe('Aukštas');
    expect(priorityLabel('en', 3)).toBe('Low');
  });
});
