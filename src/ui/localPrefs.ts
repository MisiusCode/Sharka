import type { Priority } from '../core/types.js';

export interface LocalPrefs {
  priorities: Priority[];
  showDone: boolean;
}

const KEY = 'sarka.prefs';
const DEFAULTS: LocalPrefs = { priorities: [], showDone: false };

export function loadLocalPrefs(): LocalPrefs {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<LocalPrefs>;
    return {
      // Tikrinamas ne tik masyvo tipas, bet ir kiekvienas elementas: sugadintas
      // arba pasenęs localStorage įrašas kitaip nutekintų netikrus prioritetus
      // tiesiai į lentos filtrą.
      priorities: Array.isArray(parsed.priorities)
        ? parsed.priorities.filter((p): p is Priority => p === 1 || p === 2 || p === 3)
        : [],
      showDone: parsed.showDone === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLocalPrefs(prefs: LocalPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
