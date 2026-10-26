import { describe, expect, it } from 'vitest';
import { parseTimeInput, resolveDue } from '../../src/core/timeinput.js';

const NOW = new Date(2026, 7, 14, 10, 0); // 2026-08-14 10:00 vietinis

describe('parseTimeInput', () => {
  it('atpažįsta visus tris rašymo būdus', () => {
    expect(parseTimeInput('18', 'lt')).toBe('18:00');
    expect(parseTimeInput('18:00', 'lt')).toBe('18:00');
    expect(parseTimeInput('1800', 'lt')).toBe('18:00');
    expect(parseTimeInput('9:05', 'lt')).toBe('09:05');
    expect(parseTimeInput('0905', 'lt')).toBe('09:05');
  });

  it('praleidžia tarpus ir tuščią eilutę laiko nelaiko', () => {
    expect(parseTimeInput('  18:30 ', 'lt')).toBe('18:30');
    expect(parseTimeInput('', 'lt')).toBeNull();
    expect(parseTimeInput('   ', 'lt')).toBeNull();
  });

  it('atmeta neteisingas reikšmes', () => {
    expect(parseTimeInput('25:00', 'lt')).toBeNull();
    expect(parseTimeInput('18:60', 'lt')).toBeNull();
    expect(parseTimeInput('abc', 'lt')).toBeNull();
    expect(parseTimeInput('18:0:0', 'lt')).toBeNull();
  });

  it('angliškai priimamas AM/PM įvedimas', () => {
    expect(parseTimeInput('6pm', 'en')).toBe('18:00');
    expect(parseTimeInput('6:30 PM', 'en')).toBe('18:30');
    expect(parseTimeInput('12am', 'en')).toBe('00:00');
    expect(parseTimeInput('12pm', 'en')).toBe('12:00');
    // 24 val. įvedimas angliškai irgi lieka priimamas — niekas neatimama.
    expect(parseTimeInput('18:00', 'en')).toBe('18:00');
  });

  it('lietuviškai AM/PM neatpažįstamas, o 24 val. veikia kaip anksčiau', () => {
    expect(parseTimeInput('6pm', 'lt')).toBeNull();
    expect(parseTimeInput('1800', 'lt')).toBe('18:00');
    expect(parseTimeInput('18', 'lt')).toBe('18:00');
  });

  it('negalimos AM/PM valandos atmetamos', () => {
    expect(parseTimeInput('0pm', 'en')).toBeNull();
    expect(parseTimeInput('13pm', 'en')).toBeNull();
  });
});

describe('resolveDue', () => {
  it('šiandien be laiko reiškia jokios datos', () => {
    expect(resolveDue('today', null, NOW)).toEqual({ due_at: null, due_has_time: false, remind_at: null });
  });

  it('šiandien su laiku duoda žadintuvą šiai dienai', () => {
    expect(resolveDue('today', '18:00', NOW)).toEqual({
      due_at: '2026-08-14T18:00', due_has_time: true, remind_at: '2026-08-14T18:00',
    });
  });

  it('šiandien su jau praėjusia valanda perkelia į rytdieną', () => {
    expect(resolveDue('today', '08:00', NOW).due_at).toBe('2026-08-15T08:00');
  });

  it('rytoj be laiko duoda datą be žadintuvo', () => {
    expect(resolveDue('tomorrow', null, NOW)).toEqual({
      due_at: '2026-08-15', due_has_time: false, remind_at: null,
    });
  });

  it('konkreti data su laiku ir be jo', () => {
    expect(resolveDue({ date: '2026-09-01' }, '07:30', NOW).due_at).toBe('2026-09-01T07:30');
    expect(resolveDue({ date: '2026-09-01' }, null, NOW)).toEqual({
      due_at: '2026-09-01', due_has_time: false, remind_at: null,
    });
  });

  it('konkreti praeities data su praėjusiu laiku nekeliama į priekį', () => {
    expect(resolveDue({ date: '2026-08-14' }, '08:00', NOW).due_at).toBe('2026-08-14T08:00');
  });
});
