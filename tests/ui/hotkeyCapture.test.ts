import { describe, expect, it } from 'vitest';
import { acceleratorFromEvent } from '../../src/ui/settings/hotkeyCapture.js';

const e = (over: Partial<Record<string, unknown>>) => ({
  ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, key: '', ...over,
}) as never;

describe('acceleratorFromEvent', () => {
  it('surenka modifikatorius nuoseklia tvarka', () => {
    expect(acceleratorFromEvent(e({ ctrlKey: true, altKey: true, key: ' ' }))).toBe('Ctrl+Alt+Space');
    expect(acceleratorFromEvent(e({ ctrlKey: true, shiftKey: true, key: 't' }))).toBe('Ctrl+Shift+T');
  });

  it('funkcinius klavišus perduoda kaip yra', () => {
    expect(acceleratorFromEvent(e({ altKey: true, key: 'F9' }))).toBe('Alt+F9');
  });

  it('be modifikatoriaus grąžina null', () => {
    expect(acceleratorFromEvent(e({ key: 'T' }))).toBeNull();
  });

  it('vien modifikatorius grąžina null', () => {
    expect(acceleratorFromEvent(e({ ctrlKey: true, key: 'Control' }))).toBeNull();
    expect(acceleratorFromEvent(e({ altKey: true, key: 'Alt' }))).toBeNull();
  });
});
