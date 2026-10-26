import type { SettingsMap } from '../core/settings.js';

export function applyTheme(theme: SettingsMap['theme']): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-tema');
    return;
  }
  document.documentElement.dataset.tema = theme;
}
