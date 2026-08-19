import type { SettingsMap } from '../core/settings.js';

export function shouldPlaySound(setting: SettingsMap['sound'], kind: 'alarm' | 'digest'): boolean {
  if (setting === 'off') return false;
  if (setting === 'always') return true;
  return kind === 'alarm';
}
