import { describe, expect, it, vi } from 'vitest';
import { createHotkeyManager, type ShortcutApi } from '../../src/desktop/hotkey.js';

function fakeApi(succeeds = true): ShortcutApi & { registered: string[]; unregistered: string[] } {
  const registered: string[] = [];
  const unregistered: string[] = [];
  return {
    registered,
    unregistered,
    register: (acc) => { if (succeeds) registered.push(acc); return succeeds; },
    unregister: (acc) => { unregistered.push(acc); },
  };
}

describe('createHotkeyManager', () => {
  it('užregistruoja kombinaciją ir ją įsimena', () => {
    const api = fakeApi();
    const m = createHotkeyManager(api);
    expect(m.apply('Ctrl+Alt+Space', vi.fn())).toBe(true);
    expect(api.registered).toEqual(['Ctrl+Alt+Space']);
    expect(m.current()).toBe('Ctrl+Alt+Space');
  });

  it('keičiant kombinaciją seną atregistruoja', () => {
    const api = fakeApi();
    const m = createHotkeyManager(api);
    m.apply('Ctrl+Alt+Space', vi.fn());
    m.apply('Ctrl+Alt+T', vi.fn());
    expect(api.unregistered).toEqual(['Ctrl+Alt+Space']);
    expect(m.current()).toBe('Ctrl+Alt+T');
  });

  it('nepavykus registracijai grąžina false ir nieko neįsimena', () => {
    const m = createHotkeyManager(fakeApi(false));
    expect(m.apply('Ctrl+Alt+Space', vi.fn())).toBe(false);
    expect(m.current()).toBeNull();
  });

  it('dispose atregistruoja veikiančią kombinaciją', () => {
    const api = fakeApi();
    const m = createHotkeyManager(api);
    m.apply('Ctrl+Alt+Space', vi.fn());
    m.dispose();
    expect(api.unregistered).toEqual(['Ctrl+Alt+Space']);
  });
});
