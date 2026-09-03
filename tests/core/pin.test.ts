import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, verifyPin } from '../../src/core/pin.js';

describe('isValidPin', () => {
  it('priima 4–8 skaitmenis', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
  });

  it('atmeta per trumpą, per ilgą, ne skaitmenis ir ne eilutę', () => {
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('')).toBe(false);
    expect(isValidPin(1234)).toBe(false);
    expect(isValidPin(null)).toBe(false);
  });
});

describe('hashPin ir verifyPin', () => {
  it('tas pats PIN su skirtingomis druskomis duoda skirtingas maišas', () => {
    const a = hashPin('1234');
    const b = hashPin('1234');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('teisingas PIN patvirtinamas, neteisingas — ne', () => {
    const stored = hashPin('4321');
    expect(verifyPin('4321', stored)).toBe(true);
    expect(verifyPin('1234', stored)).toBe(false);
  });

  // Sugadinta reikšmė bazėje neturi kelti išimties: `timingSafeEqual` meta,
  // kai buferių ilgiai skiriasi, o tokia klaida nukristų iš maršruto vidurio.
  it('sugadinta saugoma maiša grąžina false, o ne išimtį', () => {
    expect(verifyPin('4321', { hash: 'ab', salt: 'cd' })).toBe(false);
  });

  it('netinkamo formato PIN atmetamas netikrinant maišos', () => {
    const stored = hashPin('4321');
    expect(verifyPin('43', stored)).toBe(false);
  });
});
