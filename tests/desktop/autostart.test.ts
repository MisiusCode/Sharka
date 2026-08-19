import { describe, expect, it } from 'vitest';
import { syncAutostart, type AutostartApi } from '../../src/desktop/autostart.js';

function fakeApi(initial: boolean): AutostartApi & { calls: boolean[] } {
  let value = initial;
  const calls: boolean[] = [];
  return {
    calls,
    get: () => value,
    set: (enabled) => { value = enabled; calls.push(enabled); },
  };
}

describe('syncAutostart', () => {
  it('įjungia, kai sistemoje išjungta', () => {
    const api = fakeApi(false);
    syncAutostart(true, api);
    expect(api.calls).toEqual([true]);
  });

  it('nieko nedaro, kai jau sutampa', () => {
    const api = fakeApi(true);
    syncAutostart(true, api);
    expect(api.calls).toEqual([]);
  });

  it('išjungia, kai sistemoje įjungta', () => {
    const api = fakeApi(true);
    syncAutostart(false, api);
    expect(api.calls).toEqual([false]);
  });
});
