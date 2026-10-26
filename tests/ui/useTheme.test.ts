import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme } from '../../src/ui/useTheme.js';

beforeEach(() => { document.documentElement.removeAttribute('data-tema'); });

describe('applyTheme', () => {
  it('aiškų pasirinkimą užrašo atributu', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.tema).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.tema).toBe('light');
  });

  it('„pagal sistemą" atributą nuima, kad suveiktų prefers-color-scheme', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-tema')).toBe(false);
  });
});
