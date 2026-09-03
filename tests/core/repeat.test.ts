import { describe, expect, it } from 'vitest';
import { isValidRepeat, nextOccurrence, repeatLabel } from '../../src/core/repeat.js';

describe('isValidRepeat', () => {
  it('priima savaitės ir mėnesio dienas ribose', () => {
    for (const ok of ['w:1', 'w:7', 'm:1', 'm:15', 'm:31']) {
      expect(isValidRepeat(ok)).toBe(true);
    }
  });

  it('atmeta reikšmes už ribų ir sugadintas', () => {
    for (const bad of ['w:0', 'w:8', 'm:0', 'm:32', 'd:3', 'w:', 'w', '', 'w:1:2', 'W:1', 7, null]) {
      expect(isValidRepeat(bad)).toBe(false);
    }
  });

  it('atmeta nekanonines reikšmes su pirmaujančiu nuliu (9 radinys)', () => {
    // `<select>` sąraše nėra `w:01` ar `m:07` — tik `w:1`, `m:7` ir pan. Tokia
    // reikšmė iš API praeitų senuoju \d{1,2} šablonu, bet kortelėje `<select>`
    // liktų be pasirinkimo.
    for (const bad of ['w:01', 'm:07', 'm:00']) {
      expect(isValidRepeat(bad)).toBe(false);
    }
  });
});

describe('repeatLabel', () => {
  it('rašo lietuviškai', () => {
    expect(repeatLabel('lt', 'w:2')).toBe('kas antradienį');
    expect(repeatLabel('lt', 'w:7')).toBe('kas sekmadienį');
    expect(repeatLabel('lt', 'm:15')).toBe('kas 15 dieną');
  });

  it('kartojimo pavadinimas yra abiem kalbomis', () => {
    expect(repeatLabel('lt', 'w:1')).toBe('kas pirmadienį');
    expect(repeatLabel('en', 'w:1')).toBe('every Monday');
    expect(repeatLabel('lt', 'm:15')).toBe('kas 15 dieną');
    expect(repeatLabel('en', 'm:15')).toBe('on day 15 of each month');
  });

  it('sekmadienis yra septintas abiejose kalbose', () => {
    expect(repeatLabel('lt', 'w:7')).toBe('kas sekmadienį');
    expect(repeatLabel('en', 'w:7')).toBe('every Sunday');
  });
});

describe('nextOccurrence — savaitės diena', () => {
  // 2026-08-17 yra pirmadienis.
  it('kai šiandien ta pati diena, grąžina po septynių dienų', () => {
    expect(nextOccurrence('w:1', '2026-08-17')).toBe('2026-08-24');
  });

  it('kai diena dar bus šią savaitę', () => {
    expect(nextOccurrence('w:2', '2026-08-17')).toBe('2026-08-18');
    expect(nextOccurrence('w:7', '2026-08-17')).toBe('2026-08-23');
  });

  it('kai diena jau praėjo, imama kitos savaitės', () => {
    // 2026-08-19 yra trečiadienis; antradienis jau praėjo.
    expect(nextOccurrence('w:2', '2026-08-19')).toBe('2026-08-25');
  });

  it('peršoka per metų ribą', () => {
    // 2026-12-28 yra pirmadienis.
    expect(nextOccurrence('w:5', '2026-12-28')).toBe('2027-01-01');
  });
});

describe('nextOccurrence — mėnesio diena', () => {
  it('kai diena dar bus šį mėnesį', () => {
    expect(nextOccurrence('m:15', '2026-08-10')).toBe('2026-08-15');
  });

  it('kai diena jau praėjo, imamas kitas mėnuo', () => {
    expect(nextOccurrence('m:15', '2026-08-20')).toBe('2026-09-15');
  });

  it('kai šiandien ta pati diena, imamas kitas mėnuo', () => {
    expect(nextOccurrence('m:15', '2026-08-15')).toBe('2026-09-15');
  });

  it('31 dieną trumpesniuose mėnesiuose apkerpa iki paskutinės', () => {
    expect(nextOccurrence('m:31', '2026-04-05')).toBe('2026-04-30');
    expect(nextOccurrence('m:31', '2026-02-05')).toBe('2026-02-28');
    expect(nextOccurrence('m:31', '2028-02-05')).toBe('2028-02-29');
  });

  it('peršoka per metų ribą', () => {
    expect(nextOccurrence('m:5', '2026-12-10')).toBe('2027-01-05');
  });

  it('paskutinę mėnesio dieną su apkirpimu keliauja į kitą mėnesį', () => {
    // Balandžio 30 yra ir „31-a apkirpta" — tad kitas kartas gegužę.
    expect(nextOccurrence('m:31', '2026-04-30')).toBe('2026-05-31');
  });
});
