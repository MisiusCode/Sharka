import { describe, expect, it } from 'vitest';
import { shouldPlaySound } from '../../src/desktop/sound.js';

describe('shouldPlaySound', () => {
  it('„Visada" groja abiem', () => {
    expect(shouldPlaySound('always', 'alarm')).toBe(true);
    expect(shouldPlaySound('always', 'digest')).toBe(true);
  });

  it('„Tik žadintuvams" apžvalgą palieka tylią', () => {
    expect(shouldPlaySound('alarms', 'alarm')).toBe(true);
    expect(shouldPlaySound('alarms', 'digest')).toBe(false);
  });

  it('„Išjungta" nutildo viską', () => {
    expect(shouldPlaySound('off', 'alarm')).toBe(false);
    expect(shouldPlaySound('off', 'digest')).toBe(false);
  });
});
